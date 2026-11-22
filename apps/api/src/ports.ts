import type { Category, Product } from '@catalogue/contracts';

/**
 * Where products come from. Today: Fake Store. Tomorrow: a PIM, a database, a search engine.
 * Services depend on this interface only; upstream shapes are mapped inside the adapter.
 */
export interface ProductSource {
  listProducts(): Promise<Product[]>;
  listCategories(): Promise<Category[]>;
  /** Resolves to undefined when the product does not exist. */
  getProduct(id: number): Promise<Product | undefined>;
}

export interface EmailMessage {
  to: string;
  replyTo?: { name: string; address: string };
  subject: string;
  text: string;
}

/** How email leaves the system. Today: SMTP (Mailpit locally). Tomorrow: SES or another provider. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** The slice of a pino logger that services and adapters use, so they don't depend on Fastify. */
export interface Logger {
  info(details: object, message: string): void;
  warn(details: object, message: string): void;
  error(details: object, message: string): void;
}
