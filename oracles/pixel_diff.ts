// oracles/pixel_diff.ts
//
// Oracle O1: pixel diff via Structural Similarity Index (SSIM) on the
// Y (luma) channel.
//
// Per pre-registration `§4.3 Oracles`:
//   "O1 — pixel diff: structural similarity (SSIM) with threshold
//    pre-specified as the value that maximizes F1 on a held-out calibration
//    set of 80 pairs."
// The threshold is therefore a CONSTRUCTOR PARAMETER, not a constant — the
// W7 calibration procedure (seed 20260619, see pre-reg §11) chooses the
// per-corpus value. A conservative default of 0.95 is provided so the unit
// test (`tests/test_oracles_unit.ts`) can run against the offline 12-PNG
// corpus and observe the 6 baseline-vs-defect pairs flagging FAIL.
//
// CLI:
//   npx tsx oracles/pixel_diff.ts <baseline.png> <defect.png> [--threshold 0.95]
//
// Implementation notes:
//   - `sharp` (npm) handles PNG decode + grayscale conversion.
//   - Y channel is extracted via sharp's built-in luminance conversion
//     (`grayscale()`), which uses Rec. 709 weights (close enough to Y'CbCr Y).
//   - SSIM is computed with the standard 11x11 sliding window using the
//     mean / variance / covariance formulation (Wang et al. 2004). Window
//     stride = 1 px for fidelity; this is O(N*window^2) but the corpus is
//     small (800 pairs at 1440x900 -> ~1B ops, runnable in seconds with the
//     N**2 inner pass since we only need per-image mean SSIM, not a full map).
//   - The constants C1, C2 use the canonical L=255, K1=0.01, K2=0.03.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

export interface PixelDiffVerdict {
  /**
   * 'pass' = images are similar (SSIM >= threshold) -> no defect detected;
   * 'fail' = SSIM < threshold -> defect detected.
   */
  verdict: 'pass' | 'fail';
  /** Mean SSIM in [-1, 1]; 1.0 = identical. */
  score: number;
  /** Threshold the verdict was decided against. */
  threshold: number;
  /** Width/height of the (resized-equal) comparison grid. */
  width: number;
  height: number;
}

/**
 * Load a PNG and return Y-channel pixel values as a Float64Array in [0, 255]
 * along with the image dimensions. If `targetWidth`/`targetHeight` are
 * supplied, the image is resized to that size first (used to align two
 * differently-sized images before SSIM).
 */
async function loadGrayscale(
  pngPath: string,
  targetWidth?: number,
  targetHeight?: number,
): Promise<{ data: Float64Array; width: number; height: number }> {
  let img = sharp(pngPath).grayscale();
  if (targetWidth && targetHeight) {
    img = img.resize(targetWidth, targetHeight, { fit: 'fill' });
  }
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const out = new Float64Array(info.width * info.height);
  for (let i = 0; i < out.length; i++) out[i] = data[i];
  return { data: out, width: info.width, height: info.height };
}

/**
 * Mean SSIM over a sliding window. Uses the simplified (no Gaussian weighting)
 * uniform-window formulation, which is the form scikit-image exposes as
 * `structural_similarity(..., gaussian_weights=False)` and is sufficient for
 * the per-image SCALAR verdict we need (the antecedent study used scikit-
 * image; pre-reg §11 pins scikit-image 0.24.x).
 *
 * Exported for unit testing.
 */
export function computeMeanSSIM(
  a: Float64Array,
  b: Float64Array,
  width: number,
  height: number,
  windowSize: number = 11,
): number {
  if (a.length !== b.length) throw new Error('SSIM: image length mismatch');
  if (a.length !== width * height) throw new Error('SSIM: dims mismatch length');
  const L = 255;
  const K1 = 0.01;
  const K2 = 0.03;
  const C1 = (K1 * L) ** 2;
  const C2 = (K2 * L) ** 2;
  const half = Math.floor(windowSize / 2);
  let sumSsim = 0;
  let count = 0;
  // Slide window across image; for each window compute means/vars/covariance.
  for (let y = half; y < height - half; y++) {
    for (let x = half; x < width - half; x++) {
      let muA = 0;
      let muB = 0;
      // First pass: means.
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const idx = (y + dy) * width + (x + dx);
          muA += a[idx];
          muB += b[idx];
        }
      }
      const n = windowSize * windowSize;
      muA /= n;
      muB /= n;
      // Second pass: variances + covariance.
      let varA = 0;
      let varB = 0;
      let cov = 0;
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const idx = (y + dy) * width + (x + dx);
          const da = a[idx] - muA;
          const db = b[idx] - muB;
          varA += da * da;
          varB += db * db;
          cov += da * db;
        }
      }
      // Sample variance (n-1) per scikit-image convention; matches Wang 2004 ref.
      varA /= n - 1;
      varB /= n - 1;
      cov /= n - 1;
      const num = (2 * muA * muB + C1) * (2 * cov + C2);
      const den = (muA * muA + muB * muB + C1) * (varA + varB + C2);
      sumSsim += num / den;
      count++;
    }
  }
  if (count === 0) return 1; // image smaller than window -> degenerate pass
  return sumSsim / count;
}

export class PixelDiffOracle {
  /**
   * @param threshold SSIM below which the pair is FAILed. Calibrated at W7
   *   (pre-reg §4.3) by maximizing F1 on the 80-pair held-out calibration
   *   set with seed 20260619. Default 0.95 is a conservative pre-calibration
   *   value used by the unit test on the 12-PNG offline smoke corpus.
   * @param resizeToMin When the two images have different dimensions (rare —
   *   should only happen if a viewport got rendered wrong), resize the larger
   *   image down to the smaller image's dimensions before comparison. Default
   *   true.
   */
  constructor(
    public readonly threshold: number = 0.95,
    public readonly resizeToMin: boolean = true,
  ) {}

  async compare(baselinePath: string, defectPath: string): Promise<PixelDiffVerdict> {
    if (!existsSync(baselinePath)) throw new Error(`baseline not found: ${baselinePath}`);
    if (!existsSync(defectPath)) throw new Error(`defect not found: ${defectPath}`);

    // Load both images at their native sizes first to discover the comparison grid.
    const baseMeta = await sharp(baselinePath).metadata();
    const defMeta = await sharp(defectPath).metadata();
    let targetW = baseMeta.width!;
    let targetH = baseMeta.height!;
    if (baseMeta.width !== defMeta.width || baseMeta.height !== defMeta.height) {
      if (!this.resizeToMin) {
        throw new Error(
          `PixelDiffOracle: dimension mismatch ${baseMeta.width}x${baseMeta.height} vs ${defMeta.width}x${defMeta.height}; resizeToMin=false`,
        );
      }
      targetW = Math.min(baseMeta.width!, defMeta.width!);
      targetH = Math.min(baseMeta.height!, defMeta.height!);
    }
    const [aImg, bImg] = await Promise.all([
      loadGrayscale(baselinePath, targetW, targetH),
      loadGrayscale(defectPath, targetW, targetH),
    ]);
    const score = computeMeanSSIM(aImg.data, bImg.data, aImg.width, aImg.height);
    return {
      verdict: score >= this.threshold ? 'pass' : 'fail',
      score,
      threshold: this.threshold,
      width: aImg.width,
      height: aImg.height,
    };
  }
}

// ---------------------------------------------------------------------------
// CLI: npx tsx oracles/pixel_diff.ts <baseline.png> <defect.png> [--threshold 0.95]
// ---------------------------------------------------------------------------

async function cli(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error(
      'usage: npx tsx oracles/pixel_diff.ts <baseline.png> <defect.png> [--threshold 0.95]',
    );
    process.exit(2);
  }
  const baseline = resolve(argv[0]);
  const defect = resolve(argv[1]);
  let threshold = 0.95;
  const thrIdx = argv.indexOf('--threshold');
  if (thrIdx !== -1 && argv[thrIdx + 1]) {
    threshold = parseFloat(argv[thrIdx + 1]);
  }
  const oracle = new PixelDiffOracle(threshold);
  const verdict = await oracle.compare(baseline, defect);
  console.log(JSON.stringify(verdict, null, 2));
}

// Run CLI when executed directly.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  cli().catch((e) => {
    console.error('[pixel_diff] error:', (e as Error).message);
    process.exit(1);
  });
}

// Silence unused-import warnings in some configurations.
void readFileSync;
void writeFileSync;
