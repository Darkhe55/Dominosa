/**
 * ════════════════════════════════════════════════════════════════════
 *  数邻（Dominosa）—— 游戏适配器
 * ════════════════════════════════════════════════════════════════════
 *
 * 状态：相邻格之间的边，1 = 连成多米诺。
 */

import { playDrop, playPluck } from '../core/audio'
import type { CustomSupport, GameAdapter, Move, Puzzle, SolveResult } from '../core/types'
import { planLogicSolve } from './logic'
import { builtinPuzzles, getReferenceSolution } from './puzzles'
import { hitTest, metricsFor, renderBoard } from './render'
import { countSolutions, solvePuzzle } from './solver'
import {
  applyMove,
  cloneState,
  createEmptyState,
  cycleValue,
  deserializeState,
  firstHintMove,
  invertMove,
  prepareMove,
  rightClickValue,
  serializeState,
  valueAt,
} from './state'
import { statusBits, validate } from './validate'
import {
  allPairs,
  buildEdges,
  decodeDigits,
  encodeDigits,
  type DominosaPuzzle,
} from './types'

const meta = {
  title: '数邻',
  tagline: '把棋盘分成多米诺，每个数字对恰好出现一次',
  footerNote:
    '规则：用多米诺（相邻两格）铺满棋盘；每一对数字（包含相同数字对）在整盘恰好出现一次。点击相邻格之间的边切换是否连成多米诺。',
  storageKeyPrefix: 'dominosa',
  customIdPrefix: 'dominosa-custom-',
  customMinW: 2,
  customMinH: 2,
  customMaxW: 22,
  customMaxH: 22,
  targetKind: 'edge' as const,
  interactionHint:
    '左键点击/拖动选数对或移除隔板；右键点击/拖动加隔板或移除数对；中键拖动平移；滚轮缩放。',
}

/* ────────────────────────── 自定义题板 ────────────────────────── */

/** 自定义题板能表示的最大数字（0–n） */
const CUSTOM_MAX_DIGIT = 9

/** 数邻棋盘格数必须是 (n+1)(n+2)：2、6、12、20、30、42、56、72、90、110 */
function maxDigitForCells(cells: number): number {
  for (let n = 0; n <= CUSTOM_MAX_DIGIT; n++) {
    if ((n + 1) * (n + 2) === cells) return n
  }
  return -1
}

/** 检查一份数字表的结构合法性（题面结构 + 求解器结果） */
function checkDigits(
  digits: ArrayLike<number>,
  width: number,
  height: number,
  withSolver: boolean,
): { ok: boolean; message: string } {  const cells = width * height
  const n = maxDigitForCells(cells)
  if (n < 0) {
    return {
      ok: false,
      message: `数邻棋盘格数必须是 (n+1)(n+2)（2/6/12/20/30/42/56/72/90/110 格），当前 ${width}×${height}=${cells} 格。`,
    }
  }
  const size = digits.length
  if (size !== cells) return { ok: false, message: '题面数字个数与宽高不符。' }
  const counts = new Array<number>(n + 1).fill(0)
  const flat = new Array<number>(cells)
  for (let i = 0; i < cells; i++) {
    const v = Math.floor(digits[i] ?? 0)
    if (!Number.isInteger(v) || v < 0 || v > n) {
      return { ok: false, message: `数字 ${digits[i]} 超出范围 0–${n}。` }
    }
    counts[v]!++
    flat[i] = v
  }
  for (let d = 0; d <= n; d++) {
    if (counts[d] !== n + 2) {
      return {
        ok: false,
        message: `数字 ${d} 出现 ${counts[d]} 次，应为 ${n + 2} 次（0–${n} 的全数对多米诺）。`,
      }
    }
  }
  const edges = buildEdges(flat, width, height)
  const have = new Set(edges.map((e) => e.key))
  const missing = allPairs(n).filter((key) => !have.has(key))
  if (missing.length > 0) {
    return {
      ok: false,
      message: `有 ${missing.length} 个数对没有出现在相邻格里（如 ${missing[0]}），一定无解。`,
    }
  }
  if (!withSolver) return { ok: true, message: '' }
  const counted = countSolutions(flat, width, height, 2, 150_000)
  if (counted.timedOut) return { ok: true, message: '结构合法；唯一解校验超时，仍可保存。' }
  if (counted.count === 0) return { ok: false, message: '题面无解：无法把全部数对铺成多米诺。' }
  if (counted.count > 1) return { ok: true, message: '结构合法，但存在多个解。' }
  return { ok: true, message: '唯一解 ✓' }
}

const custom: CustomSupport = {
  mode: 'cell',
  valueCycle: [null, ...Array.from({ length: CUSTOM_MAX_DIGIT + 1 }, (_, i) => i)],
  keyForDigit: (digit) => (digit >= 0 && digit <= 9 ? digit : undefined),
  cellLabel: (v) => (v == null ? '' : String(v)),
  cellClass: (v) => (v == null ? '' : 'dm-ed-num'),
  hint:
    '在网格里填数字表：点击循环 空 → 0 → 1 … → 9，键盘直接按 0–9。棋盘格数必须是 (n+1)(n+2)（如 5×6=30 → 数字 0–4；10×11=110 → 0–9），且每个数字恰好出现 n+2 次、所有数对都要相邻出现。载入/保存时会自动校验。',
  toGrid: (p) => {
    const dp = p as DominosaPuzzle
    if (!Array.isArray(dp.digits) || dp.digits.length !== p.width * p.height) return null
    return {
      width: p.width,
      height: p.height,
      grid: dp.digits.map((v) => (Number.isInteger(v) && v >= 0 ? v : null)),
    }
  },
  makePuzzle: (w, h, grid, existingId) => ({
    id: existingId ?? `${meta.customIdPrefix}${w}x${h}-${Date.now()}`,
    name: `自定义 · ${w}×${h}`,
    width: w,
    height: h,
    difficulty: 'custom',
    digits: grid.map((v) => (Number.isInteger(v as number) && (v as number) >= 0 ? (v as number) : 0)),
  } satisfies DominosaPuzzle),
  encodePuzzle: (p) => ({ board: encodeDigits((p as DominosaPuzzle).digits ?? []) }),
  decodePuzzle: (record) => {
    if (typeof record.id !== 'string') return null
    if (typeof record.width !== 'number' || typeof record.height !== 'number') return null
    const w = record.width
    const h = record.height
    if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null
    if (maxDigitForCells(w * h) < 0) return null
    if (typeof record.board !== 'string') return null
    const digits = decodeDigits(record.board, w * h, CUSTOM_MAX_DIGIT)
    if (!digits) return null
    return {
      id: record.id,
      name: typeof record.name === 'string' ? record.name : `自定义 · ${w}×${h}`,
      width: w,
      height: h,
      difficulty: 'custom',
      digits,
    } satisfies DominosaPuzzle
  },
  validatePuzzle: (p) => {
    const dp = p as DominosaPuzzle
    const result = checkDigits(dp.digits ?? [], dp.width, dp.height, true)
    return { ok: result.ok, message: result.message, tone: result.ok ? 'ok' : 'bad' }
  },
}

function playForMove(move: Move, streak: number): void {
  if (move.to === 1) playPluck(streak, 0.9)
  else playDrop(streak)
}

export const adapter: GameAdapter = {
  meta,
  builtinPuzzles,
  getReferenceSolution,
  createEmptyState,
  cloneState,
  cycleValue,
  rightClickValue,
  applyMove,
  invertMove,
  prepareMove,
  valueAt,
  serializeState,
  deserializeState,
  validate,
  statusBits,
  metricsFor,
  renderBoard,
  hitTest,
  planLogicSolve,
  solvePuzzle: (puzzle: Puzzle, maxNodes?: number): SolveResult => solvePuzzle(puzzle, maxNodes),
  firstHintMove,
  custom,
  playForMove,
  strokeMode: 'transition',
  rightStroke: true,
}
