export function serverUrl(): string {
  return process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
}

export function formatFee(cents: number): string {
  if (!cents) return "Free entry";
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)} per team`;
}
