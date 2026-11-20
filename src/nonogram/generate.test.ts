import { describe, expect, it } from 'vitest';
import { LEVELS, SIZES, cluesOf, generate, rate } from './generate';
import { solve, validatePuzzle } from './puzzle';

/** 매번 같은 결과가 나오는 난수 */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('랜덤 문제', () => {
  for (const size of SIZES) {
    for (const spec of LEVELS) {
      it(`${size}x${size} ${spec.label}: 답이 하나이고 줄 추론으로 풀리며 난이도 구간에 든다`, () => {
        const r = generate(size, spec.id, seeded(size * 10 + spec.label.length), 20000);
        expect(r.approximate).toBe(false);
        expect(r.puzzle.rows).toHaveLength(size);
        expect(r.puzzle.cols).toHaveLength(size);
        expect(validatePuzzle(r.puzzle)).toBeNull();
        expect(cluesOf(r.solution, size, size)).toEqual(r.puzzle);
        const res = solve(r.puzzle, 2);
        expect(res.count).toBe(1);
        expect(res.solution).toEqual(r.solution);
        const rating = rate(r.puzzle);
        expect(rating.solved).toBe(true);
        expect(rating.open).toBeGreaterThanOrEqual(spec.minOpen);
        expect(rating.open).toBeLessThan(spec.maxOpen);
      });
    }
  }
});
