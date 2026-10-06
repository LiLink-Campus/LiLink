import { connect, type Socket } from 'node:net';
import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { OutboundEmailMessageCategory } from '../prisma/client';
import type { OutboundEmailRecord } from './mail-content';

export class MailTransport {
  private sockets = new Set<Socket>();
  private transporter = this.createTransport();
  private stopped = false;

  private createTransport() {
    return nodemailer.createTransport({
      pool: true,
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
      maxConnections: env.SMTP_MAX_CONNECTIONS,
      maxMessages: env.SMTP_MAX_MESSAGES,
      connectionTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: env.SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: env.SMTP_SOCKET_TIMEOUT_MS,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
      getSocket: (_options, callback) => {
        const socket = connect(env.SMTP_PORT, env.SMTP_HOST);
        this.sockets.add(socket);
        socket.once('close', () => this.sockets.delete(socket));
        const onError = (error: Error) => callback(error, undefined);
        socket.once('error', onError);
        socket.once('connect', () => {
          socket.removeListener('error', onError);
          callback(null, { connection: socket });
        });
      },
    });
  }

  async send(email: OutboundEmailRecord) {
    if (this.stopped) throw new Error('SMTP transport is closed.');
    const transport = this.transporter;
    const bulk = email.messageCategory === OutboundEmailMessageCategory.BULK;
    const from =
      (bulk ? env.SMTP_FROM_BULK : env.SMTP_FROM_TRANSACTIONAL).trim() ||
      env.SMTP_FROM;
    const headers: Record<string, string> = bulk
      ? {
          'Content-Language': 'zh-CN',
          'X-Entity-Ref-ID': 'lilink-bulk',
        }
      : {
          'Auto-Submitted': 'auto-generated',
          'X-Auto-Response-Suppress': 'All',
          'X-Entity-Ref-ID': 'lilink-transactional',
          'Content-Language': 'zh-CN',
        };
    if (bulk && env.MAIL_LIST_UNSUBSCRIBE_URL)
      headers['List-Unsubscribe'] = `<${env.MAIL_LIST_UNSUBSCRIBE_URL}>`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        transport.sendMail({
          from,
          to: email.recipientEmail,
          subject: email.subject,
          html: email.html,
          text: email.text ?? undefined,
          headers,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            // Pool.close only removes idle sockets; destroy tracked sockets too.
            // A deadline aborts this pool's other sends, which retain CAS retries.
            if (this.transporter === transport) {
              this.abort();
              if (!this.stopped) this.transporter = this.createTransport();
            }
            reject(new Error('SMTP transport deadline exceeded.'));
          }, env.OUTBOUND_EMAIL_SMTP_TIMEOUT_MS);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  close() {
    this.stopped = true;
    this.abort();
  }

  private abort() {
    this.transporter.close?.();
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
  }
}
