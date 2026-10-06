import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { createMailDatabase, MAIL_DATABASE } from './mail-database';

@Global()
@Module({
  providers: [
    { provide: MAIL_DATABASE, useFactory: createMailDatabase },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
