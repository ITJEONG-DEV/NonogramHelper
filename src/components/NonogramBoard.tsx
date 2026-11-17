import { Fragment, useEffect, useRef, useState } from 'react';
import { type Cell, EMPTY, FILLED, UNKNOWN, lineSatisfied } from '../nonogram/line';
import { type Puzzle, lineIndices } from '../nonogram/puzzle';
import type { Hint } from '../nonogram/hints';

export type Tool = 'fill' | 'cross';

interface Props {
  puzzle: Puzzle;
  grid: Cell[];
  cursor: number | null;
  tool: Tool;
  hint: Hint | null;
  hintLevel: number;
  /** 한 번 누르고 끄는 동안의 칠하기. first가 true면 새 획 */
  onPaint: (cells: number[], value: Cell, first: boolean) => void;
  onCursor: (cell: number) => void;
}

function useCellSize(puzzle: Puzzle) {
  const calc = () => {
    const w = puzzle.cols.length;
    const clueCols = Math.max(1, ...puzzle.rows.map((r) => r.length));
    const avail = Math.min(window.innerWidth, 760) - 32;
    // 행 단서 칸은 숫자 하나당 셀 폭의 0.6배 정도
    const size = Math.floor(avail / (w + clueCols * 0.6));
    return Math.max(14, Math.min(34, size));
  };
  const [size, setSize] = useState(calc);
  useEffect(() => {
    setSize(calc());
    const onResize = () => setSize(calc());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [puzzle]);
  return size;
}

export function NonogramBoard({ puzzle, grid, cursor, tool, hint, hintLevel, onPaint, onCursor }: Props) {
  const w = puzzle.cols.length;
  const h = puzzle.rows.length;
  const size = useCellSize(puzzle);
  const stroke = useRef<{ value: Cell; seen: Set<number> } | null>(null);

  const focus = new Set(hint && hintLevel >= 1 && hint.line ? lineIndices(puzzle, hint.line) : []);
  const preview = new Map<number, Cell>(hint && hintLevel >= 3 ? hint.changes.map((c) => [c.cell, c.value]) : []);
  const rowDone = puzzle.rows.map((clue, r) => lineSatisfied(clue, grid.slice(r * w, r * w + w)));
  const colDone = puzzle.cols.map((clue, c) => lineSatisfied(clue, Array.from({ length: h }, (_, r) => grid[r * w + c])));
  const focusRow = hint && hintLevel >= 1 && hint.line?.kind === 'row' ? hint.line.index : -1;
  const focusCol = hint && hintLevel >= 1 && hint.line?.kind === 'col' ? hint.line.index : -1;
  const curR = cursor !== null ? Math.floor(cursor / w) : -1;
  const curC = cursor !== null ? cursor % w : -1;

  const cellAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-cell]');
    return el ? Number(el.getAttribute('data-cell')) : null;
  };

  const start = (e: React.PointerEvent, i: number) => {
    e.preventDefault();
    const useTool: Tool = e.button === 2 ? 'cross' : tool;
    const target = useTool === 'fill' ? FILLED : EMPTY;
    const value: Cell = grid[i] === target ? UNKNOWN : target;
    stroke.current = { value, seen: new Set([i]) };
    onCursor(i);
    onPaint([i], value, true);
  };

  const move = (e: React.PointerEvent) => {
    const s = stroke.current;
    if (!s) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || s.seen.has(i)) return;
    s.seen.add(i);
    onPaint([i], s.value, false);
  };

  useEffect(() => {
    const end = () => (stroke.current = null);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, []);

  const clueFont = Math.max(10, Math.round(size * 0.48));

  return (
    <div className="nono-scroll">
      <div
        className="nono"
        style={{
          gridTemplateColumns: `auto repeat(${w}, ${size}px)`,
          gridTemplateRows: `auto repeat(${h}, ${size}px)`,
          fontSize: clueFont,
        }}
        onPointerMove={move}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="nono-corner" />
        {puzzle.cols.map((clue, c) => (
          <div
            key={`c${c}`}
            className={['nono-col-clue', colDone[c] ? 'done' : '', c === focusCol ? 'focus' : '', c === curC ? 'cursor-line' : '', c % 5 === 4 && c !== w - 1 ? 'edge-r' : ''].join(' ')}
          >
            {(clue.length ? clue : [0]).map((n, k) => (
              <span key={k}>{n}</span>
            ))}
          </div>
        ))}
        {puzzle.rows.map((clue, r) => (
          <Fragment key={r}>
            <div
              className={['nono-row-clue', rowDone[r] ? 'done' : '', r === focusRow ? 'focus' : '', r === curR ? 'cursor-line' : '', r % 5 === 4 && r !== h - 1 ? 'edge-b' : ''].join(' ')}
            >
              {(clue.length ? clue : [0]).map((n, k) => (
                <span key={k}>{n}</span>
              ))}
            </div>
            {Array.from({ length: w }, (_, c) => {
              const i = r * w + c;
              const v = grid[i];
              const pv = preview.get(i);
              const cls = ['nono-cell'];
              if (v === FILLED) cls.push('filled');
              if (v === EMPTY) cls.push('crossed');
              if (focus.has(i)) cls.push('focus');
              if (pv !== undefined) cls.push(pv === FILLED ? 'will-fill' : pv === EMPTY ? 'will-cross' : 'will-clear');
              if (i === cursor) cls.push('cursor');
              if (c % 5 === 4 && c !== w - 1) cls.push('edge-r');
              if (r % 5 === 4 && r !== h - 1) cls.push('edge-b');
              return (
                <div
                  key={i}
                  data-cell={i}
                  className={cls.join(' ')}
                  role="gridcell"
                  aria-label={`${r + 1}행 ${c + 1}열 ${v === FILLED ? '칠함' : v === EMPTY ? 'X' : '빈칸'}`}
                  onPointerDown={(e) => start(e, i)}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

