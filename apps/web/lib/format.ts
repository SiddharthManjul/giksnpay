export function formatInr(subunits: number): string {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(subunits / 100);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./u, (letter) => letter.toUpperCase());
}

export function shortId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
