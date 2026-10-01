---
name: Torque
description: A compact desktop shell for a local torrent transfer queue.
colors:
  window: "#0d100f"
  rail: "#101412"
  panel: "#111614"
  border: "#252d29"
  border-soft: "#1c2420"
  text: "#e6ece8"
  muted: "#a2ada6"
  subtle: "#829088"
  accent: "#b7e98b"
  accent-ink: "#12200d"
  danger: "#ed928a"
typography:
  display:
    fontFamily: "Inter Variable, Inter, Segoe UI, sans-serif"
    fontSize: "clamp(27px, 3vw, 34px)"
    fontWeight: 590
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Inter Variable, Inter, Segoe UI, sans-serif"
    fontSize: "21px"
    fontWeight: 620
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Inter Variable, Inter, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 650
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter Variable, Inter, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter Variable, Inter, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.035em"
  action:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 650
    lineHeight: 1.5
rounded:
  control: "9px"
  panel: "15px"
components:
  button-primary-disabled:
    backgroundColor: "#78925f"
    textColor: "#10190d"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "0 13px"
    height: "38px"
  card-queue:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
  nav-current:
    backgroundColor: "#19201b"
    textColor: "#e5eee6"
    rounded: "{rounded.control}"
    height: "39px"
  button-icon-retry:
    backgroundColor: "transparent"
    textColor: "#f0b3ad"
    rounded: "6px"
    height: "23px"
    width: "23px"
  button-icon-retry-hover:
    backgroundColor: "#412a28"
---

# Design System: Torque

## Overview

**Creative North Star: “Initial Queue Shell (working visual reference; provisional and descriptive)”**

This name describes the first implemented surface; it is not an approved brand metaphor or differentiated product identity. The current shell uses quiet, green-tinted dark surfaces, fine borders, compact labels, and a single soft-lime accent. Inter Variable carries the interface from the small sidebar labels to the centered empty-queue message.

The layout gives the library a narrow persistent rail and lets the queue occupy the rest of the native window. The first version is intentionally an honest empty state: its Add torrent control is disabled because download support and a torrent engine are not implemented. Keep future screens consistent with these observed choices until a broader visual direction is established.

**Key Characteristics:**
- Dark, subtly green-tinted neutral surfaces.
- Compact desktop spacing with a persistent library rail.
- Fine borders and gently rounded panels and controls.
- Soft lime reserved for key identity, current, ready, and action cues.
- Clear empty-queue and backend connection states.

## Colors

The palette is built from near-black green neutrals, quiet gray-green text, a restrained lime accent, and a warm error color. The frontmatter is the normative source for exact values.

### Primary
- **Soft Lime** (`colors.accent`): Brand mark, active library indicator, connected state, focus outline, selection, and the action's underlying surface.

### Secondary
- **Warm Error Coral** (`colors.danger`): Backend connection failure indicator.

### Neutral
- **Deep Green Ink** (`colors.accent-ink`): Foreground for selected text on lime-tinted selections and the action's underlying surface.
- **Deep Evergreen Window** (`colors.window`): Main desktop canvas, body background, and scrollbar track.
- **Evergreen Rail** (`colors.rail`): Sidebar surface, separated from the workspace by a subtle divider.
- **Quiet Evergreen Panel** (`colors.panel`): Main queue container surface.
- **Soft Graphite Border** (`colors.border`): Outer edge of the queue panel.
- **Low Contrast Divider** (`colors.border-soft`): Sidebar separation and understated status outline.
- **Warm Mist Text** (`colors.text`): Primary labels and headings.
- **Muted Sage Text** (`colors.muted`): Secondary descriptions and metadata.
- **Subtle Sage Text** (`colors.subtle`): Small section labels and supporting notes.

### Named Rules
**The Accent Mark Rule.** Keep lime to the brand mark, current or ready indicators, focus treatment, and the primary action surface; it is a cue within the neutral shell, not a broad decoration.

## Typography

**Display Font:** Inter Variable (with Inter, Segoe UI, and sans-serif fallbacks)
**Body Font:** Inter Variable (with Inter, Segoe UI, and sans-serif fallbacks)
**Label/Mono Font:** Inter Variable with tabular numerals for compact counts and build metadata.

**Character:** A single variable sans-serif family keeps the interface restrained and legible. Tight tracking distinguishes large headings; tabular numerals make small counts and version metadata steady.

### Hierarchy
- **Display** (weight 590, responsive 27–34px, line-height 1.2): Centered empty-queue heading.
- **Headline** (weight 620, 21px, line-height 1.25): Workspace title.
- **Title** (weight 650, 15px): Product name in the rail.
- **Body** (weight 400, 13px, line-height 1.5): Descriptions and normal interface copy.
- **Label** (weight 600, 11px, letter-spacing 0.035em): Sidebar section labels and compact metadata.
- **Action** (weight 650, 12px, line-height 1.5): Compact button text.

### Named Rules
**The Single-Family Rule.** Keep display, body, and labels in the same sans-serif family; distinguish hierarchy with size, weight, and tracking.

## Layout

Use a desktop-first two-column shell: a persistent sidebar beside a flexible workspace. The sidebar starts at 228px and narrows to 205px at the 1040px CSS breakpoint; the workspace uses about 30px of outer padding, reducing to about 23px at that breakpoint. The centered queue state sits inside a flexible, full-height panel. The title scales within the empty state, while its copy stays constrained to a short readable measure.

The native window opens at 1180 × 760px, can be resized, and has a 900 × 620px minimum. Treat this as a desktop layout; there is no phone or narrow-window composition in the current build.

## Elevation & Depth

The shell is flat: the stylesheet defines no shadows. Depth comes from small shifts between the window, rail, and panel surfaces, plus low-contrast borders. Keep separation tonal and structural instead of lifting cards with shadow.

### Named Rules
**The Flat Surface Rule.** Use surface tone and a restrained border to separate regions; do not add card shadows to the current flat shell.

## Shapes

Panels use gently rounded corners (15px) and controls use a tighter radius (9px). Status indicators use a capsule silhouette; tiny signal nodes remain circular. One-pixel dividers define region boundaries without heavy outlines. Keep these shapes contained and quiet.

## Components

### Buttons
- **Shape:** Gently rounded control corners (9px).
- **Primary:** The Add torrent action has a lime surface, dark foreground, compact horizontal padding (13px), and a 38px minimum height.
- **Disabled:** It is visibly muted and non-interactive while download support is absent; the explanatory note states why.
- **Icon retry:** The backend error state uses a transparent compact control; hover adds a dark warm tint.
- **Hover / Focus:** The disabled button has no hover behavior. Keyboard focus uses a visible two-pixel accent outline with a three-pixel offset on focusable controls.

### Chips
- **Style:** The desktop-core status is a compact outlined capsule with a small state dot and understated text.
- **State:** Ready uses the accent dot and a restrained pulse; error uses warm coral text and border, with a retry control.

### Cards / Containers
- **Corner Style:** The queue panel uses 15px corners.
- **Background:** Use the panel surface against the deeper window canvas.
- **Shadow Strategy:** Flat; rely on surface tone and a fine border.
- **Border:** A single subtle outline defines the queue panel.
- **Internal Padding:** The queue empty state has a centered content width capped at 420px with flexible side gutters.

### Navigation
- **Style:** A 228px desktop rail (205px at the compact breakpoint) with a small product mark, Library label, and one current item. The current item has a rounded tinted background, thin outline, lime icon, and trailing count. The download-folder location and build metadata sit at the bottom, separated by a quiet divider.

### Empty Queue
The transfer panel centers a simple linear signal motif, a large clear heading, one short explanation, the disabled Add torrent action, and its availability note. Keep this as an honest first-run state; no transfer rows or download activity exist yet.

## Do's and Don'ts

### Do:
- **Do** keep the shell dark and the surfaces subtly green-tinted.
- **Do** reserve the lime accent for identity, status, focus, selection, and the action surface.
- **Do** maintain the compact rail-and-workspace layout and restrained border language.
- **Do** state clearly that Add torrent is unavailable while download support is absent.
- **Do** preserve a visible keyboard focus outline and reduced-motion behavior.

### Don't:
- **Don't** present torrent activity or queue rows that the application does not provide.
- **Don't** make the disabled Add torrent control look ready to activate.
- **Don't** add decorative clutter, heavy shadows, or loud outlines to the flat shell.
- **Don't** introduce a separate display typeface without an established visual direction.
