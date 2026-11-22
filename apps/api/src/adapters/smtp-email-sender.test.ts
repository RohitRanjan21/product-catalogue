import nodemailer from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';
import { UpstreamError } from '../errors';
import type { EmailMessage } from '../ports';
import { describeSmtpFailure, SmtpEmailSender, type MailTransport } from './smtp-email-sender';

const message: EmailMessage = {
  to: 'sales@example.com',
  replyTo: { name: 'Ada Lovelace', address: 'ada@example.com' },
  subject: 'Product enquiry: Cotton Jacket',
  text: 'Hello',
};

describe('SmtpEmailSender', () => {
  it('sends from the configured address', async () => {
    const transport = { sendMail: vi.fn<MailTransport['sendMail']>().mockResolvedValue({}) };
    await new SmtpEmailSender(transport, 'catalogue@example.com').send(message);
    expect(transport.sendMail).toHaveBeenCalledWith({ from: 'catalogue@example.com', ...message });
  });

  it('turns a transport failure into an UpstreamError with a safe message and a readable cause', async () => {
    // What nodemailer really throws when nothing listens on localhost (seen against a stopped Mailpit).
    const failure = Object.assign(
      new AggregateError(
        [new Error('connect ECONNREFUSED ::1:1025'), new Error('connect ECONNREFUSED 127.0.0.1:1025')],
        '',
      ),
      { code: 'ESOCKET' },
    );
    const transport = { sendMail: vi.fn<MailTransport['sendMail']>().mockRejectedValue(failure) };
    const error = await new SmtpEmailSender(transport, 'catalogue@example.com')
      .send(message)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UpstreamError);
    expect((error as UpstreamError).message).toBe('We could not send your enquiry. Please try again later.');
    expect(((error as UpstreamError).cause as Error).message).toBe(
      'SMTP send failed (ESOCKET): connect ECONNREFUSED ::1:1025; connect ECONNREFUSED 127.0.0.1:1025',
    );
  });

  it.each([
    [new Error('Greeting never received'), 'SMTP send failed: Greeting never received'],
    ['a string', 'SMTP send failed: a string'],
  ])('describes other failures: %s', (failure, expected) => {
    expect(describeSmtpFailure(failure).message).toBe(expected);
  });

  it('cannot be used to add headers through the reply-to name (checked with real nodemailer)', async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    let raw = '';
    const sender = new SmtpEmailSender(
      {
        sendMail: async (mail) => {
          const info = await transport.sendMail(mail);
          raw = Buffer.isBuffer(info.message) ? info.message.toString('utf8') : '';
          return info;
        },
      },
      'catalogue@example.com',
    );

    await sender.send({ ...message, replyTo: { name: 'Ada\r\nBcc: victim@example.com', address: 'ada@example.com' } });

    expect(raw).toMatch(/^To: sales@example\.com$/m);
    expect(raw).not.toMatch(/^Bcc:/im);
  });
});
