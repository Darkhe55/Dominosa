/**
 * 数邻 —— 逻辑解题回放
 */

import type { GameState, LogicPlan, Move, PlaybackFrame, Puzzle } from '../core/types'
import { checkSolution, propagate } from './rules'
import { findSolution } from './solver'
import {
  asDominosaPuzzle,
  asDominosaState,
  buildEdges,
  type DominosaState,
} from './types'

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

  const onSet = (index: number, value: number, label: string): void => {
    if (grid[index] === value) return
    const from = grid[index] === 1 ? 1 : 0
    grid[index] = value
    streak++
    const move: Move = { index, from, to: value }
    frames.push({ rule: value === 1 ? 1 : 2, label, move, streak })
  }

  if (
    !propagate(
      grid,
      edges,
      size,
      maxDigit,
      (e, v) => onSet(e, v, v === 1 ? '这格只能与相邻格配对' : '这条边不能配对'),
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
      onSet(e, solution[e]!, '回溯试探：该边是否配对')
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
      rule: 4,
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
