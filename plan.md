# Comprehensive Audit & UI/UX Improvement Plan for DSA Focus Dashboard

This document provides an exhaustive, self-contained audit and step-by-step implementation plan to transform the **DSA Focus Dashboard** UI into a cohesive, high-performance, accessible, and visually stunning productivity tool. 

The plan is designed so an automated coding agent (or developer) can execute every step sequentially without requiring additional context or clarification.

---

## 1. Audit Findings & Concrete Visual Issues

Based on a thorough side-by-side analysis of `index.html`, `styles.css`, and rendered screenshots across all application tabs and modals, the following visual, structural, and usability issues have been identified:

### 1.1 Visual Hierarchy & Focal Points
- **Timer vs. Surrounding Content**: In the center panel (`.timer-card`), the countdown text `.time-text` (`20:00`) is rendered in Bricolage Grotesque 800 at `3.2rem`. While large, it feels crowded inside the SVG circular progress ring (`width="200"` `height="200"`), which has a heavy stroke (`stroke-width="5"`). The center timer should be the undisputed focal point of the workspace, but its scale is constrained by static SVG container dimensions.
- **Top Bar clutter & Tab Navigation**: The top bar (`.topbar`) mixes branding (`.mark`), main navigation tabs (`.nav-tabs`), theme toggling (`#btn-theme-toggle`), and daily goal tracking (`.progress-container`). The dark mode button is styled as a standard tab button (`.tab-btn`), making utility action indistinguishable from primary section navigation.
- **Header Eyebrows & Section Titles**: Every card includes an `.eyebrow` label (e.g., `WORKSPACE`, `FOCUS SESSION`, `STATISTICS`, `DSA SHEET TRACKER`, `TRACKER`) rendered in uppercase orange accent text (`var(--accent)`). However, font size is extremely small (`0.65rem`) with `0.16em` letter spacing, making it hard to skim while competing with card `<h2>` titles (`1.25rem`).

### 1.2 Spacing, Alignment & Grid Layout
- **Dashboard Viewport Constraint**: `.dashboard` relies on a fixed height calculation (`height: calc(100vh - 70px); min-height: 560px;`). In practice, stacked cards in the center panel (`.timer-card` and `.scratchpad-card`) overflow or suffer vertical clipping depending on screen resolution.
- **Uneven Panel Gutters**: Gaps between the 3 main columns are hardcoded to `16px`, but internal card padding varies inconsistently: `.card` has `16px 20px`, `.dsa-progress-box` has `12px 14px`, `.scratchpad-card` has `6px 14px 10px`, and `.stat-box` has `10px 8px`. This creates uneven visual alignment across column edges.
- **Form Row Alignment**: In the problem logging form (`#problem-form-card`), `.form-row` splits Platform and Difficulty inputs 50/50. However, the dropdown arrows and text baseline do not vertically align with standard text inputs. The checkboxes at the bottom (`.form-checkboxes`) have uneven 5px vertical gaps and inconsistent checkmark alignment.

### 1.3 Typography & Font Palette Integration
- **Font Misalignment**: 3 Google Fonts are loaded (`Bricolage Grotesque`, `Hanken Grotesk`, `Fira Code`), but their roles overlap confusingly:
  - Heading font `Bricolage Grotesque` is applied to buttons (`.btn`), `.eyebrow`, tabs, section titles, timer display, and metric values.
  - Body font `Hanken Grotesk` is used for form inputs, table content, and card descriptions.
  - Monospace `Fira Code` is underutilized: it appears in scratchpad shortcuts and table notes, but is missing in numerical timer readouts, statistic counts, complexity notes (`TC - O(N)`), and shortcut keycaps (`<kbd>`), where monospace precision is essential.
- **Line Heights & Tight Textareas**: Form input labels rely on `font-size: 0.68rem` with `line-height: 1.5`, causing text labels to hover unnaturally high above input fields. Textareas (`#p-notes`, `.notes-modal-textarea`) lack consistent line-height leading (`1.55` vs `1.6`).

### 1.4 Color Palette, Contrast & Clashing System Emojis
- **Inconsistent Primary vs Secondary Buttons**: 
  - Save button `#btn-save-problem` is `.btn.primary` (terracotta orange `#df4f29`).
  - Timer Start `#btn-start-pause` is `.btn.primary.large` (terracotta orange).
  - Daily Journal CTA `#btn-open-journal-modal` is `.btn.primary.journal-new-btn` (bright orange `#df4f29` with custom drop shadow).
  - Secondary buttons (`#btn-clear-form`, `#btn-reset-timer`, `#btn-import-csv`) use `.btn.secondary` with thin borders (`var(--hair)`) that vanish on low-contrast screens.
- **Clashing Raw OS Emojis**: Emojis like `🧹` (clear scratchpad), `📥`/`💾` (CSV import/export), `✏️` (edit/journal), `⚡`/`⌛`/`📅` (pace metrics), `🔵`/`🟢`/`🟡` (conflict resolution actions), and `☑️` (slash menu) render with OS-dependent colors and styles. The colored circle emojis (`🔵 Keep Existing`, `🟢 Replace with Imported`, `🟡 Keep Both`) severely clash with the app's refined warm editorial palette (`#f6f1e7` cream, `#df4f29` terracotta).
- **Stat Accents Rainbow Effect**: In `.stats-grid`, stat boxes use distinct accent attributes (`data-accent="sage"`, `blue`, `orange`, `orange-deep`), creating a rainbow text color clutter (green, blue, orange, deep red) within a single 2x2 grid card.

### 1.5 Component Consistency
- **Card Aesthetics**: Cards have variable background implementations. Standard `.card` uses `var(--paper)` (`#fffdf8`), `.scratchpad-card` forces `#ffffff !important` with a dot-matrix background, `.dsa-progress-box` uses `var(--bg)` (`#f6f1e7`), and modal content uses `var(--paper)`.
- **Badges**: Difficulty badges (`.badge-easy`, `.badge-medium`, `.badge-hard`) in the log table use low-opacity backgrounds with colored text, whereas badges in the pace section (`.pace-remaining-badge`) and scratchpad (`.scratchpad-badge`) use different padding, radii, and font sizes.

### 1.6 Micro-Interactions, Focus States & Loading States
- **Focus Rings**: Focus states on inputs (`input:focus`, `textarea:focus`) change border color to `var(--ink)` or `var(--accent)`, but lack clear custom focus-visible outline rings for keyboard accessibility (`box-shadow: 0 0 0 3px ...`).
- **Interactive Feedback**: Buttons use a uniform `transform: scale(0.97)` on `:active`, but hover states on table row actions (`.table-edit-btn`, `.table-delete-btn`) and calendar days lack soft background transitions.

### 1.7 Specific Deep Dives: Custom Complex UI Pieces
- **3D Card-Deck Journal View (`#journal-deck-container`)**:
  - The 3D viewport uses `perspective: 1400px` with absolute positioning on `.deck-cards-track`. On tablet/mobile, side cards get clipped horizontally outside the viewport.
  - The ambient glow backdrop (`#deck-ambient-glow`) uses radial gradient with hardcoded RGBA values that bleed into adjacent sections when scrolling.
  - Navigation arrows (`.deck-arrow-btn`) overlap side cards awkwardly at certain screen widths.
- **CSV Conflict Resolution Modal (`#conflict-modal`)**:
  - The comparison grid `.conflict-comparison-grid` uses a hardcoded VS divider (`.conflict-vs-divider`) that breaks alignment when card content length varies.
  - Primary resolution buttons rely entirely on raw colored circle emojis (`🔵`, `🟢`, `🟡`), breaking accessibility for colorblind users and creating an unpolished appearance.
  - Batch action buttons at the bottom (`.btn-batch`) are cramped into a flex container without clear hierarchy compared to individual card actions.

### 1.8 Accessibility & Responsiveness
- **Color Contrast**: Soft muted labels (`color: var(--muted)`, `#6d6457` on `#f6f1e7`) reach contrast ratios around 4.1:1, failing WCAG AA standard (4.5:1) for small body text. Dark theme muted text (`#a39785` on `#12100e`) also falls short.
- **Screen Reader Accessibility**: Missing `aria-expanded` states on toggle buttons, missing explicit labels on icon buttons, and non-semantic headers in scratchpad blocks.
- **Responsive Breakpoints**: Below 1100px, the 3-panel dashboard collapses right panel to `grid-column: 1 / -1`, causing vertical layout distortion. Below 768px, the top bar progress container disappears completely (`display: none`).

---

## 2. Prioritized Fix List

Issues are prioritized by their impact on user experience, design cohesion, and functional usability:

### Critical Impact (P0) — Must Fix First
- [ ] **Standardize Design Tokens & Theme Foundation**: Establish single source of truth for color scales, typography tokens, semantic spacing scale, elevation shadows, and border radii in CSS root variables.
- [ ] **Overhaul Conflict Resolution Modal UI**: Replace raw emoji buttons (`🔵`, `🟢`, `🟡`) with semantic icon-badge buttons, stabilize comparison grid alignment, and structure batch action hierarchy cleanly.
- [ ] **Fix 3D Deck View Responsive Layout & Clipping**: Fix 3D perspective viewport scaling, contain ambient glow backdrop within parent boundaries, and position navigation controls predictably across device breakpoints.
- [ ] **Fix Viewport Overflow & Panel Grid Layout**: Convert hardcoded `calc(100vh - 70px)` dashboard grid into a flex/grid layout with individual scrollable panel cards to prevent layout breaks.

### High Impact (P1) — Core Visual & Usability Overhaul
- [ ] **Cohesive Typography System**: Enforce clear usage roles for `Bricolage Grotesque` (Headings/Display), `Hanken Grotesk` (UI/Labels/Body), and `Fira Code` (Numbers, Timer, Codes, Badges, Short-keys).
- [ ] **Timer & SVG Progress Ring Scaling**: Scale timer SVG ring proportionally with crisp stroke weight, centered countdown text in `Fira Code`, and aligned control action buttons.
- [ ] **Refine Top Bar & Nav Tab Hierarchy**: Separate page tabs (`Dashboard`, `Log`, `Journal`) from utility controls (Theme toggle). Give theme toggle an explicit icon-pill style distinct from active navigation tabs.
- [ ] **Color Contrast & Dark Theme Audit**: Adjust `--muted` light mode (`#524b40`) and dark mode (`#b5a895`) colors to guarantee WCAG AA 4.5:1 contrast compliance.

### Medium Impact (P2) — Component & Form Polish
- [ ] **Form Input & Label Alignment**: Normalize input padding, border radius, background color (`var(--paper)` inside form fields), label sizes, and focus rings across all forms and modals.
- [ ] **Unify Badge & Tag Visual Language**: Standardize all tags (Difficulty, Solved, Hint, Revision, Conflict tags) under a single `.badge` design token rule.
- [ ] **Scratchpad Card Theme Harmonization**: Remove hardcoded white background `#ffffff !important` in scratchpad card; align dot matrix texture with light/dark theme variables. Replace broom emoji `🧹` with inline SVG icon.
- [ ] **Stats Panel Refinement**: Unify 2x2 stat boxes with subtle muted background, monospace counts, clear contrast labels, and remove rainbow accent clutter.

### Low Impact (P3) — Micro-Interactions & Finishing Touches
- [ ] **Replace System Emojis with SVG Icons**: Replace raw OS emojis (`📥`, `💾`, `✏️`, `⚡`, `⌛`, `📅`) across log table, pace card, and modals with crisp, inline SVG vector icons.
- [ ] **Enhanced Focus Rings & Keyboard Nav**: Add explicit focus-visible ring styles (`box-shadow: 0 0 0 3px rgba(223, 79, 41, 0.25)`) to all interactive elements.
- [ ] **Toast Notification & Modal Animations**: Smooth modal backdrop entrance/exit transitions and refine toast alert borders.

---

## 3. Comprehensive Design System Tokens

All fixes in this plan must strictly conform to the following design token specifications:

### 3.1 Color Palette (Light & Dark Modes)

```css
:root {
  /* Surface & Backgrounds (Warm Editorial Light) */
  --bg-app:             #f5f0e6; /* Main page background */
  --bg-surface:         #ffffff; /* Primary card / paper background */
  --bg-surface-subtle:  #eae3d2; /* Input backgrounds, subtle wells */
  --border-subtle:      #e2d8c3; /* Primary hairline borders */
  --border-strong:      #c8baa0; /* Hover / input borders */

  /* Text & Foreground */
  --text-main:          #1a1715; /* Primary headings & body text */
  --text-muted:         #524b40; /* Subtitles, labels (WCAG AA 4.6:1 compliant) */
  --text-inverse:       #ffffff; /* Text on dark/accent surfaces */

  /* Brand & Status Accents */
  --accent-primary:     #d94a26; /* Warm Terracotta Red/Orange */
  --accent-primary-hover: #b83b1c;
  --accent-primary-subtle: rgba(217, 74, 38, 0.10);

  --accent-blue:        #2b6cb0; /* Platform / Info accent */
  --accent-blue-subtle: rgba(43, 108, 176, 0.10);

  /* Difficulty / Status Colors */
  --color-easy:         #2f7d4e; /* Sage green */
  --color-easy-subtle:  rgba(47, 125, 78, 0.12);
  --color-medium:       #c07d18; /* Warm amber gold */
  --color-medium-subtle: rgba(192, 125, 24, 0.12);
  --color-hard:         #d94a26; /* Terracotta red */
  --color-hard-subtle:  rgba(217, 74, 38, 0.12);

  /* Elevation Shadows */
  --shadow-xs:          0 1px 2px rgba(26, 23, 21, 0.04);
  --shadow-md:          0 4px 16px rgba(26, 23, 21, 0.06), 0 1px 2px rgba(26, 23, 21, 0.04);
  --shadow-lg:          0 12px 32px rgba(26, 23, 21, 0.10), 0 2px 6px rgba(26, 23, 21, 0.04);

  /* Radius Scale */
  --radius-xs:          4px;
  --radius-sm:          6px;
  --radius-md:          10px;
  --radius-lg:          16px;
  --radius-pill:        9999px;

  /* Typography Families */
  --font-display:       'Bricolage Grotesque', sans-serif;
  --font-body:          'Hanken Grotesk', system-ui, -apple-system, sans-serif;
  --font-mono:          'Fira Code', monospace;
}

/* Dark Theme Overrides */
body.dark-theme {
  --bg-app:             #12100e;
  --bg-surface:         #1c1917;
  --bg-surface-subtle:  #26221f;
  --border-subtle:      #342f2b;
  --border-strong:      #4a433d;

  --text-main:          #f4efe6;
  --text-muted:         #a89b88;
  --text-inverse:       #12100e;

  --accent-primary:     #ed5e38;
  --accent-primary-hover: #ff7854;
  --accent-primary-subtle: rgba(237, 94, 56, 0.16);

  --accent-blue:        #4299e1;
  --accent-blue-subtle: rgba(66, 153, 225, 0.16);

  --color-easy:         #48bb78;
  --color-easy-subtle:  rgba(72, 187, 120, 0.16);
  --color-medium:       #ecc94b;
  --color-medium-subtle: rgba(236, 201, 75, 0.16);
  --color-hard:         #ed5e38;
  --color-hard-subtle:  rgba(237, 94, 56, 0.16);

  --shadow-xs:          0 1px 2px rgba(0, 0, 0, 0.20);
  --shadow-md:          0 4px 16px rgba(0, 0, 0, 0.35);
  --shadow-lg:          0 12px 32px rgba(0, 0, 0, 0.50);
}
```

### 3.2 Typography Scale & Rules

| Scale Target | Font Family | Size | Weight | Line Height | Letter Spacing | Case |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Display / H1** | `Bricolage Grotesque` | `1.75rem` (28px) | 800 | 1.15 | `-0.025em` | Sentence |
| **Card Title / H2** | `Bricolage Grotesque` | `1.25rem` (20px) | 700 | 1.20 | `-0.015em` | Sentence |
| **Section Title / H3**| `Bricolage Grotesque` | `1.00rem` (16px) | 700 | 1.25 | `0.00em` | Sentence |
| **Eyebrow Label** | `Bricolage Grotesque` | `0.70rem` (11px) | 700 | 1.00 | `0.14em` | Uppercase |
| **Body Standard** | `Hanken Grotesk` | `0.875rem` (14px)| 400/500 | 1.50 | `0.00em` | Sentence |
| **Form Label** | `Hanken Grotesk` | `0.72rem` (11.5px)| 700 | 1.10 | `0.06em` | Uppercase |
| **Timer Display** | `Fira Code` | `3.25rem` (52px) | 600 | 1.00 | `-0.03em` | None |
| **Metric / Stat Num**| `Fira Code` | `1.35rem` (21.5px)| 600 | 1.10 | `-0.02em` | None |
| **Badges / Buttons** | `Bricolage Grotesque` | `0.78rem` (12.5px)| 700 | 1.00 | `0.02em` | Sentence/Upper |

### 3.3 Spacing Rhythm Scale
Use an 8-point rhythm scale (with 4px increments for tight micro-spacing):
- `4px` (`--space-1`) — Micro gaps, badge inner padding, checkbox gap
- `8px` (`--space-2`) — Form group bottom margin, button icon gap, tag gap
- `12px` (`--space-3`) — Card header padding, tight grid gaps
- `16px` (`--space-4`) — Standard card internal padding, panel gap
- `24px` (`--space-6`) — Modal padding, section breaks
- `32px` (`--space-8`) — Hero section padding, major layout gaps

---

## 4. Concrete Fixes Per Component & Element

This section outlines exact CSS property edits and required HTML structure modifications for every affected element:

### 4.1 Top Bar & Navigation Header (`.topbar`)
- **Affected Elements**: `.topbar`, `.header-wrap`, `.nav-tabs`, `.tab-btn`, `#btn-theme-toggle`, `.progress-container`
- **What Good Looks Like**:
  - Top bar height pinned to `56px` with continuous backdrop blur (`backdrop-filter: blur(12px)`).
  - Main tab buttons (`Dashboard`, `Log`, `Journal`) grouped in a pill track with `--bg-surface-subtle` background.
  - Theme toggle button `#btn-theme-toggle` moved out of `.nav-tabs` into a distinct action pill on the right with an explicit icon + label style.
  - Daily goal bar `.progress-container` elevated with a distinct `6px` track height, rounded pill fill, and visible percentage readout.
- **Structural HTML Changes**:
  ```html
  <!-- Wrap theme toggle in separate header utility group -->
  <div class="header-right">
    <div class="progress-container">...</div>
    <button class="btn-theme-pill" id="btn-theme-toggle" aria-label="Toggle dark mode">
      <svg class="theme-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
      <span class="theme-text">Dark</span>
    </button>
  </div>
  ```

### 4.2 Dashboard Layout Grid (`.dashboard`)
- **Affected Elements**: `.dashboard`, `.panel`, `.left-panel`, `.center-panel`, `.right-panel`
- **What Good Looks Like**:
  - Replace rigid `height: calc(100vh - 70px)` with flex/grid container:
    ```css
    .dashboard {
      display: grid;
      grid-template-columns: 320px 1fr 320px;
      gap: 16px;
      margin-top: 16px;
      align-items: start;
    }
    ```
  - Center panel expands smoothly while left and right panels maintain a fixed structural width (`320px`).
  - Cards inside `.left-panel` and `.right-panel` fit content with clean scrolling where necessary (`overflow-y: auto`).

### 4.3 Current Problem Logging Form (`#problem-form-card`)
- **Affected Elements**: `#problem-form-card`, `label`, `input[type="text"]`, `select`, `textarea`, `.checkbox-label`, `.form-actions`
- **What Good Looks Like**:
  - Input background set to `var(--bg-surface)` with `1px solid var(--border-subtle)`. On focus: `border-color: var(--accent-primary)`, `box-shadow: 0 0 0 3px var(--accent-primary-subtle)`.
  - Form labels explicitly positioned `4px` above inputs with `var(--text-muted)` color and `0.72rem` uppercase font.
  - Checkboxes styled with clean 16x16px custom checkmarks and aligned flex text.
  - Form action buttons (`#btn-save-problem` and `#btn-clear-form`) spanning full width in a 2:1 flex ratio.

### 4.4 Focus Session Timer (`.timer-card`)
- **Affected Elements**: `.timer-card`, `.timer-display-container`, `.progress-ring`, `#timer-ring`, `#countdown-display`, `.timer-controls`
- **What Good Looks Like**:
  - SVG progress ring dimensions updated to `220x220px` with `stroke-width="6"`. Ring track background `#timer-ring` animated via smooth `transition: stroke-dashoffset 0.5s ease`.
  - Countdown text `#countdown-display` rendered in `Fira Code` font at `3.5rem` weight `600`, perfectly centered inside ring.
  - Control buttons (`−5m`, `Start`, `Reset`, `+5m`) aligned in a unified horizontal control bar with equal heights (`40px`).

### 4.5 Scratch Board Card (`.scratchpad-card`)
- **Affected Elements**: `.scratchpad-card`, `.scratchpad-header`, `#scratchpad-editor`, `#scratchpad-slash-menu`
- **What Good Looks Like**:
  - Remove all hardcoded `#ffffff !important` CSS rules. Use `var(--bg-surface)` with dynamic light/dark dot matrix pattern (`radial-gradient(var(--border-strong) 1px, transparent 1px)`).
  - Clear board button `#btn-scratch-clear` updated from raw broom emoji `🧹` to inline SVG trash/clear icon.
  - Slash command menu `#scratchpad-slash-menu` elevated with `var(--shadow-lg)` elevation shadow, soft hover highlights, and aligned monospaced shortcut indicators.

### 4.6 Statistics & Performance Widget (`.stats-grid-card`)
- **Affected Elements**: `.dsa-progress-box`, `.dsa-ring-svg`, `.dsa-diff-list`, `.stats-grid`, `.stat-box`
- **What Good Looks Like**:
  - Progress ring arcs (`.dsa-ring-easy`, `.dsa-ring-medium`, `.dsa-ring-hard`) rendered with clean rounded linecaps and distinct stroke colors (`var(--color-easy)`, `var(--color-medium)`, `var(--color-hard)`).
  - Total solved center count `#stat-total` rendered in `Fira Code` `1.5rem` bold text.
  - 2x2 grid stat boxes (`.stat-box`) rendered with unified subtle background `var(--bg-surface-subtle)` and high-contrast monospace numerical values (`var(--font-mono)`).

### 4.7 Pace & Completion Projection Card (`#pace-projection-card`)
- **Affected Elements**: `#pace-projection-card`, `.pace-progress-container`, `.pace-metrics-grid`, `.pace-metric-box`
- **What Good Looks Like**:
  - Progress bar track height increased to `8px` with rounded pill fill (`var(--accent-primary)`).
  - Metrics boxes (`Velocity`, `Time Remaining`, `Est. Completion`) styled as clean metric tiles. System emojis `⚡`, `⌛`, `📅` replaced with crisp SVG vector icons wrapped in circular icon badges (`36x36px`).

### 4.8 Solved Problem Spreadsheet Log View (`#log-view`)
- **Affected Elements**: `.spreadsheet-card`, `.spreadsheet-filters`, `.spreadsheet-table`, `th`, `td`, `.badge`, `.table-edit-btn`, `.table-delete-btn`
- **What Good Looks Like**:
  - Sticky table header (`th`) with `var(--bg-app)` background, uppercase `0.72rem` `Bricolage Grotesque` text, and subtle bottom border.
  - CSV Action buttons (`📥 Upload CSV`, `💾 Download CSV`) replaced with SVG icon buttons:
    ```html
    <button class="btn secondary" id="btn-import-csv">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
      Import CSV
    </button>
    ```
  - Table action buttons (`Edit`, `Delete`) updated to compact SVG icon buttons with subtle hover backgrounds.

### 4.9 Journal Section & 3D Card-Deck View (`#journal-view`, `#journal-deck-container`)
- **Affected Elements**: `.journal-header-card`, `.journal-calendar-card`, `.calendar-grid`, `#journal-deck-container`, `.deck-cards-viewport`, `.deck-cards-track`, `.journal-deck-card`, `.deck-arrow-btn`
- **What Good Looks Like**:
  - Calendar day cells given a minimum height (`80px`), clean date badge in top corner, and subtle status dots for days containing journal entries.
  - 3D Card Deck container (`#journal-deck-container`):
    - Ambient backdrop glow `#deck-ambient-glow` constrained to card deck bounds with `overflow: hidden` on parent.
    - Active 3D deck card rendered with crisp card depth (`transform: translate3d(...) scale(1)`), high-contrast text, and a distinct terracotta CTA button (`+ Write Note`).
    - Navigation side arrows (`.deck-arrow-btn`) given frosted glass backdrop (`backdrop-filter: blur(8px)`), hover scale effect, and precise vertical centering.

### 4.10 CSV Import Conflict Resolution Modal (`#conflict-modal`)
- **Affected Elements**: `#conflict-modal`, `.conflict-modal-content`, `.conflict-comparison-grid`, `.conflict-card`, `.conflict-actions-bar`, `.btn-keep-existing`, `.btn-replace-imported`, `.btn-keep-both`, `.conflict-batch-footer`
- **What Good Looks Like**:
  - Comparison grid `.conflict-comparison-grid` formatted as 2 equal-width columns (`1fr 1fr`) with a subtle vertical divider (`.conflict-vs-divider`).
  - Action buttons (`.btn-keep-existing`, `.btn-replace-imported`, `.btn-keep-both`):
    - Completely remove raw emoji circles (`🔵`, `🟢`, `🟡`).
    - Replace with structured icon buttons using design tokens:
      - `Keep Existing`: Slate Blue style (`var(--accent-blue)`) with database SVG icon.
      - `Replace with Imported`: Terracotta primary style (`var(--accent-primary)`) with refresh/swap SVG icon.
      - `Keep Both`: Amber Gold style (`var(--color-medium)`) with copy/duplicate SVG icon.
- **Structural HTML Changes**:
  ```html
  <div class="conflict-actions-bar">
    <button type="button" class="btn conflict-btn btn-keep-existing" id="btn-keep-existing">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M21 19c0 1.66-4 3-9 3s-9-1.34-9-3"></path></svg>
      Keep Existing
    </button>
    <button type="button" class="btn conflict-btn btn-replace-imported" id="btn-replace-imported">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
      Replace with Imported
    </button>
    <button type="button" class="btn conflict-btn btn-keep-both" id="btn-keep-both">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      Keep Both
    </button>
  </div>
  ```

---

## 5. Step-by-Step Implementation Sequence

The implementing agent must follow this strict sequential order. Each step includes specific code targets and visual verification criteria.

### Step 1: Design Tokens & Base CSS Reset
- [ ] Edit `styles.css` custom properties block (`:root` and `body.dark-theme`) to define all token variables for colors, typography, shadows, spacing, and radii specified in **Section 3**.
- [ ] Update global body and CSS reset rules (`*`, `body`, `input`, `button`, `textarea`, `select`) to consume new font family and background tokens.
- [ ] **Visual Verification**: Load the page in Light and Dark modes. Verify background color transitions smoothly to `#f5f0e6` (Light) / `#12100e` (Dark) without broken styling.

### Step 2: Global Typography & Icon Standardization
- [ ] Update header, eyebrow, body, and label typography rules across `styles.css`.
- [ ] Apply `Fira Code` monospace font to timer displays, numerical counts, code blocks, shortcut keycaps, and table metrics.
- [ ] Replace system emojis in `index.html` (header, CSV buttons, pace icons, modal buttons) with inline SVG vector code.
- [ ] **Visual Verification**: Inspect section headers and numbers. Check that all numerical statistics use crisp monospace font alignment and system emojis no longer appear in buttons or headers.

### Step 3: Top Bar & Core Dashboard Layout Overhaul
- [ ] Refactor `.topbar` CSS rules: set height to `56px`, align branding, fix tab track background, and isolate dark mode button as a distinct utility pill.
- [ ] Refactor `.dashboard` grid in `styles.css` from fixed screen heights to responsive flex/grid columns (`320px 1fr 320px`).
- [ ] **Visual Verification**: Resize window width from 1400px down to 1000px. Verify left and right panels maintain 320px width while center panel adjusts fluidly without content clipping.

### Step 4: Component Polish — Forms, Cards & Buttons
- [ ] Update `.card` styling to use `var(--bg-surface)` with unified border `var(--border-subtle)` and soft elevation shadow `var(--shadow-md)`.
- [ ] Update form controls (`input[type="text"]`, `select`, `textarea`, `.checkbox-label`) in `#problem-form-card`: add explicit focus rings and label leading.
- [ ] Remove hardcoded `#ffffff !important` from `.scratchpad-card`; integrate dynamic dot-matrix background pattern using theme tokens.
- [ ] **Visual Verification**: Focus on problem name input and notes textarea. Verify focus ring `box-shadow` illuminates clearly. Type in scratchpad and check dot background in dark mode.

### Step 5: Timer & Stats Widgets Standardization
- [ ] Update `.timer-card` layout: scale SVG progress ring to `220x220px`, set countdown display to `Fira Code` monospace `3.5rem`, and align `-5m`, `Start`, `Reset`, `+5m` action buttons.
- [ ] Update `.dsa-progress-box` and `.stats-grid`: apply monospace numbers to `stat-value` elements, replace rainbow text colors with high-contrast theme tokens.
- [ ] **Visual Verification**: Start the timer. Confirm smooth countdown transition in monospace font, and inspect 2x2 stat boxes for uniform card alignment.

### Step 6: Spreadsheet Log & Journal Views Refinement
- [ ] Update `.log-section` and `.spreadsheet-table`: style sticky headers, adjust column padding, replace table action buttons with clean SVG icons, and standardize `.badge` pill styles.
- [ ] Refactor `.journal-calendar-card`: style calendar weekday headers, cell date numbers, and active day highlight.
- [ ] **Visual Verification**: Navigate to "Log" tab, test search/filter dropdowns, and check table row hover states. Navigate to "Journal" tab and verify calendar grid layout.

### Step 7: 3D Card-Deck View & Conflict Modal Overhaul
- [ ] Refactor `#journal-deck-container` CSS: constrain ambient glow backdrop, scale perspective viewport for responsive widths, and refine side navigation arrow buttons.
- [ ] Overhaul `#conflict-modal`: update HTML to replace raw emoji buttons (`🔵`, `🟢`, `🟡`) with SVG icon buttons (`Keep Existing`, `Replace with Imported`, `Keep Both`).
- [ ] Refactor `.conflict-comparison-grid` CSS to enforce equal 2-column card layout with crisp tag badges and clear batch action buttons.
- [ ] **Visual Verification**: Toggle deck view in Journal tab; scroll through cards and verify smooth 3D depth without overflow scrollbars. Trigger conflict modal (or inspect code) to verify clean SVG buttons.

### Step 8: Accessibility, Focus Rings & Final Responsive Audit
- [ ] Verify WCAG AA 4.5:1 text contrast ratios across light and dark modes.
- [ ] Add explicit `:focus-visible` ring outlines to all buttons, tabs, links, and inputs.
- [ ] Apply responsive media queries for tablet (`<= 1024px`) and mobile (`<= 768px`) breakpoints: collapse dashboard to single column, hide non-essential topbar elements gracefully, and adjust modal widths.
- [ ] **Visual Verification**: Perform full keyboard-only navigation (`Tab` / `Shift+Tab` / `Enter` / `Space`). Verify active focus ring indicator is visible on every interactive element.

---

## 6. Summary Checklist for Implementing Agent

- [ ] All design system custom properties defined in `styles.css`
- [ ] Typography roles assigned strictly (`Bricolage Grotesque`, `Hanken Grotesk`, `Fira Code`)
- [ ] Raw system emojis replaced with inline SVG vectors
- [ ] Dashboard viewport grid converted to responsive flex/grid layout
- [ ] Form controls and scratchpad harmonized with light/dark theme tokens
- [ ] Focus timer countdown rendered in monospace font inside scaled SVG ring
- [ ] Spreadsheet table headers sticky with updated badge design system
- [ ] 3D deck view contained without horizontal scrollbar overflow
- [ ] CSV Conflict resolution modal buttons overhauled without emoji reliance
- [ ] Full WCAG AA contrast compliance verified in Light and Dark themes
- [ ] Keyboard navigation focus-visible indicators visually confirmed
