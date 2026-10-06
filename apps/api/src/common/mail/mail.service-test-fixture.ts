export const sendMail = jest.fn();
export const createTransport = jest.fn(() => ({
  sendMail,
}));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport,
  },
}));

import { MailService } from './mail.service';

type OutboundEmailStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'EXHAUSTED';

export function buildOutboundEmail(
  overrides: Partial<{
    id: string;
    dedupeKey: string;
    recipientEmail: string;
    subject: string;
    html: string;
    text: string | null;
    messageCategory: 'TRANSACTIONAL' | 'BULK';
    status: OutboundEmailStatus;
    attempts: number;
    maxAttempts: number;
    lastAttemptAt: Date | null;
    nextAttemptAt: Date | null;
  }> = {},
) {
  return {
    id: 'email-1',
    dedupeKey: 'verification-code:code-1',
    recipientEmail: 'user@example.com',
    subject: 'Subject',
    html: '<p>Hello</p>',
    text: null,
    messageCategory: 'TRANSACTIONAL' as const,
    status: 'PENDING' as OutboundEmailStatus,
    attempts: 0,
    maxAttempts: 3,
    lastAttemptAt: null,
    nextAttemptAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createMailService(
  overrides: {
    emailCode?: {
      updateMany?: jest.Mock;
    };
    outboundEmail?: {
      findMany?: jest.Mock;
      findUnique?: jest.Mock;
      updateMany?: jest.Mock;
    };
  } = {},
) {
  const outboundEmail = {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    ...overrides.outboundEmail,
  };
  const store = {
    emailCode: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'code-1',
        email: 'user@example.com',
        purpose: 'REGISTER',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 600_000),
      }),
      findFirst: jest.fn().mockResolvedValue({ id: 'code-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      ...overrides.emailCode,
    },
    outboundEmail,
    $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        ...store,
        $queryRaw: jest.fn().mockResolvedValue([]),
        $executeRaw: async () =>
          ((await outboundEmail.updateMany()) as { count: number }).count,
        outboundEmail: {
          ...outboundEmail,
          findUnique: async ({ where }: { where: { id: string } }) => {
            const read = outboundEmail.findUnique;
            for (const result of [...read.mock.results].reverse()) {
              const prior = (await result.value) as ReturnType<
                typeof buildOutboundEmail
              > | null;
              if (prior?.id === where.id) return prior;
            }
            const rows = (await outboundEmail.findMany.mock.results.at(-1)
              ?.value) as
              | Array<ReturnType<typeof buildOutboundEmail>>
              | undefined;
            return rows?.find((row) => row.id === where.id) ?? null;
          },
        },
      }),
  };
  return new MailService(store as never);
}
