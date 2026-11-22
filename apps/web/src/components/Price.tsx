// Prices are shown as the source gives them, with a dollar sign (DECISIONS.md A7).
const formatter = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

export function formatPrice(amount: number): string {
  return formatter.format(amount);
}

export function Price({ amount, className = 'price' }: { amount: number; className?: string }) {
  return <span className={className}>{formatPrice(amount)}</span>;
}
