/**
 * 数邻 —— 逻辑解题回放
 */

import type { GameState, LogicPlan, Move, PlaybackFrame, Puzzle } from '../core/types'
import { checkSolution, propagate, type SetDetail, type SetReason } from './rules'
import { findSolution } from './solver'
import {
  asDominosaPuzzle,
  asDominosaState,
  buildEdges,
  type DominosaState,
} from './types'

type LogicReason = SetReason | 'search' | 'complete'

function ruleFor(value: number, reason: LogicReason): number {
  if (reason === 'pairOnly') return 3
  if (reason === 'pairCover' || reason === 'cellKey') return 4
  if (reason === 'complete') return 5
  if (reason === 'search') return 6
  return value === 1 ? 1 : 2
}

function labelFor(value: number, reason: LogicReason, detail?: SetDetail): string {
  const key = detail?.key ?? ''
  if (reason === 'pairOnly') return `数对唯一位置：数对 ${key} 在盘面上只剩这一个相邻位置，必须配在这里`
  if (reason === 'pairCover') {
    return `覆盖传播：数对 ${key} 的所有候选位置都挨着这一格，这格必被它占用 → 其它方向不能配`
  }
  if (reason === 'cellKey') {
    return `数对归属：这一格能配的数对只剩 ${key}，该数对必在这里用掉 → 别处不能再配`
  }
  if (reason === 'pair') return `数对唯一：数对 ${key} 已经用过，这里不能再配`
  if (reason === 'search') return '回溯试探：该边是否配对'
  if (reason === 'complete') return '补全：该边最终状态'
  if (value === 1) return '唯一方向：这一格只剩一个可配对方向，必须配成多米诺'
  return '覆盖排除：这一格已经配好多米诺，其它方向不能再用'
}

export function planLogicSolve(puzzle: Puzzle, initialState: GameState): LogicPlan {
  const p = asDominosaPuzzle(puzzle)
  const s = asDominosaState(initialState)
  const digits = p.digits ?? []
  const edges = buildEdges(digits, p.width, p.height)
  const size = p.width * p.height
  const maxDigit = digits.reduce((a, b) => Math.max(a, b), 0)
  const total = edges.length
  const frames: PlaybackFrame[] = []
  const grid = new Array<number>(total).fill(-1)
  let streak = 0

  const onSet = (index: number, value: number, reason: LogicReason, detail?: SetDetail): void => {
    if (grid[index] === value) return
    const from = grid[index] === 1 ? 1 : 0
    grid[index] = value
    streak++
    const move: Move = { index, from, to: value }
    frames.push({
      rule: ruleFor(value, reason),
      label: labelFor(value, reason, detail),
      move,
      streak,
    })
  }

  if (
    !propagate(
      grid,
      edges,
      size,
      maxDigit,
      (e, v, reason, detail) => onSet(e, v, reason ?? 'cell', detail),
    )
  ) {
    return { puzzleId: p.id, frames: [], finalState: null, ruleSteps: 0, saturated: false }
  }

  let saturated = true
  if (grid.some((v) => v === -1)) {
    saturated = false
    const solution = findSolution(digits, p.width, p.height, 2_000_000)
    if (!solution) {
      return { puzzleId: p.id, frames: [], finalState: null, ruleSteps: 0, saturated: false }
    }
    for (let e = 0; e < total; e++) {
      if (grid[e] !== -1) continue
      onSet(e, solution[e]!, 'search')
    }
  }

  const values = grid.map((v) => (v === 1 ? 1 : 0))
  if (!checkSolution(values, edges, size, maxDigit).ok) {
    return { puzzleId: p.id, frames: [], finalState: null, ruleSteps: 0, saturated: false }
  }
  for (let e = 0; e < total; e++) {
    const from = s.edges[e] ?? 0
    if (values[e] === from) continue
    streak++
    frames.push({
      rule: 5,
      label: '补全：该边最终状态',
      move: { index: e, from, to: values[e]! },
      streak,
    })
  }

  const finalState: DominosaState = {
    puzzleId: s.puzzleId,
    width: p.width,
    height: p.height,
    edges: values,
  }
  return { puzzleId: p.id, frames, finalState, ruleSteps: frames.length, saturated }
}
