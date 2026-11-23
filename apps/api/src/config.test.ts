import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

describe('loadConfig', () => {
  it('runs locally with no environment at all', () => {
    const config = loadConfig({});
    expect(config.catalogue.featuredProductIds).toEqual([3, 5, 11, 12, 18]);
    expect(config.server).toEqual({ host: '127.0.0.1', port: 3000, logLevel: 'info', trustProxy: false });
    expect(config.smtp).toMatchObject({ host: 'localhost', port: 1025, secure: false });
    expect(config.smtp.auth).toBeUndefined();
    expect(config.fakeStore.cacheTtlMs).toBe(300_000);
  });

  it('parses featured ids with spaces, keeping their order', () => {
    expect(loadConfig({ FEATURED_PRODUCT_IDS: '18, 3,12 ,5,11' }).catalogue.featuredProductIds).toEqual([
      18, 3, 12, 5, 11,
    ]);
  });

  it.each([
    ['4 ids', '1,2,3,4', 'exactly 5'],
    ['6 ids', '1,2,3,4,5,6', 'exactly 5'],
    ['a repeated id', '1,2,3,4,4', 'repeat'],
    ['a non-number', '1,2,three,4,5', 'comma-separated'],
    ['a zero', '0,1,2,3,4', 'comma-separated'],
  ])('rejects featured ids with %s', (_label, value, message) => {
    expect(() => loadConfig({ FEATURED_PRODUCT_IDS: value })).toThrow(message);
  });

  it('treats empty values as unset', () => {
    const config = loadConfig({ SMTP_USER: '', SMTP_PASS: '', PORT: '' });
    expect(config.smtp.auth).toBeUndefined();
    expect(config.server.port).toBe(3000);
  });

  it('parses booleans and SMTP credentials', () => {
    const config = loadConfig({ TRUST_PROXY: 'true', SMTP_SECURE: 'true', SMTP_USER: 'u', SMTP_PASS: 'p' });
    expect(config.server.trustProxy).toBe(true);
    expect(config.smtp).toMatchObject({ secure: true, auth: { user: 'u', pass: 'p' } });
  });

  it('names the bad variable without echoing its value', () => {
    let error: unknown;
    try {
      loadConfig({ SALES_INBOX_EMAIL: 'not-an-email', SMTP_PORT: 'hunter2' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const { message } = error as ConfigError;
    expect(message).toContain('SALES_INBOX_EMAIL');
    expect(message).toContain('SMTP_PORT');
    expect(message).not.toContain('not-an-email');
    expect(message).not.toContain('hunter2');
  });

  it('requires SMTP_USER and SMTP_PASS together', () => {
    expect(() => loadConfig({ SMTP_USER: 'u' })).toThrow('set both SMTP_USER and SMTP_PASS');
  });
});
