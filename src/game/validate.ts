/**
 * 数邻 —— 实时校验
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'
import { checkSolution } from './rules'
import {
  asDominosaPuzzle,
  asDominosaState,
  buildEdges,
  type DominosaResult,
} from './types'

export function validate(state: GameState, puzzle: Puzzle): DominosaResult {
  const s = asDominosaState(state)
  const p = asDominosaPuzzle(puzzle)
  const digits = p.digits ?? []
  const edges = buildEdges(digits, p.width, p.height)
  const maxDigit = digits.reduce((a, b) => Math.max(a, b), 0)
  const out = checkSolution(s.edges, edges, p.width * p.height, maxDigit)
  return {
    solved: out.ok,
    badCells: out.badCells,
    duplicatePairs: out.duplicatePairs,
    missingPairs: out.missingPairs,
    uncovered: out.uncovered,
  }
}

export function statusBits(result: ValidationResult): string[] {
  const r = result as DominosaResult
  if (r.solved) return ['完成']
  const bits: string[] = []
  if (r.uncovered.length > 0) bits.push(`${r.uncovered.length} 格尚未配对`)
  if (r.duplicatePairs.length > 0) bits.push(`${r.duplicatePairs.length} 个数对重复`)
  if (r.missingPairs.length > 0) bits.push(`还差 ${r.missingPairs.length} 个数对`)
  if (bits.length === 0) bits.push('继续配对')
  return bits
}
