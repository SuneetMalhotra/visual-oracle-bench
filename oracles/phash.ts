// oracles/phash.ts
//
// Oracle O2: perceptual hash (dHash) with Hamming-distance verdict.
//
// Per pre-registration `§4.3 Oracles`:
//   "O2 — perceptual hash: dHash with Hamming-distance threshold pre-specified
//    by the same calibration procedure."
// As with pixel_diff.ts, the threshold is a CONSTRUCTOR PARAMETER and the
// calibrated value is determined at W7 against the 80-pair held-out
// calibration set (pre-reg §11 seed 20260619).
//
// dHash algorithm (Hacker Factor's "Looks Like It" formulation):
//   1. Resize image to 9 x 8 grayscale.
//   2. For each row, compare each pixel to its right neighbor: 1 if
//      left < right else 0. -> 8 rows x 8 bit-columns = 64-bit hash.
//   3. Distance between two hashes = Hamming distance (popcount of XOR).
//
// CLI:
//   npx tsx oracles/phash.ts <baseline.png> <defect.png> [--threshold 5]

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

export interface PhashVerdict {
  verdict: 'pass' | 'fail';
  /** Number of bit positions that differ; 0 = identical hashes, 64 = inverted. */
  hamming_distance: number;
  /** Hamming distance above which the pair is FAILed. */
  threshold: number;
  /** 64-bit dHash of baseline as hex (16 chars). */
  baseline_hash: string;
  defect_hash: string;
}

/**
 * Compute the 64-bit dHash of a PNG file. Resize to 9x8 grayscale; left-vs-right
 * difference per row; 8 bits per row x 8 rows = 64 bits.
 *
 * Returned as a BigInt for easy XOR and as a 16-character hex string for
 * human-readable artifacts.
 *
 * Exported for unit testing.
 */
export async function computeDHash(
  pngPath: string,
): Promise<{ bits: bigint; hex: string }> {
  const { data, info } = await sharp(pngPath)
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== 9 || info.height !== 8) {
    throw new Error(`dHash resize produced unexpected dims ${info.width}x${info.height}`);
  }
  let bits = 0n;
  let bitIndex = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      if (left < right) {
        bits |= 1n << bitIndex;
      }
      bitIndex++;
    }
  }
  const hex = bits.toString(16).padStart(16, '0');
  return { bits, hex };
}

/** Popcount of a 64-bit BigInt. */
export function popcount64(x: bigint): number {
  let n = x;
  let c = 0;
  while (n !== 0n) {
    n &= n - 1n;
    c++;
  }
  return c;
}

export class PhashOracle {
  /**
   * @param threshold Hamming distance strictly greater than which the pair
   *   is FAILed. Calibrated at W7 (pre-reg §4.3). Default 5 is a conservative
   *   value used for the unit test on the 12-PNG offline smoke corpus.
   *   Distances of 0-5 typically indicate "perceptually identical"; 10+
   *   indicates "clearly different" per the Hacker Factor reference.
   */
  constructor(public readonly threshold: number = 5) {}

  async compare(baselinePath: string, defectPath: string): Promise<PhashVerdict> {
    if (!existsSync(baselinePath)) throw new Error(`baseline not found: ${baselinePath}`);
    if (!existsSync(defectPath)) throw new Error(`defect not found: ${defectPath}`);
    const [a, b] = await Promise.all([computeDHash(baselinePath), computeDHash(defectPath)]);
    const distance = popcount64(a.bits ^ b.bits);
    return {
      verdict: distance > this.threshold ? 'fail' : 'pass',
      hamming_distance: distance,
      threshold: this.threshold,
      baseline_hash: a.hex,
      defect_hash: b.hex,
    };
  }
}

// ---------------------------------------------------------------------------
// CLI: npx tsx oracles/phash.ts <baseline.png> <defect.png> [--threshold 5]
// ---------------------------------------------------------------------------

async function cli(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error('usage: npx tsx oracles/phash.ts <baseline.png> <defect.png> [--threshold 5]');
    process.exit(2);
  }
  const baseline = resolve(argv[0]);
  const defect = resolve(argv[1]);
  let threshold = 5;
  const thrIdx = argv.indexOf('--threshold');
  if (thrIdx !== -1 && argv[thrIdx + 1]) {
    threshold = parseInt(argv[thrIdx + 1], 10);
  }
  const oracle = new PhashOracle(threshold);
  const verdict = await oracle.compare(baseline, defect);
  console.log(JSON.stringify(verdict, null, 2));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  cli().catch((e) => {
    console.error('[phash] error:', (e as Error).message);
    process.exit(1);
  });
}
