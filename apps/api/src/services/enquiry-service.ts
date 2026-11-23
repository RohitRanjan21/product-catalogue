import { randomUUID } from 'node:crypto';
import type { EnquiryRequest, EnquiryResponse } from '@catalogue/contracts';
import { ValidationError } from '../errors';
import type { EmailMessage, EmailSender, ProductSource, SourceProduct } from '../ports';

export interface EnquiryServiceDeps {
  productSource: ProductSource;
  emailSender: EmailSender;
  salesInboxEmail: string;
  newId?: () => string;
}

/** Turns a validated enquiry into one email to the sales inbox (A4, A5). Nothing is stored. */
export class EnquiryService {
  private readonly newId: () => string;

  constructor(private readonly deps: EnquiryServiceDeps) {
    this.newId = deps.newId ?? randomUUID;
  }

  async submit(enquiry: EnquiryRequest): Promise<EnquiryResponse> {
    // Look the product up ourselves: the email shows our title and price, never the client's.
    const product = await this.deps.productSource.getProduct(enquiry.productId);
    if (!product) {
      throw new ValidationError([{ path: 'productId', message: 'This product is no longer available' }]);
    }

    const enquiryId = this.newId();
    await this.deps.emailSender.send(
      buildEnquiryEmail({ enquiryId, enquiry, product, to: this.deps.salesInboxEmail }),
    );
    return { enquiryId };
  }
}

interface EnquiryEmailInput {
  enquiryId: string;
  enquiry: EnquiryRequest;
  product: SourceProduct;
  to: string;
}

/** Plain text only, so there is no HTML to escape and nothing a customer can inject into markup. */
export function buildEnquiryEmail({ enquiryId, enquiry, product, to }: EnquiryEmailInput): EmailMessage {
  const title = oneLine(product.title);
  return {
    to,
    replyTo: { name: oneLine(enquiry.name), address: enquiry.email },
    subject: `Product enquiry: ${title}`,
    text: [
      'A customer has sent an enquiry from the product catalogue.',
      '',
      `Product: ${title} (id ${product.id})`,
      `Price: $${product.price.toFixed(2)}`,
      '',
      `Name: ${enquiry.name}`,
      `Email: ${enquiry.email}`,
      `Phone: ${enquiry.phone ?? 'Not given'}`,
      '',
      'Message:',
      enquiry.message ?? 'No message',
      '',
      `Enquiry id: ${enquiryId}`,
    ].join('\n'),
  };
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
