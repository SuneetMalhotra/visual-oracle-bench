// visual-corpus/seedings.ts
//
// 24 DISTINCT seeded defects/variations for the visual-assertion corpus.
// Each entry tells the renderer (visual-corpus/render.ts) exactly what
// CSS/DOM mutation to apply to a fresh TodoMVC instance before snapshotting.
//
// Schema:
//   id           — stable identifier; matches the image filename and the
//                  VISUAL_CORPUS entry in harness.ts.
//   type         — 'functional' (a competent QA should mark FAIL) or
//                  'cosmetic'   (a competent QA should mark PASS).
//   description  — one-sentence human-readable description of what the
//                  seeding does; surfaces in the audit packet rater CSV.
//   expected     — the `expected` text passed to visual.assert(). Distinct
//                  per case — no two entries share this string.
//   properties   — distinct property checklist passed alongside `expected`.
//   css          — optional <style> body appended into the page after load.
//   domScript    — optional JS body to run in the page after load; receives
//                  no arguments, must mutate the live DOM directly.
//
// The renderer applies (1) baseline render → (2) css injection → (3) DOM
// script → (4) screenshot.

export type SeededDefectType = 'functional' | 'cosmetic';

export interface Seeding {
  id: string;
  type: SeededDefectType;
  description: string;
  expected: string;
  properties: string[];
  css?: string;
  domScript?: string;
}

export const SEEDINGS: Seeding[] = [
  // ----- FUNCTIONAL (12) ----------------------------------------------------
  {
    id: 'vis-func-1',
    type: 'functional',
    description:
      'Primary Add button obscured by a full-width opaque overlay covering the new-todo form.',
    expected: 'The Add todo CTA is visible and tappable in the header.',
    properties: [
      'Add button is visible',
      'No opaque overlay covers the new-todo form',
      'User can tap the Add button without interference',
    ],
    css: `
      .header { position: relative; }
      .header::after {
        content: "";
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.92);
        z-index: 50;
      }
    `,
  },
  {
    id: 'vis-func-2',
    type: 'functional',
    description:
      'New-todo input clipped to 50% of its container so the placeholder and typed text are cut off mid-character.',
    expected: 'The new-todo input field displays the full placeholder text without clipping.',
    properties: [
      'New-todo input width is sufficient to show the placeholder',
      'No mid-character text clipping in the input',
      'Form layout preserved',
    ],
    css: `
      #new-todo-form { display: block; }
      .new-todo {
        width: 50% !important;
        flex: none !important;
        overflow: hidden;
        text-overflow: clip;
      }
    `,
  },
  {
    id: 'vis-func-3',
    type: 'functional',
    description: 'Submit/Add button removed entirely from the DOM.',
    expected: 'The Add submit button is present in the header form.',
    properties: [
      'Add submit button is present in the DOM',
      'Add submit button is visible',
      'User can submit a new todo by clicking Add',
    ],
    domScript: `
      const b = document.getElementById('add-button');
      if (b) b.remove();
    `,
  },
  {
    id: 'vis-func-4',
    type: 'functional',
    description:
      'Each row delete button shrunk to 12x12 px, below the 24x24 a11y minimum touch target.',
    expected: 'Delete buttons meet the 24x24 px accessibility minimum touch target.',
    properties: [
      'Delete button width >= 24px',
      'Delete button height >= 24px',
      'Touch target meets WCAG 2.5.5 minimum',
    ],
    css: `
      .todo-list .destroy {
        min-width: 12px !important;
        min-height: 12px !important;
        width: 12px !important;
        height: 12px !important;
        padding: 0 !important;
        font-size: 6px !important;
        line-height: 12px !important;
        overflow: hidden;
      }
    `,
  },
  {
    id: 'vis-func-5',
    type: 'functional',
    description: 'Body text rendered at #c8c8c8 on #f5f5f5 background — contrast ratio ~1.5:1, well below 3:1.',
    expected: 'Body text contrast against the background meets 3:1 minimum.',
    properties: [
      'Text/background contrast ratio >= 3:1',
      'Text is legible against the page background',
      'No accessibility contrast violation',
    ],
    css: `
      body, .todo-list .label, #toggle-all-label, .todo-count, .filters a, .clear-completed {
        color: #c8c8c8 !important;
      }
      .new-todo { color: #c8c8c8 !important; }
      #brand { color: #d8d8d8 !important; }
    `,
  },
  {
    id: 'vis-func-6',
    type: 'functional',
    description:
      'Full-viewport modal dialog blocks all UI and has no close button or backdrop dismiss.',
    expected: 'No modal blocks the application without a dismiss affordance.',
    properties: [
      'No full-screen blocking overlay without close affordance',
      'Application UI is reachable',
      'Modal (if present) has a visible close control',
    ],
    domScript: `
      const m = document.createElement('div');
      m.id = 'blocking-modal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(20,20,20,0.95);z-index:9999;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;';
      m.textContent = 'Loading...';
      document.body.appendChild(m);
    `,
  },
  {
    id: 'vis-func-7',
    type: 'functional',
    description: 'All delete buttons translated 2000px to the right, off-screen.',
    expected: 'Delete buttons for each todo are visible inside the list row.',
    properties: [
      'Delete button is within the visible row bounds',
      'User can locate the delete button without scrolling',
      'List row layout preserved',
    ],
    css: `
      .todo-list .destroy {
        transform: translateX(2000px) !important;
      }
    `,
  },
  {
    id: 'vis-func-8',
    type: 'functional',
    description: 'List items vertically overlap by ~60% via negative top margin.',
    expected: 'List items are visually separated; no row overlaps the row above it.',
    properties: [
      'No row-to-row vertical overlap',
      'Each todo label is fully readable',
      'List item spacing preserved',
    ],
    css: `
      .todo-list li + li {
        margin-top: -32px !important;
      }
      .todo-list li {
        background: rgba(255,255,255,0.6);
      }
    `,
  },
  {
    id: 'vis-func-9',
    type: 'functional',
    description: 'Visible label text for new-todo input removed and its `for` association severed.',
    expected: 'The new-todo input has an associated label (visible or programmatic).',
    properties: [
      'New-todo input has an associated <label> element',
      'Screen reader can announce the field purpose',
      'Form accessibility preserved',
    ],
    domScript: `
      const lbl = document.getElementById('new-todo-label');
      if (lbl) lbl.remove();
      const input = document.getElementById('new-todo');
      if (input) {
        input.removeAttribute('aria-label');
        input.removeAttribute('placeholder');
      }
    `,
  },
  {
    id: 'vis-func-10',
    type: 'functional',
    description:
      'Toggle checkboxes replaced with non-interactive square <span> visuals (no input element).',
    expected: 'Each todo row has an interactive checkbox to toggle completion.',
    properties: [
      'Row toggle is an interactive checkbox input',
      'User can mark a todo complete by clicking the toggle',
      'Toggle conveys checked/unchecked state',
    ],
    domScript: `
      for (const t of document.querySelectorAll('.todo-list .toggle')) {
        const span = document.createElement('span');
        span.style.cssText = 'display:inline-block;width:24px;height:24px;border:2px solid #999;background:#fff;flex:0 0 auto;';
        t.parentNode.replaceChild(span, t);
      }
    `,
  },
  {
    id: 'vis-func-11',
    type: 'functional',
    description:
      'Error banner rendered visible but with a higher-z opaque card placed on top of it.',
    expected: 'When the error banner is shown, it is fully visible and not occluded.',
    properties: [
      'Error banner is not occluded by other elements',
      'Error message text is fully readable',
      'Error stacking context preserved',
    ],
    domScript: `
      const e = document.getElementById('error-banner');
      if (e) e.classList.add('visible');
      const cover = document.createElement('div');
      cover.style.cssText = 'position:absolute;left:50%;top:480px;transform:translateX(-50%);width:540px;height:60px;background:#ffffff;border:1px solid #e6e6e6;z-index:100;';
      document.body.appendChild(cover);
    `,
  },
  {
    id: 'vis-func-12',
    type: 'functional',
    description:
      'All focus indicators removed; keyboard focus on new-todo input is forced but invisible.',
    expected: 'A visible focus indicator appears on keyboard-focused interactive elements.',
    properties: [
      'Focused element shows a visible focus indicator (outline/ring)',
      'Keyboard navigation is observable',
      'Accessibility focus visibility preserved',
    ],
    css: `
      *, *:focus, *:focus-visible, *:focus-within {
        outline: none !important;
        box-shadow: none !important;
        border-color: inherit !important;
      }
      .new-todo:focus { border-color: #e6e6e6 !important; }
    `,
    domScript: `
      const i = document.getElementById('new-todo');
      if (i) i.focus();
    `,
  },

  // ----- COSMETIC (12) ------------------------------------------------------
  {
    id: 'vis-cosm-1',
    type: 'cosmetic',
    description: 'Font family swapped from system sans-serif to Georgia serif.',
    expected: 'Application typography renders without breaking layout.',
    properties: [
      'All text renders within its container',
      'No row wrapping changes that hide content',
      'Layout integrity preserved',
    ],
    css: `
      body, .new-todo, .add-button, .todo-list, .todo-list .label,
      .filters a, .clear-completed, .todo-count, #toggle-all-label, #brand {
        font-family: Georgia, 'Times New Roman', serif !important;
      }
    `,
  },
  {
    id: 'vis-cosm-2',
    type: 'cosmetic',
    description: 'Primary color shifted from blue (#1976d2) to green (#2e7d32).',
    expected: 'Primary CTA remains visible and visually distinct from neutral chrome.',
    properties: [
      'Primary CTA visible',
      'Primary CTA visually distinguishable from background',
      'Layout integrity preserved',
    ],
    css: `
      :root { --color-primary: #2e7d32; }
      .add-button { background: #2e7d32 !important; border-color: #2e7d32 !important; }
      .add-button:hover { background: #1b5e20 !important; }
      .new-todo:focus { border-color: #2e7d32 !important; box-shadow: 0 0 0 2px rgba(46,125,50,0.25) !important; }
      #brand { color: #2e7d32 !important; }
      .filters a.selected { border-color: #2e7d32 !important; color: #2e7d32 !important; }
    `,
  },
  {
    id: 'vis-cosm-3',
    type: 'cosmetic',
    description: 'Border radius increased from 4px to 12px on all rounded surfaces.',
    expected: 'Rounded surface treatment is consistent; no content clipped.',
    properties: [
      'No content clipped at element edges',
      'Rounded corners applied consistently',
      'Layout integrity preserved',
    ],
    css: `
      :root { --radius: 12px; }
      .todoapp, .add-button, .new-todo, .todo-list .destroy,
      .clear-completed, .filters a, .error-banner {
        border-radius: 12px !important;
      }
    `,
  },
  {
    id: 'vis-cosm-4',
    type: 'cosmetic',
    description: 'Padding on header, main, and footer increased by 4px (16 → 20 px).',
    expected: 'Container padding is consistent; touch targets remain reachable.',
    properties: [
      'All controls remain within the visible container',
      'Touch targets remain reachable',
      'Layout integrity preserved',
    ],
    css: `
      :root { --pad: 20px; }
      .header, .main, .footer { padding: 20px !important; }
    `,
  },
  {
    id: 'vis-cosm-5',
    type: 'cosmetic',
    description: 'Subtle drop shadow added to add, destroy, and clear-completed buttons.',
    expected: 'Buttons render with a subtle shadow; remain visually identifiable as buttons.',
    properties: [
      'Buttons remain identifiable',
      'No button content obscured by the shadow',
      'Layout integrity preserved',
    ],
    css: `
      .add-button, .todo-list .destroy, .clear-completed {
        box-shadow: 0 2px 4px rgba(0,0,0,0.15) !important;
      }
    `,
  },
  {
    id: 'vis-cosm-6',
    type: 'cosmetic',
    description: 'Italic styling applied to the "items left" counter and filter labels.',
    expected: 'Footer labels render in italic; remain legible.',
    properties: [
      'Footer text remains legible',
      'No truncation of italic text',
      'Layout integrity preserved',
    ],
    css: `
      .todo-count, .filters a, #toggle-all-label {
        font-style: italic !important;
      }
    `,
  },
  {
    id: 'vis-cosm-7',
    type: 'cosmetic',
    description: 'Page background changed from flat #f5f5f5 to a subtle linear gradient.',
    expected: 'Page background renders without disrupting card legibility.',
    properties: [
      'Card content remains legible against the background',
      'No text/background contrast violations introduced',
      'Layout integrity preserved',
    ],
    css: `
      body {
        background: linear-gradient(135deg, #f5f5f5 0%, #e3f2fd 100%) !important;
      }
    `,
  },
  {
    id: 'vis-cosm-8',
    type: 'cosmetic',
    description: 'Delete button text label "Delete" swapped for the visually equivalent "Remove".',
    expected: 'Each row exposes an equivalent delete affordance.',
    properties: [
      'A delete affordance is present on each row',
      'Affordance label is human-readable',
      'Affordance touch target meets minimum size',
    ],
    domScript: `
      for (const b of document.querySelectorAll('.todo-list .destroy')) {
        b.textContent = 'Remove';
      }
    `,
  },
  {
    id: 'vis-cosm-9',
    type: 'cosmetic',
    description: 'Letter-spacing increased by 0.5px across body text.',
    expected: 'Text renders with slightly expanded letter-spacing; remains within container bounds.',
    properties: [
      'No text overflow from the container',
      'All labels remain on a single line where intended',
      'Layout integrity preserved',
    ],
    css: `
      body, .new-todo, .add-button, .todo-list .label,
      .filters a, .clear-completed, .todo-count {
        letter-spacing: 0.5px !important;
      }
    `,
  },
  {
    id: 'vis-cosm-10',
    type: 'cosmetic',
    description: 'Filter pill heights increased by 4px (slightly chunkier filter row).',
    expected: 'Filter pills render with slightly increased height; remain on a single row.',
    properties: [
      'Filter pills remain on a single row',
      'All three filter options visible',
      'Layout integrity preserved',
    ],
    css: `
      .filters a {
        padding-top: 8px !important;
        padding-bottom: 8px !important;
      }
    `,
  },
  {
    id: 'vis-cosm-11',
    type: 'cosmetic',
    description: 'Hover-state simulated: Add button rendered in its deeper-blue hover color (#0d47a1) at rest.',
    expected: 'Add button renders in a primary-blue color; remains identifiable.',
    properties: [
      'Add button is visible',
      'Add button color is a primary-blue palette value',
      'Layout integrity preserved',
    ],
    css: `
      .add-button { background: #0d47a1 !important; border-color: #0d47a1 !important; }
    `,
  },
  {
    id: 'vis-cosm-12',
    type: 'cosmetic',
    description: 'Brand "todos" wordmark scaled up 20% (48px → 57.6px).',
    expected: 'Brand wordmark renders larger but stays within the header.',
    properties: [
      'Brand wordmark stays within the header container',
      'Header form below the wordmark remains visible',
      'Layout integrity preserved',
    ],
    css: `
      #brand { font-size: 57.6px !important; }
    `,
  },
];

if (SEEDINGS.length !== 24) {
  throw new Error('Seedings file must contain exactly 24 entries; found ' + SEEDINGS.length);
}
