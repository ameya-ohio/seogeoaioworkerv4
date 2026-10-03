# Operator app redesign: design direction and ideas

## Context

`apps/web` works, but it doesn't look designed:
- **Styling:** system sans font, slate and indigo colors, and 17 different stage colors. No icons; Unicode arrows stand in for them. No dark mode.
- **Interactions:** confirmations and prompts use native `window.confirm` and `window.prompt`. Lowercase text links ("open", "review", "retry") act as buttons.
- **Duplicated pieces:** filter chips are hand-written in at least 5 places, and there are 2 badge shapes, 3 empty-state styles, 4 copies of the event log and 2 copies of the progress bar.
- **No primitives library:** the only shared UI file is `src/components/ui.tsx`. shadcn, Radix, lucide and motion are not installed.
- **Navigation:** the app starts at `/strategy` and has 6 sections of equal weight. The work that actually needs a person (answering interviews, reviewing drafts, shipping releases) has no home.

The goal is an app that feels calm, deliberate and beautiful, in the spirit of Apple's design. Every screen should answer "what needs me?" first.

**Decisions so far** (2026-10-03):
- Start with this direction document; the build follows the order in section 7.
- Dark mode follows the system setting.
- A new **Today** home page and a grouped sidebar.
- System font: SF Pro and SF Mono.

---

## 1. Principles (Apple's, applied to this app)

1. **The content leads.** The article, the interview and the plan are the subject. The app's frame (borders, labels, color) steps back. Fewer boxes; more white space and type hierarchy.
2. **One primary action per screen.** Each view has one obvious next step. Everything else goes into a menu. The primary button changes as the state changes; it doesn't sit alongside six other buttons.
3. **Color carries meaning, not decoration.** The interface is neutral grays plus one accent. Status colors are reserved for the five states a person cares about.
4. **Depth instead of lines.** Layers are separated by translucent materials, soft shadows and hairline dividers, not 1px slate borders around everything.
5. **Motion that explains.** Sheets slide in from where they belong, a row that changed flashes briefly, and the current phase pulses. Nothing moves without a reason, and everything respects `prefers-reduced-motion`.
6. **Quiet confidence in copy.** Sentence case, verbs on buttons ("Open review", "Ship release"), no arrows in labels, and no internal jargon in user-facing text.

---

## 2. Visual language

### Type: SF Pro and SF Mono (system stack)
| Role | Size/Line | Weight | Use |
|---|---|---|---|
| Large title | 28/34, −0.02em | Semibold | Page titles |
| Title | 20/26 | Semibold | Section heads, sheet titles |
| Headline | 15/20 | Semibold | Card titles, row titles |
| Body | 14/20 | Regular | Default |
| Callout | 13/18 | Regular | Secondary text, table cells |
| Footnote | 12/16 | Medium | Metadata, timestamps (`tabular-nums`) |
| Caption | 11/14 | Medium, +0.02em | Small all-caps labels, used sparingly |

- **Reading view** for article previews uses `ui-serif, "New York", Charter, Georgia` at 18/30 with a 68-character measure. Drafts should read like the finished page, not like a dashboard.
- **Editors and IDs** use `ui-monospace` (SF Mono).

### Color tokens (light and dark, CSS variables in `globals.css`)
- **Backgrounds:** window `#f5f5f7` / `#000`; surface `#fff` / `#1c1c1e`; raised surface `#fff` / `#2c2c2e`.
- **Text:** primary `rgb(0 0 0 / .88)`, secondary `/ .56`, tertiary `/ .32`, inverted in dark mode.
- **Separators and fills:** hairline separator `rgb(0 0 0 / .08)`; fill `rgb(120 120 128 / .12)` for chips and hover states.
- **Accent:** one Apple-style blue (`#0071e3` / `#0a84ff`). The accent is a single token, so it can be swapped later.
- **The 17 stage colors collapse into 5 status families.** The phase itself is shown with a stepper (section 4), not a color.

| Status | Stages | Color | Treatment |
|---|---|---|---|
| Idle | queued, paused | gray | static dot |
| Working | research…design | blue | pulsing dot |
| Needs you | interview (awaiting), review | orange | filled pill |
| Done | approved, published | green | check icon |
| Problem | failed | red | exclamation icon |

### Shape, depth, space
- **Corner radius:** controls 8, cards 12, sheets and dialogs 16, pills full. Applied consistently everywhere.
- **Shadows:** two soft levels, `0 1px 2px /.04` and `0 8px 24px /.08`. Cards on the gray window background mostly need no border at all.
- **Materials:** the sidebar and sticky toolbars use `bg-[surface]/72 backdrop-blur-xl` with a hairline bottom edge, like macOS's unified toolbar.
- **Spacing:** a 4pt grid. Page padding grows from 24 to 40. Reading screens are capped at 1200px, and tables run full width.
- **Icons:** lucide at 16px with 1.5 stroke, close to SF Symbols. They replace every Unicode glyph (→ ↗ ✓ ○ ▸ ▲ ⚠ ×).

### Motion
- 180ms ease-out for state changes and a spring for sheets and popovers, using `tw-animate-css` (the shadcn default).
- Skeletons fade in from `loading.tsx`.
- A live update briefly flashes the changed row's background (600ms).

---

## 3. Navigation and app shell

- **Sidebar.** A translucent sidebar (shadcn `Sidebar` block) with icons. It collapses to icons only with ⌘\\.
  - **Today:** the new home page.
  - **Plan:** Keywords, Strategy, Content Plans.
  - **Make:** Production.
  - **Library:** Articles.
  - **Settings** (the current Admin) sits at the bottom with the company name and logo from `config/company.yaml`.
- **Live badges.** The "Needs you" count updates from the existing SSE stream, not only when the user navigates.
- **Page toolbar.** Every page gets a sticky toolbar:
  - Left: a breadcrumb such as "Plans › Kubernetes testing › Releases".
  - Right: the page's single primary action plus a "⋯" menu.
- **⌘K command palette** (shadcn `Command`):
  - Jump to any article, plan or keyword by title.
  - Actions: "New article…", "Import plan…", "Re-run phase…", "Toggle dark mode".
- **Keyboard:**
  - J/K moves through lists, ↵ opens, Esc closes sheets.
  - ⌘S saves, ⌘↵ sends or approves, ⌘E switches between edit and preview.

---

## 4. Screen-by-screen ideas

### Today (new home, replaces the `/` → `/strategy` redirect)
- **Needs you.** A short stack of generous cards, each with one call to action:
  - "Expert interview · *Kubernetes test flakiness* · ~8 min" → **Start**
  - "Ready to review · audit clean · 2 notes" → **Review**
  - "Release ready · Testing in CI hub + 6 articles" → **Ship**
- **In flight.** Compact rows, each with a phase stepper and elapsed time, updating live.
- **Recently shipped.** Header-image thumbnails, since every article already has a `header.png`.
- **Status line.** One ambient line at the top: "Worker running · 3 in flight · $4.12 today".
- **Empty state:** a large check symbol, "You're all caught up", and a quiet "Start an article" button.

### Production: a pipeline view instead of stage buckets
- **Rows, not stage sections.** Replace the 12 per-stage sections and 13 filter chips with one list of rows.
  - Each row shows title, keyword and a **10-dot phase stepper**: Research · Interview · Evidence · Outline · Write · HDCP · Edit · Verify · Schema · Design.
  - Finished phases are filled, the current phase pulses blue, a waiting phase is orange, a failed phase is red.
  - Hovering a phase (HoverCard) shows its duration, cost and attempt count.
- **Filters:** a segmented control with **All · Working · Needs you · Failed**.
- **Activity:** the "Recent activity" log moves into a side **Sheet** opened from the toolbar. It is one shared `<EventLog>` component, also used by Research, Competitive and Plan Board.
- **Review tab:** becomes a filter of the Today page or Library, or stays as a table with an audit indicator: a green ring when clean, or a red count.

### Interview: focused, like Messages
- **Layout:** a 680px centered conversation with iMessage-style bubbles. The research context sits in a collapsible **inspector** on the right.
- **Checklist as progress:** "What we've captured" becomes a small ring in the toolbar showing 4 of 7. Expanding it shows each item with check icons.
- **Quick replies:** the A/B/C candidate positions appear as **tappable reply chips**, so the expert taps one instead of typing "B".
- **Finish and Skip:** **Finish** turns into the primary button only once the checklist is complete. Until then it lives in the ⋯ menu with Skip, and Skip opens an `AlertDialog`, not `window.confirm`.
- **Streaming:** a typing indicator (three animated dots) replaces "…" and "Listening…".

### Review editor: the biggest win (`review-editor.tsx`, 813 lines today)
- **Three panes** (shadcn `Resizable`), like Xcode or Notes:
  - **Left: outline.** H2 navigation, each heading with a count of notes and flags.
  - **Center: the document.** It opens in the serif **reading view**. ⌘E switches to the markdown source, or to split view.
  - **Right: inspector.** Icon tabs replace the 12 pill tabs: Audit, Facets, Links, Research, Outline, Interview, HDCP, Header, Runs. "First draft" becomes a **Compare** toggle in the document that shows a diff.
- **Notes are highlighted inline.** `[VERIFY]`, `[HUMAN INPUT]` and `[NEEDS SOURCE]` show as yellow highlights in the text. A pill reads "3 notes left" and clicking it jumps to the next one, which makes it obvious why export is blocked.
- **Audit summary:** a single line "31 pass · 2 warn · 0 fail" with collapsible sections for each group.
- **One primary button that moves forward with the article:**
  - Resolve 3 notes → Approve → Send to HubSpot → Go live
  - or, for Framer: Sign off → Download package → Mark live
- **Secondary actions** go in the ⋯ menu. "Re-run from phase" opens a dialog that explains what will be redone. Sign-off and live URL use proper dialogs with inputs instead of `window.prompt`.
- **Save state:** a dot by the title marks unsaved changes, as in macOS. ⌘S saves and a toast confirms.

### Articles library: a gallery
- **Gallery view** as the default: a grid of `header.png` hero images with title, status dot and funnel, like the App Store's Today tab. A **List** toggle shows the table.
- **Detail page:** a reading layout with the hero image, the serif body, and an inspector for Research, Outline, Schema and Meta.

### Keywords, Strategy, Select: one place to decide what to write
- **Strategy "Chat"** becomes a Spotlight-style composer: one large field, "What should we write about?", with optional keyword and "Skip interview" behind a disclosure. Submitting shows a toast with a "View in Production" link.
- **Keywords and Select merge.** Selecting rows in the keyword table brings up a **floating action bar** at the bottom, like selection in Photos: "3 selected · Send to pipeline · Prioritize · Archive". Archive offers Undo in the toast.
- **CSV upload** becomes a drop zone that opens a confirmation sheet.

### Content plans
- **Plan import** becomes a 3-step sheet with a stepper: Upload → Map columns → Confirm. The "guessed, check this" columns get a soft orange outline.
- **Board:** each pillar gets a progress ring with a few large numbers (built / in flight / needs you), with "Needs you" items listed first.
- **Articles table:** a shadcn DataTable (TanStack) with column-filter popovers, a density toggle and a sticky header. This replaces the hand-built 969-line table.
- **Releases:** one card per subtopic, with a progress bar and **Ship release** as the only primary action.
- **Cadence:** the settings are worded as plain sentences, e.g. "Publish **2** articles on **Mon, Wed, Fri** at **9:00**", with each bold value editable inline.

### Settings (currently Admin), modeled on macOS System Settings
- **Layout:** a list of categories with icons on the left (Company, CTAs, Competitive, Standards, Templates, Agents, Context) and a form on the right.
- **Company:** shown as a readable form, not a YAML `<pre>`.
- **Markdown editors:** keep a styled textarea, or optionally use CodeMirror for syntax highlighting.

### Login
- The company logo, one password field and a soft background gradient. Nothing else.

---

## 5. Changes that apply everywhere
- **One primitive per job:** `Badge`/`StatusDot`, `FilterBar` (ToggleGroup), `Progress`, `PhaseStepper`, `EventLog`, `EmptyState` (icon, title, one action), `DataTable`.
- **Dialogs and toasts:** `window.confirm` and `window.prompt` become `AlertDialog`/`Dialog`. The inline green and red feedback text becomes **Sonner** toasts, with Undo where it makes sense.
- **Loading and errors:** add `loading.tsx` skeletons and `error.tsx` to every route group, plus optimistic updates for quick actions.
- **Links vs buttons:** text links are only for navigation. Actions are always buttons.
- **Copy:** use sentence case; fix "open", "artifacts", "← back to review queue" and similar labels.

## 6. shadcn components to use
Sidebar, Command, Button, Badge, Card, Tabs, ToggleGroup, Dialog, AlertDialog, Sheet, Popover, HoverCard, DropdownMenu, Tooltip, Sonner, Skeleton, Progress, Resizable, ScrollArea, Table + DataTable, Select, Switch, Checkbox, Input, Textarea, Breadcrumb, Collapsible, Separator.

Compatibility: shadcn supports Tailwind v4 (the app has 4.3.3) and React 19. It installs `tw-animate-css` and CSS-variable themes, so its theme variables map directly onto the color tokens in section 2. `next-themes` handles following the system setting plus a manual override.

## 7. Build order (for the later implementation pass)
0. **Foundation:** `shadcn init`, tokens in `src/app/globals.css`, lucide, next-themes, Sonner. Re-export the new primitives behind the current `src/components/ui.tsx` API so pages can migrate one at a time.
1. **Shell:** grouped sidebar, toolbar, ⌘K, Today page.
2. **Review editor and interview** (highest value).
3. **Production pipeline view**, plus the shared `PhaseStepper` and `EventLog`.
4. **Library gallery, keywords and strategy.**
5. **Plans and Settings.**
