import { PRODUCT_NAME } from "@/lib/product";

const controlPoints = [
  "Verified merchants and signed offers",
  "User-owned spending mandates",
  "Deterministic payment policy",
  "Single-use service entitlements",
  "Cryptographically verifiable evidence",
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16 sm:px-10">
      <p className="mb-6 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
        Trust layer for autonomous agents
      </p>
      <h1 className="max-w-4xl text-5xl font-semibold leading-[1.04] tracking-[-0.04em] sm:text-7xl">
        {PRODUCT_NAME} keeps AI useful without giving it unchecked authority over money.
      </h1>
      <p className="mt-8 max-w-2xl text-lg leading-8 text-[var(--muted)]">
        Agents can discover, compare, and propose. Verified code controls approval, payment,
        fulfilment, and evidence.
      </p>
      <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2">
        {controlPoints.map((point) => (
          <li className="bg-[var(--surface)] px-6 py-5 text-sm font-medium" key={point}>
            {point}
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-[var(--muted)]">Razorpay Test Mode build in progress.</p>
    </main>
  );
}
