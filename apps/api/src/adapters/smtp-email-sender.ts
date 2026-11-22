import nodemailer, { type SendMailOptions } from 'nodemailer';
import type { Config } from '../config';
import { UpstreamError } from '../errors';
import type { EmailMessage, EmailSender } from '../ports';

/** The one nodemailer method we use, so tests can pass a fake or an in-memory transport. */
export interface MailTransport {
  sendMail(mail: SendMailOptions): Promise<unknown>;
}

export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
  ) {}

  static fromConfig(smtp: Config['smtp']): SmtpEmailSender {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      ...(smtp.auth ? { auth: smtp.auth } : {}),
      connectionTimeout: smtp.timeoutMs,
      greetingTimeout: smtp.timeoutMs,
      socketTimeout: smtp.timeoutMs,
    });
    return new SmtpEmailSender(transport, smtp.from);
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: message.to,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        subject: message.subject,
        text: message.text,
      });
    } catch (error) {
      throw new UpstreamError('We could not send your enquiry. Please try again later.', {
        cause: describeSmtpFailure(error),
      });
    }
  }
}

/**
 * Make the failure readable in logs. Connecting to "localhost" tries IPv6 and IPv4, and Node then
 * throws an AggregateError with an empty message, so the reasons live in `errors`. The customer's
 * address is only in the Reply-To header, never the SMTP envelope, so these messages can't echo it.
 */
export function describeSmtpFailure(error: unknown): Error {
  if (!(error instanceof Error)) return new Error(`SMTP send failed: ${String(error)}`);
  const code = 'code' in error && typeof error.code === 'string' ? ` (${error.code})` : '';
  const reasons =
    error instanceof AggregateError && error.errors.length > 0
      ? error.errors.map((e: unknown) => (e instanceof Error ? e.message : String(e))).join('; ')
      : error.message;
  return new Error(`SMTP send failed${code}: ${reasons || error.name}`, { cause: error });
}
