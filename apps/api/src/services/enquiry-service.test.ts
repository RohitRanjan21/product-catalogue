import { describe, expect, it } from 'vitest';
import { fixtureProducts, InMemoryProductSource, makeProduct, RecordingEmailSender } from '../../test/fakes';
import { UpstreamError, ValidationError } from '../errors';
import { buildEnquiryEmail, EnquiryService } from './enquiry-service';

const enquiry = { productId: 3, name: 'Ada Lovelace', email: 'ada@example.com' };

function setup() {
  const emailSender = new RecordingEmailSender();
  const service = new EnquiryService({
    productSource: new InMemoryProductSource(),
    emailSender,
    salesInboxEmail: 'sales@example.com',
    newId: () => 'enquiry-1',
  });
  return { service, emailSender };
}

describe('EnquiryService.submit', () => {
  it('sends one email to the sales inbox and returns the enquiry id', async () => {
    const { service, emailSender } = setup();
    await expect(service.submit(enquiry)).resolves.toEqual({ enquiryId: 'enquiry-1' });
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]).toMatchObject({
      to: 'sales@example.com',
      replyTo: { name: 'Ada Lovelace', address: 'ada@example.com' },
      subject: 'Product enquiry: Cotton Jacket',
    });
  });

  it('rejects an unknown product without sending email', async () => {
    const { service, emailSender } = setup();
    const error = await service.submit({ ...enquiry, productId: 999 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues).toEqual([
      { path: 'productId', message: 'This product is no longer available' },
    ]);
    expect(emailSender.sent).toEqual([]);
  });

  it('lets an email provider failure through as UpstreamError', async () => {
    const { service, emailSender } = setup();
    emailSender.failWith = new UpstreamError('We could not send your enquiry.');
    await expect(service.submit(enquiry)).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe('buildEnquiryEmail', () => {
  const product = fixtureProducts[2]!;

  it('includes the product from our catalogue and every contact field', () => {
    const email = buildEnquiryEmail({
      enquiryId: 'enquiry-1',
      enquiry: { ...enquiry, phone: '0412 345 678', message: 'Is this in stock?' },
      product,
      to: 'sales@example.com',
    });
    expect(email.text).toContain('Product: Cotton Jacket (id 3)');
    expect(email.text).toContain('Price: $13.00');
    expect(email.text).toContain('Name: Ada Lovelace');
    expect(email.text).toContain('Email: ada@example.com');
    expect(email.text).toContain('Phone: 0412 345 678');
    expect(email.text).toContain('Is this in stock?');
    expect(email.text).toContain('Enquiry id: enquiry-1');
  });

  it('says when optional fields were not given', () => {
    const email = buildEnquiryEmail({ enquiryId: 'e', enquiry, product, to: 'sales@example.com' });
    expect(email.text).toContain('Phone: Not given');
    expect(email.text).toContain('No message');
  });

  it('keeps the subject and reply-to name on one line', () => {
    const email = buildEnquiryEmail({
      enquiryId: 'e',
      enquiry: { ...enquiry, name: 'Ada\r\nBcc: victim@example.com' },
      product: makeProduct(1, product.category, 4, 1, { title: 'Line one\nLine two' }),
      to: 'sales@example.com',
    });
    expect(email.subject).toBe('Product enquiry: Line one Line two');
    expect(email.replyTo?.name).toBe('Ada Bcc: victim@example.com');
  });
});
