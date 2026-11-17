import { useEffect, useMemo, useReducer } from 'react';
import { AppNav } from './components/AppNav';
import { HintPanel } from './components/HintPanel';
import { NonogramBoard, type Tool } from './components/NonogramBoard';
import { type Cell, EMPTY, FILLED, UNKNOWN, lineSatisfied } from './nonogram/line';
import { type Puzzle, cluesFromSolution, formatClue, parseClues, solve, validatePuzzle } from './nonogram/puzzle';
import { applyHint, findHint, type Hint } from './nonogram/hints';

type Phase = 'setup' | 'solve';

interface Game {
  phase: Phase;
  rowsText: string;
  colsText: string;
  puzzle: Puzzle | null;
  grid: Cell[];
  solution: Cell[] | null;
}

interface State {
  game: Game;
  history: Game[];
  cursor: number | null;
  tool: Tool;
  hint: Hint | null;
  hintLevel: number;
  message: { tone: 'info' | 'error'; text: string } | null;
}

type Action =
  | { type: 'text'; field: 'rowsText' | 'colsText'; value: string }
  | { type: 'example' }
  | { type: 'start' }
  | { type: 'paint'; cells: number[]; value: Cell; first: boolean }
  | { type: 'cursor'; cell: number }
  | { type: 'move'; dr: number; dc: number }
  | { type: 'step'; delta: number }
  | { type: 'mark'; value: Cell }
  | { type: 'tool'; tool: Tool }  | { type: 'undo' }
  | { type: 'clearGrid' }
  | { type: 'hint' }
  | { type: 'hintApply' }
  | { type: 'hintClose' }
  | { type: 'edit' }
  | { type: 'new' }
  | { type: 'dismiss' };

const STORAGE_KEY = 'nonogram-helper:v1';

const EXAMPLE = ['..##..##..', '.####.####', '##########', '##########', '.########.', '..######..', '...####...', '....##....'];

const emptyGame = (): Game => ({ phase: 'setup', rowsText: '', colsText: '', puzzle: null, grid: [], solution: null });

function loadState(): State {
  const base: State = { game: emptyGame(), history: [], cursor: null, tool: 'fill', hint: null, hintLevel: 0, message: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as { game: Game };
    if (!saved.game || typeof saved.game.rowsText !== 'string') return base;
    return { ...base, game: saved.game };
  } catch {
    return base;
  }
}

function commit(state: State, game: Game): State {
  return { ...state, game, history: [...state.history.slice(-199), state.game], hint: null, hintLevel: 0, message: null };
}

function reducer(state: State, action: Action): State {
  const { game } = state;
  const w = game.puzzle?.cols.length ?? 0;
  const h = game.puzzle?.rows.length ?? 0;
  switch (action.type) {
    case 'text':
      return { ...state, game: { ...game, [action.field]: action.value }, message: null };
    case 'example': {
      const p = cluesFromSolution(EXAMPLE);
      return commit(state, { ...game, rowsText: p.rows.map(formatClue).join('\n'), colsText: p.cols.map(formatClue).join('\n') });
    }
    case 'start': {
      const puzzle: Puzzle = { rows: parseClues(game.rowsText), cols: parseClues(game.colsText) };
      const err = validatePuzzle(puzzle);
      if (err) return { ...state, message: { tone: 'error', text: err } };
      const res = solve(puzzle, 2);
      if (res.count === 0) return { ...state, message: { tone: 'error', text: '이 단서로는 그림을 만들 수 없어요. 단서를 다시 확인해 주세요.' } };
      const next: Game = {
        ...game,
        phase: 'solve',
        puzzle,
        grid: new Array<Cell>(puzzle.rows.length * puzzle.cols.length).fill(UNKNOWN),
        solution: res.count === 1 ? res.solution : null,
      };
      const s = { ...commit(state, next), cursor: 0 };
      if (res.count > 1) return { ...s, message: { tone: 'info', text: '답이 여러 개인 문제예요. 잘못 칠한 칸 알려주기와 정답 공개 힌트는 쓸 수 없어요.' } };
      return s;
    }
    case 'paint': {
      if (game.phase !== 'solve') return state;
      const grid = game.grid.slice();
      let changed = false;
      for (const c of action.cells) {
        if (grid[c] !== action.value) {
          grid[c] = action.value;
          changed = true;
        }
      }
      if (!changed) return state;
      if (action.first) return commit(state, { ...game, grid });
      return { ...state, game: { ...game, grid }, hint: null, hintLevel: 0 };
    }
    case 'cursor':
      return { ...state, cursor: action.cell };
    case 'move': {
      if (!w) return state;
      const cur = state.cursor ?? 0;
      const r = (Math.floor(cur / w) + action.dr + h) % h;
      const c = ((cur % w) + action.dc + w) % w;
      return { ...state, cursor: r * w + c };
    }
    case 'step': {
      if (!w) return state;
      const n = w * h;
      return { ...state, cursor: ((state.cursor ?? -action.delta) + action.delta + n) % n };
    }
    case 'mark': {
      if (game.phase !== 'solve' || state.cursor === null) return state;
      const grid = game.grid.slice();
      const cur = grid[state.cursor];
      grid[state.cursor] = action.value === UNKNOWN || cur === action.value ? UNKNOWN : action.value;
      if (grid[state.cursor] === cur) return state;
      return commit(state, { ...game, grid });
    }
    case 'tool':
      return { ...state, tool: action.tool };    case 'undo': {
      const prev = state.history[state.history.length - 1];
      if (!prev) return state;
      return { ...state, game: prev, history: state.history.slice(0, -1), hint: null, hintLevel: 0, message: null };
    }
    case 'clearGrid':
      return commit(state, { ...game, grid: game.grid.map(() => UNKNOWN) });
    case 'hint': {
      if (!game.puzzle) return state;
      if (state.hint) return { ...state, hintLevel: Math.min(3, state.hintLevel + 1) };
      const hint = findHint(game.puzzle, game.grid, game.solution);
      if (!hint) return { ...state, message: { tone: 'info', text: '더 드릴 힌트가 없어요. 다 풀었거나, 답이 하나로 정해지지 않는 문제예요.' } };
      return { ...state, hint, hintLevel: 1, message: null };
    }
    case 'hintApply': {
      if (!state.hint) return state;
      const grid = applyHint(state.hint, game.grid);
      return { ...commit(state, { ...game, grid }), cursor: state.hint.changes[0]?.cell ?? state.cursor };
    }
    case 'hintClose':
      return { ...state, hint: null, hintLevel: 0 };
    case 'edit':
      return commit(state, { ...game, phase: 'setup', puzzle: null, grid: [], solution: null });
    case 'new':
      return { ...commit(state, emptyGame()), cursor: null };
    case 'dismiss':
      return { ...state, message: null };
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const { game, hint, hintLevel, message, tool } = state;
  const puzzle = game.puzzle;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ game }));
    } catch {
      /* 저장할 수 없는 환경이면 그냥 넘어간다 */
    }
  }, [game]);

  const solved = useMemo(() => {
    if (!puzzle || game.phase !== 'solve') return false;
    const w = puzzle.cols.length;
    return (
      puzzle.rows.every((clue, r) => lineSatisfied(clue, game.grid.slice(r * w, r * w + w))) &&
      puzzle.cols.every((clue, c) => lineSatisfied(clue, puzzle.rows.map((_, r) => game.grid[r * w + c])))
    );
  }, [puzzle, game.grid, game.phase]);

  const preview = useMemo(() => {
    const rows = parseClues(game.rowsText);
    const cols = parseClues(game.colsText);
    return { rows: rows.length, cols: cols.length };
  }, [game.rowsText, game.colsText]);

  useEffect(() => {
    if (game.phase !== 'solve') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        dispatch({ type: 'undo' });
        e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (e.key in moves) {
        const [dr, dc] = moves[e.key];
        dispatch({ type: 'move', dr, dc });
      } else if (e.key === 'Tab') {
        dispatch({ type: 'step', delta: e.shiftKey ? -1 : 1 });
      } else if (e.code === 'Space' || e.code === 'KeyF' || e.key === 'Enter') {
        dispatch({ type: 'mark', value: FILLED });
      } else if (e.code === 'KeyX') {
        dispatch({ type: 'mark', value: EMPTY });
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        dispatch({ type: 'mark', value: UNKNOWN });
      } else if (e.code === 'KeyH') {
        dispatch({ type: 'hint' });
      } else if (e.code === 'KeyT') {
        dispatch({ type: 'tool', tool: state.tool === 'fill' ? 'cross' : 'fill' });
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game.phase, state.tool]);

  const isSetup = game.phase === 'setup';

  return (
    <div className="app">
      <AppNav current="nonogram" />
      <header className="app-header">
        <h1>노노그램 도우미</h1>
        <span className="phase-badge">{isSetup ? '문제 입력' : '푸는 중'}</span>
      </header>

      {message && (
        <div className={`message ${message.tone}`} role="status">
          <span>{message.text}</span>
          <button type="button" className="link" onClick={() => dispatch({ type: 'dismiss' })} aria-label="메시지 닫기">
            ✕
          </button>
        </div>
      )}

      {isSetup && (
        <>
          <p className="lead">
            단서를 한 줄에 하나씩 적으세요. 숫자는 띄어 쓰고, 칠할 칸이 없는 줄은 <strong>0</strong>으로 적어요. 줄 수가 판의 크기가 돼요.
          </p>
          <div className="clue-inputs">
            <label>
              <span>
                가로 단서 <small>(위에서 아래로, {preview.rows}행)</small>
              </span>
              <textarea
                value={game.rowsText}
                onChange={(e) => dispatch({ type: 'text', field: 'rowsText', value: e.target.value })}
                rows={12}
                spellCheck={false}
                placeholder={'2 2\n4 4\n10\n...'}
              />
            </label>
            <label>
              <span>
                세로 단서 <small>(왼쪽에서 오른쪽으로, {preview.cols}열)</small>
              </span>
              <textarea
                value={game.colsText}
                onChange={(e) => dispatch({ type: 'text', field: 'colsText', value: e.target.value })}
                rows={12}
                spellCheck={false}
                placeholder={'2\n4\n6\n...'}
              />
            </label>
          </div>
          <div className="toolbar">
            <button type="button" onClick={() => dispatch({ type: 'example' })}>
              예제 불러오기
            </button>
            <button type="button" onClick={() => dispatch({ type: 'new' })} disabled={!game.rowsText && !game.colsText}>
              모두 지우기
            </button>
            <button type="button" className="primary" onClick={() => dispatch({ type: 'start' })}>
              풀기 시작
            </button>
          </div>
        </>
      )}

      {!isSetup && puzzle && (
        <>
          {solved && <div className="message success">다 풀었어요! 모든 줄이 단서와 맞아요.</div>}
          <NonogramBoard
            puzzle={puzzle}
            grid={game.grid}
            cursor={state.cursor}
            tool={tool}
            hint={hint}
            hintLevel={hintLevel}
            onPaint={(cells, value, first) => dispatch({ type: 'paint', cells, value, first })}
            onCursor={(cell) => dispatch({ type: 'cursor', cell })}          />

          {hint && (
            <HintPanel
              hint={hint}
              level={hintLevel}
              onMore={() => dispatch({ type: 'hint' })}
              onApply={() => dispatch({ type: 'hintApply' })}
              onClose={() => dispatch({ type: 'hintClose' })}
            />
          )}

          <div className="mode-switch" role="radiogroup" aria-label="표시 도구">
            <button type="button" role="radio" aria-checked={tool === 'fill'} className={tool === 'fill' ? 'on' : ''} onClick={() => dispatch({ type: 'tool', tool: 'fill' })}>
              ■ 칠하기
            </button>
            <button type="button" role="radio" aria-checked={tool === 'cross'} className={tool === 'cross' ? 'on' : ''} onClick={() => dispatch({ type: 'tool', tool: 'cross' })}>
              ✕ X 표시
            </button>
            <span className="mode-key">T로 전환 · 마우스 오른쪽 버튼은 X</span>
          </div>

          <div className="toolbar">
            <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={!state.history.length}>
              되돌리기
            </button>
            <button type="button" onClick={() => dispatch({ type: 'clearGrid' })} disabled={!game.grid.some((v) => v !== UNKNOWN)}>
              판 비우기
            </button>
            <button type="button" className="primary" onClick={() => dispatch({ type: 'hint' })} disabled={solved}>
              {hint && hintLevel < 3 ? '다음 힌트' : '힌트'}
            </button>
          </div>

          <div className="footer-actions">
            <button type="button" className="link" onClick={() => dispatch({ type: 'edit' })}>
              단서 고치기
            </button>
            <button type="button" className="link" onClick={() => dispatch({ type: 'new' })}>
              새 문제
            </button>
          </div>

          <p className="keys">
            칸을 누르거나 끌어서 여러 칸을 한 번에 칠해요. Shift를 누른 채 끌면 가로나 세로 직선으로만 칠해요. 키보드: 방향키·Tab 이동 · Space/F 칠하기 · X 표시 · Backspace 지우기 · T 도구 전환 · H 힌트 · Ctrl+Z 되돌리기
          </p>
        </>
      )}
    </div>
  );
}
