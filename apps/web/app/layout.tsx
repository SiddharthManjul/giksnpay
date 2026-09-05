import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/manrope";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MindPay — authority for agent commerce", template: "%s · MindPay" },
  description:
    "A deterministic authority layer for AI agents that discover services, request approval, pay, and leave verifiable evidence.",
};

const directionContract = `<!--
THESIS: Agent commerce should read like a settlement ledger: every permission, movement, and proof stays visible; the generic floating-card dashboard is refused.
OWN-WORLD: Ink and cool-paper surfaces, one signal emerald, ruled evidence rows, 14px plates, compact controls, and tabular financial figures.
STORY: Understand the authority boundary, inspect what the agent may do, then act only on signed and server-verified facts.
FIRST VIEWPORT: Public entry pairs a decisive 64px proposition with a live authority rail; the app opens on a dense transaction ledger with the next valid action in the top bar. Motion: committed rows settle into place once.
FORM: Clearing-house settlement ledger, grounded candidate 5, seed 49b76e55.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="en">
      <body>
        <script
          dangerouslySetInnerHTML={{ __html: directionContract }}
          id="impeccable-direction-contract"
          type="application/json"
        />
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
