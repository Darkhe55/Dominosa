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
import { solvePuzzle } from './solver'
import {
  applyMove,
  cloneState,
  createEmptyState,
  cycleValue,
  deserializeState,
  firstHintMove,
  invertMove,
  rightClickValue,
  serializeState,
  valueAt,
} from './state'
import { statusBits, validate } from './validate'
import { encodeDigits, type DominosaPuzzle } from './types'

const meta = {
  title: '数邻',
  tagline: '把棋盘分成多米诺，每个数字对恰好出现一次',
  footerNote:
    '规则：用多米诺（相邻两格）铺满棋盘；每一对数字（包含相同数字对）在整盘恰好出现一次。点击相邻格之间的边切换是否连成多米诺。',
  storageKeyPrefix: 'dominosa',
  customIdPrefix: 'dominosa-custom-',
  customMinW: 4,
  customMinH: 4,
  customMaxW: 10,
  customMaxH: 10,
  targetKind: 'edge' as const,
  interactionHint: '点击相邻两格之间的边切换多米诺；右键取消。',
}

const custom: CustomSupport = {
  mode: 'none',
  valueCycle: [null, 1],
  keyForDigit: () => undefined,
  cellLabel: (v) => (v == null ? '' : String(v)),
  hint: '数邻暂不支持自定义题板。',
  makePuzzle: (w, h, _grid, existingId) => ({
    id: existingId ?? `${meta.customIdPrefix}${w}x${h}-${Date.now()}`,
    name: `自定义 · ${w}×${h}`,
    width: w,
    height: h,
    difficulty: 'custom',
    digits: new Array<number>(w * h).fill(0),
  } satisfies DominosaPuzzle),
  encodePuzzle: (p) => {
    const dp = p as DominosaPuzzle
    return { board: encodeDigits(dp.digits ?? []) }
  },
  decodePuzzle: () => null,
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
}
