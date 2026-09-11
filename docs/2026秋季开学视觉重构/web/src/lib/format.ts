/** Convert cents to yuan string, e.g. 100 → "1.00". */
export function formatYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}
