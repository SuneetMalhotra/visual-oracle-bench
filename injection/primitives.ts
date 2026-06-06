// injection/primitives.ts
//
// Defect injection primitives for the visual-oracle-bench corpus.
//
// Each primitive injects ONE defect category into a live Playwright page,
// returning a structured DefectRecord describing what was changed.
//
// Pre-registered defect categories (locked at OSF pre-registration 2026-06-19,
// see preregistration/draft.md section 4.2):
//
//   layout      - bounding box shift >= 8 px on any axis
//   color       - foreground or background hue shift >= 15 deg in HSL
//   missing     - visible interactive element removed from DOM
//   truncation  - text overflow without ellipsis, or vice versa
//   zorder      - element rendered in front of element it should be behind
//   contrast    - text/background contrast drops below WCAG AA (4.5:1)
//
// IMPLEMENTATION NOTE: this file replaces the W1 Python stub `primitives.py`.
// TypeScript was chosen to match the existing Playwright renderer
// (`capture/source-render-todomvc.ts`) and the existing seedings catalog
// (`injection/source-seedings-todomvc.ts`). Statistical analysis remains in
// Python/R (`analysis/source-analysis-kappa.py`).

import type { Page } from 'playwright';

export type DefectCategory =
  | 'layout'
  | 'color'
  | 'missing'
  | 'truncation'
  | 'zorder'
  | 'contrast';

export interface DefectRecord {
  /** App slug, e.g. "conduit". */
  app: string;
  /** Stable identifier, e.g. "conduit-layout-001". */
  defect_id: string;
  /** Pre-registered category. */
  category: DefectCategory;
  /** Selector(s) that were mutated. */
  selector: string;
  /** Human-readable description for the ground-truth ledger. */
  description: string;
  /** What a coder should look for to verify the defect was applied. */
  diff_signature: string;
  /** Free-form structured details for reproduction. */
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rgbStringToHsl(rgb: string): { h: number; s: number; l: number; a: number } | null {
  // Accepts "rgb(r, g, b)" or "rgba(r, g, b, a)". Returns null on parse failure.
  const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return null;
  const r = parseInt(m[1], 10) / 255;
  const g = parseInt(m[2], 10) / 255;
  const b = parseInt(m[3], 10) / 255;
  const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s, l, a };
}

function hslToRgbString(h: number, s: number, l: number, a: number): string {
  // Standard HSL -> RGB. h in degrees, s and l in [0,1].
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  if (a < 1) return `rgba(${r}, ${g}, ${b}, ${a})`;
  return `rgb(${r}, ${g}, ${b})`;
}

function relativeLuminance(r: number, g: number, b: number): number {
  // WCAG 2.x relative luminance. r,g,b in 0-255.
  const transform = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

function contrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const l1 = relativeLuminance(...rgb1);
  const l2 = relativeLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgbTriplet(rgb: string): [number, number, number] | null {
  const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

// ---------------------------------------------------------------------------
// Primitive 1: layout shift
// ---------------------------------------------------------------------------

/**
 * Layout shift: translate element bounding box by (dx, dy) pixels via
 * CSS `transform: translate(...)`. Inline-style write to avoid stylesheet
 * cascade conflicts.
 *
 * Defect manifests as: SSIM drop > 0.05 in the shifted region.
 * Inter-coder kappa target: >= 0.80.
 */
export async function shift_element(
  page: Page,
  selector: string,
  dx: number = 12,
  dy: number = 0,
  opts: { app?: string; defect_id?: string } = {},
): Promise<DefectRecord> {
  const applied = await page.evaluate(
    ({ sel, dx, dy }) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return { ok: false, reason: 'selector not found' };
      const prior = el.style.transform || '';
      el.style.transform = `${prior} translate(${dx}px, ${dy}px)`.trim();
      return { ok: true, prior_transform: prior };
    },
    { sel: selector, dx, dy },
  );
  if (!applied.ok) {
    throw new Error(`shift_element: ${applied.reason} for selector ${selector}`);
  }
  return {
    app: opts.app ?? 'unknown',
    defect_id: opts.defect_id ?? `layout-${selector}`,
    category: 'layout',
    selector,
    description: `Element translated by (${dx}, ${dy}) pixels via CSS transform.`,
    diff_signature: `Bounding box of ${selector} shifted ${Math.hypot(dx, dy).toFixed(1)} px from baseline.`,
    details: { dx, dy, method: 'css-transform-translate', prior_transform: applied.prior_transform },
  };
}

// ---------------------------------------------------------------------------
// Primitive 2: color mutation
// ---------------------------------------------------------------------------

/**
 * Color drift: rotate HSL hue of the given CSS property by `delta_hue` degrees.
 * Reads computed style, rotates in HSL space, writes back via inline style.
 *
 * `prop` defaults to "color" (foreground); pass "backgroundColor" for bg.
 *
 * Defect manifests as: Delta-E2000 > 5 in affected pixels.
 * Inter-coder kappa target: >= 0.75.
 */
export async function mutate_color(
  page: Page,
  selector: string,
  prop: 'color' | 'backgroundColor' | 'borderColor' = 'color',
  delta_hue: number = 30,
  opts: { app?: string; defect_id?: string } = {},
): Promise<DefectRecord> {
  // Read computed style in browser context.
  const before = await page.evaluate(
    ({ sel, prop }) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      const val = (cs as unknown as Record<string, string>)[prop];
      return val ?? null;
    },
    { sel: selector, prop },
  );
  if (!before) {
    throw new Error(`mutate_color: cannot read computed ${prop} for ${selector}`);
  }
  const hsl = rgbStringToHsl(before);
  if (!hsl) {
    throw new Error(`mutate_color: cannot parse computed value "${before}" as RGB`);
  }
  if (hsl.a === 0) {
    throw new Error(
      `mutate_color: computed ${prop} of ${selector} is fully transparent (${before}); ` +
        `hue rotation would be a no-op. Pick a different selector or property (e.g. an ` +
        `ancestor whose ${prop} is opaque, or a sibling text element).`,
    );
  }
  if (hsl.s === 0) {
    // Pure greyscale -> hue rotation has no visible effect. Bump saturation to
    // make the rotation observable; this is the documented behavior.
    hsl.s = 0.4;
  }
  const rotated = hslToRgbString(hsl.h + delta_hue, hsl.s, hsl.l, hsl.a);
  await page.evaluate(
    ({ sel, prop, rotated }) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return;
      // setProperty needs the kebab-cased name; assigning to el.style[prop] is
      // OK for the three properties we support.
      (el.style as unknown as Record<string, string>)[prop] = rotated;
    },
    { sel: selector, prop, rotated },
  );
  return {
    app: opts.app ?? 'unknown',
    defect_id: opts.defect_id ?? `color-${selector}`,
    category: 'color',
    selector,
    description: `Hue of ${prop} rotated by ${delta_hue} deg in HSL space.`,
    diff_signature: `Computed ${prop} of ${selector} changed from ${before} to ${rotated}.`,
    details: {
      prop,
      delta_hue,
      before_rgb: before,
      after_rgb: rotated,
      before_hsl: hsl,
      method: 'hsl-rotate-inline-style',
    },
  };
}

// ---------------------------------------------------------------------------
// Primitive 3: remove element
// ---------------------------------------------------------------------------

/**
 * Missing element: remove visible interactive element from DOM via
 * Element.remove().
 *
 * Defect manifests as: >2% pixel delta in the element's prior bounding region.
 * Inter-coder kappa target: >= 0.90.
 */
export async function remove_element(
  page: Page,
  selector: string,
  opts: { app?: string; defect_id?: string } = {},
): Promise<DefectRecord> {
  const result = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return { ok: false, reason: 'selector not found' };
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    el.remove();
    return {
      ok: true,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      tag,
    };
  }, selector);
  if (!result.ok) {
    throw new Error(`remove_element: ${result.reason} for selector ${selector}`);
  }
  return {
    app: opts.app ?? 'unknown',
    defect_id: opts.defect_id ?? `missing-${selector}`,
    category: 'missing',
    selector,
    description: `<${result.tag}> matching ${selector} removed from DOM.`,
    diff_signature: `Element previously occupying ${JSON.stringify(result.rect)} is absent.`,
    details: { method: 'element.remove', removed_rect: result.rect, removed_tag: result.tag },
  };
}

// ---------------------------------------------------------------------------
// Primitive 4: shrink container (truncation)
// ---------------------------------------------------------------------------

/**
 * Truncation: shrink a container width to force text overflow WITHOUT
 * setting `text-overflow: ellipsis`. Caller may inspect resulting
 * `scrollWidth > clientWidth` to confirm overflow occurred.
 *
 * Defect manifests as: edge-density spike at container right boundary.
 * Inter-coder kappa target: >= 0.75.
 */
export async function shrink_container(
  page: Page,
  selector: string,
  width_pct: number = 0.6,
  opts: { app?: string; defect_id?: string } = {},
): Promise<DefectRecord> {
  if (width_pct <= 0 || width_pct >= 1) {
    throw new Error(`shrink_container: width_pct must be in (0,1); got ${width_pct}`);
  }
  const applied = await page.evaluate(
    ({ sel, pct }) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return { ok: false, reason: 'selector not found' };
      const rect = el.getBoundingClientRect();
      const new_max = Math.max(20, Math.floor(rect.width * pct));
      // Important: NO text-overflow:ellipsis -> raw clip, which is the defect.
      el.style.maxWidth = `${new_max}px`;
      el.style.overflow = 'hidden';
      el.style.textOverflow = 'clip';
      el.style.whiteSpace = 'nowrap';
      // Force layout flush for measurement.
      const overflow = el.scrollWidth > el.clientWidth;
      return {
        ok: true,
        original_width: rect.width,
        new_max,
        overflowed: overflow,
      };
    },
    { sel: selector, pct: width_pct },
  );
  if (!applied.ok) {
    throw new Error(`shrink_container: ${applied.reason} for selector ${selector}`);
  }
  return {
    app: opts.app ?? 'unknown',
    defect_id: opts.defect_id ?? `truncation-${selector}`,
    category: 'truncation',
    selector,
    description: `Container ${selector} max-width set to ${Math.round(width_pct * 100)}% of original; overflow:hidden; no ellipsis.`,
    diff_signature: `Text in ${selector} clipped at right boundary without ellipsis indicator.`,
    details: {
      method: 'max-width-overflow-hidden-no-ellipsis',
      width_pct,
      original_width_px: applied.original_width,
      new_max_px: applied.new_max,
      overflow_confirmed: applied.overflowed,
    },
  };
}

// ---------------------------------------------------------------------------
// Primitive 5: swap z-index
// ---------------------------------------------------------------------------

/**
 * Z-order violation: read both elements' computed z-index, swap their inline
 * z-index values. If either has computed z-index "auto", we substitute 0
 * before swapping (so a value-vs-auto swap still produces a stacking change).
 *
 * Defect manifests as: overlap region SSIM < 0.7 vs. baseline.
 * Inter-coder kappa target: >= 0.70.
 */
export async function swap_zindex(
  page: Page,
  selector_a: string,
  selector_b: string,
  opts: { app?: string; defect_id?: string } = {},
): Promise<DefectRecord> {
  const result = await page.evaluate(
    ({ a, b }) => {
      const elA = document.querySelector(a) as HTMLElement | null;
      const elB = document.querySelector(b) as HTMLElement | null;
      if (!elA) return { ok: false, reason: `selector_a not found: ${a}` };
      if (!elB) return { ok: false, reason: `selector_b not found: ${b}` };
      const zA_raw = getComputedStyle(elA).zIndex;
      const zB_raw = getComputedStyle(elB).zIndex;
      const zA = zA_raw === 'auto' ? '0' : zA_raw;
      const zB = zB_raw === 'auto' ? '0' : zB_raw;
      // Ensure both are positioned for z-index to take effect.
      if (getComputedStyle(elA).position === 'static') elA.style.position = 'relative';
      if (getComputedStyle(elB).position === 'static') elB.style.position = 'relative';
      // Swap.
      elA.style.zIndex = zB;
      elB.style.zIndex = zA;
      return { ok: true, before: { a: zA_raw, b: zB_raw }, after: { a: zB, b: zA } };
    },
    { a: selector_a, b: selector_b },
  );
  if (!result.ok) {
    throw new Error(`swap_zindex: ${result.reason}`);
  }
  return {
    app: opts.app ?? 'unknown',
    defect_id: opts.defect_id ?? `zorder-${selector_a}-${selector_b}`,
    category: 'zorder',
    selector: `${selector_a} ↔ ${selector_b}`,
    description: `Z-index swapped between ${selector_a} and ${selector_b}.`,
    diff_signature: `Element ${selector_a} now appears in front/behind ${selector_b} relative to baseline.`,
    details: {
      method: 'computed-zindex-swap',
      selector_a,
      selector_b,
      before: result.before,
      after: result.after,
    },
  };
}

// ---------------------------------------------------------------------------
// Primitive 6: reduce contrast
// ---------------------------------------------------------------------------

/**
 * Contrast violation: lighten text color toward background until WCAG ratio
 * reaches `target_ratio` (default 3.0, which is below the WCAG AA 4.5:1
 * threshold for normal text).
 *
 * The walk: convert text color to HSL, increase L by 0.02 per step, recompute
 * ratio against the element's background. Capped at 100 steps to avoid
 * infinite loops on pathological color pairs.
 *
 * Defect manifests as: computed WCAG ratio < 4.5 (target: 3.0).
 * Inter-coder kappa target: >= 0.75.
 */
export async function reduce_contrast(
  page: Page,
  text_selector: string,
  target_ratio: number = 3.0,
  opts: { app?: string; defect_id?: string } = {},
): Promise<DefectRecord> {
  // Read text + effective background colors in browser context.
  // For background, walk up the parent chain until a non-transparent value.
  const colors = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const text = getComputedStyle(el).color;
    let bg = getComputedStyle(el).backgroundColor;
    let cur: HTMLElement | null = el;
    while (cur && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
      cur = cur.parentElement;
      if (!cur) {
        bg = 'rgb(255, 255, 255)';
        break;
      }
      bg = getComputedStyle(cur).backgroundColor;
    }
    return { text, bg };
  }, text_selector);
  if (!colors) {
    throw new Error(`reduce_contrast: element not found for ${text_selector}`);
  }
  const textRgb = parseRgbTriplet(colors.text);
  const bgRgb = parseRgbTriplet(colors.bg);
  if (!textRgb || !bgRgb) {
    throw new Error(`reduce_contrast: cannot parse colors text="${colors.text}" bg="${colors.bg}"`);
  }
  const beforeRatio = contrastRatio(textRgb, bgRgb);

  // Walk: lighten text toward background by interpolating in linear RGB.
  // Step weight w increases from 0 in 0.02 increments until ratio <= target_ratio.
  let chosenColor = `rgb(${textRgb[0]}, ${textRgb[1]}, ${textRgb[2]})`;
  let finalRatio = beforeRatio;
  for (let i = 1; i <= 100; i++) {
    const w = i * 0.02;
    const r = Math.round(textRgb[0] + (bgRgb[0] - textRgb[0]) * w);
    const g = Math.round(textRgb[1] + (bgRgb[1] - textRgb[1]) * w);
    const b = Math.round(textRgb[2] + (bgRgb[2] - textRgb[2]) * w);
    const ratio = contrastRatio([r, g, b], bgRgb);
    if (ratio <= target_ratio) {
      chosenColor = `rgb(${r}, ${g}, ${b})`;
      finalRatio = ratio;
      break;
    }
    chosenColor = `rgb(${r}, ${g}, ${b})`;
    finalRatio = ratio;
  }
  await page.evaluate(
    ({ sel, color }) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) el.style.color = color;
    },
    { sel: text_selector, color: chosenColor },
  );
  return {
    app: opts.app ?? 'unknown',
    defect_id: opts.defect_id ?? `contrast-${text_selector}`,
    category: 'contrast',
    selector: text_selector,
    description: `Text color of ${text_selector} lightened until WCAG contrast ratio dropped from ${beforeRatio.toFixed(2)} to ${finalRatio.toFixed(2)}.`,
    diff_signature: `Computed contrast ratio of ${text_selector} below WCAG AA 4.5:1 (now ${finalRatio.toFixed(2)}).`,
    details: {
      method: 'linear-rgb-walk-toward-bg',
      target_ratio,
      before_ratio: beforeRatio,
      after_ratio: finalRatio,
      before_text_color: colors.text,
      after_text_color: chosenColor,
      background_color: colors.bg,
    },
  };
}

// ---------------------------------------------------------------------------
// Registry, for selection by category name (used by smoke test + harness).
// ---------------------------------------------------------------------------

export const PRIMITIVES = {
  layout: shift_element,
  color: mutate_color,
  missing: remove_element,
  truncation: shrink_container,
  zorder: swap_zindex,
  contrast: reduce_contrast,
} as const;
