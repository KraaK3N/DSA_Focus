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

## Current Focus
- Working on: 7:5 vertical card deck aspect ratio updated.
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
