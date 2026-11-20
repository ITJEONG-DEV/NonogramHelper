import { type Cell, EMPTY, FILLED, UNKNOWN, lineDeductions, runsOf } from './line';
import { type Puzzle, allLines, clueOf, lineIndices } from './puzzle';

export const SIZES = [5, 10, 15, 20] as const;
export type Size = (typeof SIZES)[number];

export type Level = 'easy' | 'medium' | 'hard';

/**
 * 난이도는 빈 판에서 줄 하나씩 겹치기로 바로 정해지는 칸의 비율로 나눈다.
 * 많이 정해질수록 실마리가 많아 쉽고, 적을수록 칸을 조금씩 정하며 가로·세로를 오가야 한다.
 * 어느 난이도든 줄 추론만으로 끝까지 풀리는 문제만 낸다(답이 하나이고 찍을 필요가 없다).
 */
export const LEVELS: { id: Level; label: string; desc: string; density: number; minOpen: number; maxOpen: number }[] = [
  { id: 'easy', label: '쉬움', desc: '처음부터 정해지는 칸이 많아요', density: 0.65, minOpen: 0.6, maxOpen: 1 },
  { id: 'medium', label: '보통', desc: '가로·세로를 몇 번 오가야 해요', density: 0.55, minOpen: 0.3, maxOpen: 0.6 },
  { id: 'hard', label: '어려움', desc: '처음 실마리가 적고 오래 오가야 해요', density: 0.45, minOpen: 0, maxOpen: 0.3 },
];

export const levelLabel = (level: Level) => LEVELS.find((l) => l.id === level)!.label;

export type Random = () => number;

/** 무작위로 칠한 뒤 이웃 칸과 비슷하게 한 번 다듬어, 흩뿌린 점보다 덩어리진 그림을 만든다 */
export function randomGrid(w: number, h: number, density: number, rnd: Random = Math.random): Cell[] {
  const g: Cell[] = Array.from({ length: w * h }, () => (rnd() < density ? FILLED : EMPTY));
  const out = g.slice();
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let filled = 0;
      let total = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
          total++;
          if (g[rr * w + cc] === FILLED) filled++;
        }
      }
      if (filled * 2 > total) out[r * w + c] = FILLED;
      else if (filled * 2 < total) out[r * w + c] = EMPTY;
    }
  }
  return out;
}

export function cluesOf(grid: Cell[], w: number, h: number): Puzzle {
  return {
    rows: Array.from({ length: h }, (_, r) => runsOf(grid.slice(r * w, r * w + w))),
    cols: Array.from({ length: w }, (_, c) => runsOf(Array.from({ length: h }, (_, r) => grid[r * w + c]))),
  };
}

export interface Rating {
  /** 줄 추론만으로 다 풀리는가 */
  solved: boolean;
  /** 빈 판에서 첫 바퀴에 정해지는 칸 비율 */
  open: number;
  /** 모든 줄을 한 번씩 보는 바퀴를 몇 번 돌아야 끝나는가 */
  rounds: number;
}

/** 모든 줄을 바퀴 단위로 동시에 추론해 본다 */
export function rate(p: Puzzle): Rating {
  const g: Cell[] = new Array<Cell>(p.rows.length * p.cols.length).fill(UNKNOWN);
  let rounds = 0;
  let open = 0;
  for (;;) {
    const snap = g.slice();
    let changed = false;
    for (const ref of allLines(p)) {
      const idx = lineIndices(p, ref);
      const ded = lineDeductions(clueOf(p, ref), idx.map((i) => snap[i]));
      if (!ded) return { solved: false, open, rounds };
      for (const { index, value } of ded) {
        if (g[idx[index]] !== UNKNOWN) continue;
        g[idx[index]] = value;
        changed = true;
      }
    }
    if (!changed) break;
    rounds++;
    if (rounds === 1) open = g.filter((v) => v !== UNKNOWN).length / g.length;
  }
  return { solved: !g.includes(UNKNOWN), open, rounds };
}

export interface Generated {
  puzzle: Puzzle;
  solution: Cell[];
  size: Size;
  level: Level;
  /** 원하는 난이도를 시간 안에 못 만들어 가장 가까운 문제를 준 경우 */
  approximate: boolean;
}

/** 원하는 크기·난이도의 문제를 만든다. 시간 안에 못 찾으면 줄 추론으로 풀리는 문제 중 가장 가까운 것을 준다 */
export function generate(size: Size, level: Level, rnd: Random = Math.random, budgetMs = 6000): Generated {
  const spec = LEVELS.find((l) => l.id === level)!;
  const start = Date.now();
  let best: { puzzle: Puzzle; solution: Cell[]; gap: number } | null = null;
  let tries = 0;
  for (;;) {
    tries++;
    // 밀도를 조금씩 흔들어 같은 난이도 안에서도 모양이 다양하게 나오게 한다
    const density = Math.min(0.85, Math.max(0.2, spec.density + (rnd() - 0.5) * 0.1));
    const solution = randomGrid(size, size, density, rnd);
    if (!solution.includes(FILLED)) continue;
    const puzzle = cluesOf(solution, size, size);
    const r = rate(puzzle);
    if (r.solved) {
      if (r.open >= spec.minOpen && r.open < spec.maxOpen) return { puzzle, solution, size, level, approximate: false };
      const gap = r.open < spec.minOpen ? spec.minOpen - r.open : r.open - spec.maxOpen;
      if (!best || gap < best.gap) best = { puzzle, solution, gap };
    }
    if (best && Date.now() - start > budgetMs) return { ...best, size, level, approximate: true };
    if (tries > 1e6) throw new Error('문제를 만들지 못했어요');
  }
}
