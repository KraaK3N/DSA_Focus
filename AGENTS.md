# AGENTS.md — Project Memory & Rules
# Scope: THIS PROJECT ONLY. Lives at ./AGENTS.md in the repo root.
# Do NOT copy this to ~/.gemini/AGENTS.md (that's global and would leak into every
# other project). This file is meant to travel with the repo and nowhere else.
#
# Purpose: when a fresh Antigravity CLI session starts here, read this file FIRST,
# in full, before exploring the codebase. It should tell you what this project is,
# how it's structured, what's already been decided, what's in progress, and how
# the person working on it likes things done — so you don't have to re-derive any
# of that by re-reading every file.
#
# Living document rule: keep this file up to date as we work. After any meaningful
# change, decision, or milestone, add/update the relevant section below instead of
# waiting to be asked. Prefer editing the right section over dumping everything in
# the Session Log. Keep entries short — this file should stay skimmable.

## Project Overview
- **Name:** DSA Focus Dashboard
- **One-line description:** Single-page productivity dashboard for practicing data structures & algorithms problems.
- **Stage:** Prototype / UI Refinement

## Tech Stack
- **Language:** HTML5, Modern JavaScript (ES6+)
- **Styling:** Vanilla CSS Custom Properties (Theme tokens)
- **Dependencies:** PapaParse (CSV processing)

## Decisions Made
- 2026-07-31 — Completed comprehensive UI audit and authored self-contained `plan.md` implementation guide covering design system tokens, typography standardization, responsive layout, 3D deck view polish, and CSV conflict modal redesign.
- 2026-07-31 — Executed `plan.md`: standardized design tokens, replaced raw system emojis with SVG icons, scaled focus timer SVG ring with Fira Code monospace countdown font, refactored header with `.btn-theme-pill`, converted dashboard to fluid responsive grid, and modernized conflict resolution modal.
- 2026-07-31 — Refined scratchpad card: softened dot background pattern (`#e4dccb` in light mode, `rgba(255,255,255,0.08)` in dark mode), centered "SCRATCH PAD" title text in card header, and positioned clear/delete button on the right.
- 2026-07-31 — Restored original `Bricolage Grotesque` display font for timer countdown display and stat numbers as requested.
- 2026-07-31 — Fixed dark mode theme variable cascading by re-mapping legacy aliases (`--bg`, `--paper`, `--ink`, `--muted`, `--hair`, `--accent`, etc.) inside `body.dark-theme` so dark background and cards render properly across the whole application.
- 2026-07-31 — Relocated Grid/Cards view toggle pill group directly into `.calendar-controls` beside the "month year" navigator display, and updated view switching to toggle between the calendar grid body + timeline wrapper and the 3D cards deck view.
- 2026-07-31 — Redesigned the Log table Problem Notes popup modal (`#notes-sidebar`) to be a centered popup modal matching the exact dark scratchpad modal aesthetic, with a terracotta orange heading ("Save Notes"), problem subtitle, inner dark well textarea, top-right close `✕` button, and bottom-right `Cancel` / `Save` action buttons.
- 2026-07-31 — Updated 3D deck view card dimensions to a 7:5 vertical format (300px width x 420px height) and increased text snippet clamp to 7 lines for optimal vertical reading.
- 2026-07-31 — Added the soft dotted matrix background grid pattern (`radial-gradient`) to `.scratchpad-modal-card` across light (`#e4dccb`) and dark (`rgba(255,255,255,0.08)`) modes for all popup modals.
- 2026-07-31 — Rebuilt CSV import duplicate resolution to match Windows File Explorer UX: added top-right close `✕` button on all modal views, updated action button names matching Windows Explorer prompts (`Keep Existing (Skip New)`, `Replace with Imported`, `Keep Both Files`, `Apply this choice to all remaining conflicts` toggle checkbox, `Skip All (Keep Existing)`, `Replace All (Use Imported)`, `Keep All (Save Both)`), field-level diff detection with soft amber background highlight on differing fields and muted opacity on identical fields, `N field(s) differ` summary badge, `Skip for now` action and `Undo Last` resolution stack, keyboard controls (`Enter`, `Esc`, `Arrow keys`, focus trap), theme-aware custom webkit scrollbars, and an end-of-batch summary screen (`X kept` · `Y replaced` · `Z kept both` · `K skipped` with `Review Skipped Conflicts` and `Finish & Commit Import`).
- 2026-07-31 — Redesigned "What's on your mind?" and "+ Write" / "+ Write Note" modal popup (`#journal-modal`) to match the centered Notes Modal popup (`notes-modal-card`) structure and aesthetic: backdrop blur overlay (`#journal-modal-backdrop`), terracotta orange heading, date subtitle, top-right close `✕` button, dark inner well textarea, title input, and bottom-right `Cancel` / `Save Entry` action buttons.
- 2026-07-31 — Removed the redundant Journal Timeline section (`#journal-grid-wrapper` / `.journal-entries-card`) from the bottom of the Journal view as requested.
- 2026-07-31 — Overhauled CSV Conflict Resolution modal to be significantly more compact (~20% size reduction, `max-width: 640px`), strict 50/50 side-by-side equal width summary cards (`min-width: 0` CSS grid fix eliminating squished columns), SVG field icons, difficulty badges, optional "Hide identical fields" toggle, soft amber/terracotta row difference highlighting, and prominent side-by-side action buttons (`Keep Existing` · `Replace with Imported` · `Keep Both`) for fast 5-second conflict resolution.

## Current Focus
- Working on: 3-Button Side-by-Side Action Row Fixed.
- Blocked on / open question: None
- Next up: User review and validation

## Session Log
- **2026-07-31** — Authored exhaustive `plan.md` audit report and step-by-step implementation guide for the DSA Focus Dashboard.
- **2026-07-31** — Successfully executed all 8 implementation steps from `plan.md`. Updated design tokens, typography, SVG vector icons, header topbar, dashboard grid, focus timer, scratchpad, stats widget, spreadsheet table, 3D deck view, and CSV conflict resolution modal.
- **2026-07-31** — Softened scratchpad dot background grid and updated card header layout to center "SCRATCH PAD" text with delete icon aligned to the right.
- **2026-07-31** — Restored original display font (`Bricolage Grotesque`) across timer countdown and statistic metrics.
- **2026-07-31** — Eliminated excess top space and bottom border line on scratchpad card header.
- **2026-07-31** — Fixed dark mode variable cascading so page background, cards, and input fields turn rich dark `#12100e`/`#1c1917` in dark mode.
- **2026-07-31** — Positioned Grid/Cards view toggle pill group beside month/year controls and configured toggle state between Grid Calendar and 3D Cards deck.
- **2026-07-31** — Redesigned Problem Notes modal as a centered popup matching the scratchpad modal design with backdrop blur, terracotta heading, dark inner well textarea, and Cancel / Save action buttons.
- **2026-07-31** — Converted 3D coverflow deck cards from 2:1 horizontal to 7:5 vertical aspect ratio (300px width x 420px height) with updated drag physics and 7-line snippet clamp.
- **2026-07-31** — Applied the soft radial dotted matrix grid pattern background to `.scratchpad-modal-card` across Light and Dark themes.
- **2026-07-31** — Simplified Problem Notes modal top text to a sleek "Save Notes" title (1.15rem), removed header border line, and eliminated background shift on textarea focus.
- **2026-07-31** — Resized Problem Notes modal popup container to `max-width: 460px` and set textarea `min-height: 240px` for optimal popup proportions.
- **2026-07-31** — Rebuilt CSV import duplicate resolution workflow to match Windows File Explorer UX. Added top-right close `✕` buttons, Windows Explorer-style action prompt names, queue management, progress indicator + bar, field-level diff highlights (`.is-diff` soft amber vs `.is-same` muted), `N field(s) differ` summary badge, batch checkbox toggle (`Apply this choice to all remaining conflicts`), `Skip for now`, `Undo Last`, keyboard navigation (`Enter`/`Esc`/`Arrows`), theme-aware custom scrollbars, and an end-of-batch summary screen with review of skipped conflicts and atomic commit.
- **2026-07-31** — Redesigned "What's on your mind?" and "+ Write Note" / "+ Write" modal popup (`#journal-modal`) to pop up cleanly matching the exact centered Notes modal popup (`notes-modal-card`) aesthetic with backdrop blur (`#journal-modal-backdrop`), terracotta title, date subtitle, top-right close `✕`, dark inner well textarea, title field, and bottom-right `Cancel` / `Save Entry` buttons.
- **2026-07-31** — Removed the Journal Timeline card at the bottom of the Journal section (`index.html`).
- **2026-07-31** — Fixed media query syntax bug in `styles.css` so conflict action buttons (`Keep Existing`, `Replace with Imported`, `Keep Both`) render in a single side-by-side 3-column row, saving significant vertical space.

## Known Gotchas
> Things that look like bugs but aren't, dead ends already tried, or quirks of this
> codebase/environment worth not rediscovering the hard way.
- [e.g. "The `foo` endpoint looks unused but is called by the cron job in bar.ts"]
- [e.g. "Tried X for Y, doesn't work because Z — don't retry without new info"]

## Safety Guardrails
- Never write to the database, run migrations, or delete data without explicit confirmation
- Never deploy or push to production without explicit approval
- Never delete files or commit history without explicit confirmation
- Never commit `.env`, credentials, or secrets
- Ask before adding new dependencies

---
### How to keep this working
- This file is project-scoped by design — it stays in `./AGENTS.md` in this repo
  only, so it never bleeds into unrelated projects on this machine.
- At the start of a session: read this whole file before touching the code.
- During work: update **Current Focus**, **Decisions Made**, and **Session Log**
  as things happen — don't batch it all up for the end.
- If a section grows too long to stay skimmable, trim old Session Log entries into
  a one-line summary rather than deleting the history entirely.
