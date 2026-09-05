---
name: MindPay
description: A clearing-house settlement ledger for deterministic agent-commerce authority.
colors:
  ink: "#13211a"
  ink-soft: "#526158"
  paper: "#f4f6f2"
  paper-deep: "#e9ede7"
  plate: "#fbfcfa"
  line: "#ccd4ce"
  line-strong: "#aebbb2"
  signal: "#087a4f"
  signal-deep: "#075c3d"
  signal-soft: "#dcefe5"
  warning: "#8a5a00"
  warning-soft: "#f8eccf"
  danger: "#a33232"
  danger-soft: "#f8dddd"
  info: "#315c8a"
  info-soft: "#e1eaf4"
  focus: "#58a981"
  on-dark: "#ffffff"
typography:
  display:
    fontFamily: '"Manrope Variable", "Avenir Next", sans-serif'
    fontSize: "clamp(3.5rem, 6.4vw, 5.9rem)"
    fontWeight: 680
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  headline:
    fontFamily: '"Manrope Variable", "Avenir Next", sans-serif'
    fontSize: "clamp(2.2rem, 4vw, 4rem)"
    fontWeight: 680
    lineHeight: 1.03
    letterSpacing: "-0.035em"
  body:
    fontFamily: '"Manrope Variable", "Avenir Next", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
  control:
    fontFamily: '"Manrope Variable", "Avenir Next", sans-serif'
    fontSize: "14px"
    fontWeight: 720
    lineHeight: 1
  label:
    fontFamily: '"Manrope Variable", "Avenir Next", sans-serif'
    fontSize: "10px"
    fontWeight: 720
    lineHeight: 1
    letterSpacing: "0.06em"
  data:
    fontFamily: '"JetBrains Mono Variable", monospace'
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.025em"
rounded:
  index: "8px"
  control: "10px"
  feedback: "12px"
  plate: "14px"
  board: "16px"
  pill: "999px"
spacing:
  compact: "8px"
  control: "10px"
  row: "16px"
  panel: "20px"
  section: "24px"
  page: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-dark}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "42px"
  button-signal:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.on-dark}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "42px"
  button-secondary:
    backgroundColor: "{colors.paper-deep}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "42px"
  plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "20px"
  input:
    backgroundColor: "{colors.on-dark}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "44px"
  badge-pass:
    backgroundColor: "{colors.signal-soft}"
    textColor: "{colors.signal-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 9px"
    height: "25px"
---

# Design System: MindPay

## Overview

**Creative North Star: "The Clearing-House Settlement Ledger"**

MindPay should read as a financial record in active use: cool paper, dark ink, ruled evidence rows,
compact controls, and one emerald signal for valid progress. Permission, movement, and proof stay
visible together. The system is calm and exact, never a generic floating-card dashboard.

Every surface should tell the same three-part story: establish the authority boundary, make the
agent's current permission inspectable, then offer action only when signed or server-verified facts
support it. Public pages can be spacious and declarative; authenticated pages become denser, but
both retain the same ledger grammar.

**Key Characteristics:**

- Cool paper and ink with one scarce action color.
- Ruled rows and registers instead of tile mosaics.
- Compact controls, 14px application plates, and tabular financial figures.
- Explicit authority, state, and evidence language at the point of action.
- CSS, vector icons, and self-hosted type only; raster imagery is not part of this world.

## Colors

The palette is predominantly neutral. Emerald is a semantic signal, not decoration.

### Primary

- **Authority Ink:** Default text, dark rails, primary navigation actions, and current-state marks.
- **Signal Emerald:** The single high-attention color for canonical next actions, verified progress,
  active controls, and small focal phrases.

### Neutral

- **Cool Paper:** The page ground. Keep it visible between regions so the interface reads as one
  ledger rather than a pile of cards.
- **Deep Paper:** Selected navigation, secondary actions, tracks, and quiet grouping.
- **Ledger Plate:** Contained working surfaces such as panels, authority boards, and action bars.
- **Soft Ink:** Supporting copy, metadata, timestamps, and labels that remain readable but recede.
- **Rule / Strong Rule:** Ordinary row dividers and section boundaries. Prefer rules to extra
  containers.

### Semantic

- **Pass:** Signal-soft ground with signal-deep text and a check icon.
- **Warning:** Warning-soft ground with warning text and an alert icon.
- **Failure:** Danger-soft ground with danger text and an X or alert icon.
- **Information:** Info-soft ground with info text and an information icon.
- **Neutral / in progress:** Deep-paper ground with ink-soft text and a dashed-circle icon.

**The One Signal Rule.** Emerald may indicate a verified state or the next valid action; it must not
be scattered across decorative surfaces.

**The State Is More Than Color Rule.** Every status pairs color with explicit text and an icon or
shape. Never encode authority, risk, or payment state with hue alone.

## Typography

**Display and Body Font:** Manrope Variable, self-hosted, with Avenir Next and sans-serif fallbacks.

**Data Font:** JetBrains Mono Variable, self-hosted, with a monospace fallback.

Manrope gives the product a direct contemporary voice without weakening its financial seriousness.
JetBrains Mono separates identifiers, exact amounts, sequence numbers, hashes, and other evidence
from explanatory prose. Enable tabular numerals wherever figures compare vertically.

### Hierarchy

- **Display:** Reserved for the public proposition. It is tight, heavy, and balanced across short
  lines; the emerald phrase may carry the decisive clause.
- **Headline:** Page and section titles. Keep them declarative and compact rather than promotional.
- **Body:** Default reading text. Long explanatory copy should stay near 60–68 characters per line.
- **Control:** Buttons and high-confidence actions; sentence case, compact, and strongly weighted.
- **Label:** Table headings and dense metadata. Uppercase is appropriate only for short ledger labels.
- **Data:** IDs, prices, currency totals, sequence numbers, hashes, and machine-derived values.

**The Exact Figure Rule.** Money and evidence identifiers use the data face and tabular numerals;
do not style financial figures as approximate editorial copy.

## Layout

Public surfaces use a centered 1184px content field; navigation may extend to 1240px. The opening
viewport pairs a decisive proposition with a clearly labeled example authority rail. Follow-on
content uses asymmetric two-column headings and full-width ruled rows, not repeated card grids.

Authenticated surfaces use a 248px sticky sidebar beside a main work area capped at 1440px. A 68px
sticky top bar names the current domain and exposes only the canonical next valid action. The first
working region is the transaction ledger; metrics and configuration paths follow it. Use 18px gaps
between related plates, 28–40px between major regions, and rules inside a plate to preserve density.

### Responsive Rules

- At 980px and below, public two-column compositions stack, the application sidebar disappears,
  and the five primary destinations move to a persistent bottom bar.
- At 640px and below, use 18px page gutters. Headings, forms, service rows, proposals, decision
  lines, action bars, and evidence callouts become one column.
- Metric strips become two columns on small screens; proof grids become one. Wide data tables keep
  their semantic columns and scroll horizontally instead of compressing values into ambiguity.
- Buttons become full width only when their containing action group stacks. The public primary and
  secondary actions may remain content-width when space allows.
- Keep the authority sequence intact on mobile: index and description lead, status moves beneath the
  description, and no row is reordered.

**The Ledger Before Tiles Rule.** When information shares a sequence, authority chain, or comparison
axis, use a ruled list or table before considering a grid of standalone containers.

## Elevation & Depth

The system is flat by default. Paper contrast and 1px rules create structure; shadows appear only on
meaningful plates, the selected desktop navigation item, and high-priority actions. Standard plates
use a restrained low shadow, while the public authority board and action bar may use the stronger
ambient shadow. Never stack shadowed plates inside shadowed plates.

Motion follows the same discipline: hover transitions run for roughly 140–200ms, and authority rows
may settle into place once with a 560ms committed reveal. No looping decorative motion is allowed.
Loading spinners are the only continuous animation, and all animation and nonessential transition
must stop under `prefers-reduced-motion`.

**The Proof Does Not Float Rule.** Elevation may clarify interaction priority; it must never imply
that canonical evidence is detached from the ledger that produced it.

## Shapes

Application panels use gently rounded 14px plates. The public authority board may expand to 16px as
the signature first-viewport object. Inputs and navigation items use 10px corners; sequence indices
use 8px; feedback containers use 12px. Buttons, badges, and meter tracks are fully pill-shaped. The
brand mark is a compact shield plate with one tightened lower corner, not a generic circle.

Borders are functional and quiet. A stronger top border can mark the active edge of an action or
state rail, but decorative outlines and nested boxes should be avoided.

## Components

### Buttons

- **Primary:** Ink fill for navigation-level actions such as opening the demo.
- **Signal:** Emerald fill for the single next valid or verified action in a region.
- **Secondary:** Deep-paper fill for inspection, cancellation, and non-authorizing alternatives.
- **Danger:** Danger-soft fill with explicit destructive language; never rely on red alone.
- **Behavior:** Minimum 42px height on public surfaces and 36px only in the compact app top bar.
  Hover may lift by 1px. Visible keyboard focus always uses the 3px focus outline with 3px offset.

### Plates, Ledgers, and Tables

- **Plate:** A 14px ledger surface with a compact header and 20px working inset.
- **Ledger row:** A single rule-separated record with title, supporting fact, exact value, and state.
- **Data table:** Uppercase 10px headers, 13px body rows, horizontal overflow on narrow screens, and
  mono styling for IDs and currency figures.
- **Authority rail:** Ordered indices, plain-language checks, and explicit state badges. Labels such
  as “Example” must distinguish illustrative facts from live canonical state.

### Inputs and Forms

Fields use white fill, a strong neutral border, 10px corners, and at least 44px height. Labels sit
above controls and helper text explains constraints before submission. Hover may strengthen the
border; keyboard focus uses the global focus outline. Error messages identify the violated rule,
actual value, expected value, and recovery path when those facts are available.

### State and Feedback

Badges are compact pills with an icon plus unambiguous text. Alerts use the same semantic color
families at a larger scale. Loading copy names the verified work underway (“Reconciling workspace
totals”), and empty states explain the real precondition that creates data; never fabricate rows to
make a surface look complete.

### Navigation

Desktop workspace navigation is a quiet sticky rail with a plate-backed current item. At tablet and
mobile sizes it becomes a labeled bottom bar, retaining icons and `aria-current`. Public navigation
hides secondary links on small screens but keeps the brand and primary demo action visible.

### Trusted-Data Boundary

Render authority, policy, payment, entitlement, verification, and audit state only from validated
server responses or signed evidence. Model output may explain intent or discovery, but it never
chooses a status color, enables an authorizing control, computes entitlement, or declares success.
Clearly label examples, test mode, stale/offline state, redaction, and pending verification.
Sensitive payment details, signing material, webhook secrets, passkey challenges, prompts, and raw
provider payloads must never appear in UI text, data attributes, client logs, or illustrative rows.

## Do's and Don'ts

### Do:

- **Do** show the authority boundary before or beside the action it governs.
- **Do** keep permission, movement, and proof connected through ordered rows, rails, and timelines.
- **Do** place the canonical next valid action in a stable, predictable location.
- **Do** use exact integer-derived money formatting, UTC-derived times, mono IDs, and explicit state
  labels from validated contracts.
- **Do** preserve keyboard navigation, the skip link, visible focus, readable contrast, semantic
  headings and tables, reduced motion, and icon-plus-text status cues.
- **Do** use Lucide-style vector icons and self-hosted Manrope / JetBrains Mono; keep shipping UI
  CSS, vector, and type only.

### Don't:

- **Don't** build generic floating-card dashboards, bento mosaics, ornamental gradients, or
  decorative data visualizations.
- **Don't** use emerald as ambient branding or celebrate an unverified, pending, or model-proposed
  outcome.
- **Don't** hide policy, approval, payment, fulfilment, or evidence transitions behind optimistic
  copy or a single opaque progress indicator.
- **Don't** let model-generated content determine authorization, state semantics, controls,
  entitlement, verification, or audit claims.
- **Don't** invent critical-path data, social proof, payment claims, merchant verification, or
  evidence records.
- **Don't** introduce raster imagery unless the design direction is explicitly revised and the new
  asset is recorded with complete provenance.
