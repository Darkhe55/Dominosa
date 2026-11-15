/**
 * 数邻 —— 回溯求解器
 */

import type { Puzzle, SolveResult } from '../core/types'
import { checkSolution, propagate } from './rules.ts'
import {
  buildEdges,
  incidentEdges,
  type DominoEdge,
  type DominosaPuzzle,
  type DominosaState,
} from './types.ts'

export interface CountOutcome {
  count: number
  nodes: number
  timedOut: boolean
}

function search(
  edges: DominoEdge[],
  size: number,
  maxDigit: number,
  limit: number,
  maxNodes: number,
): { solutions: number[][]; nodes: number; timedOut: boolean } {
  const vals = new Array<number>(edges.length).fill(-1)
  const incident = incidentEdges(edges, size)
  const solutions: number[][] = []
  let nodes = 0
  let timedOut = false

  const dfs = (): void => {
    if (solutions.length >= limit || timedOut) return
    nodes++
    if (nodes > maxNodes) {
      timedOut = true
      return
    }
    if (!propagate(vals, edges, size, maxDigit)) return

    let target = -1
    let best = Infinity
    for (let i = 0; i < size; i++) {
      const selected = incident[i]!.filter((e) => vals[e] === 1).length
      if (selected > 0) continue
      const unknown = incident[i]!.filter((e) => vals[e] === -1)
      if (!unknown.length) continue
      if (unknown.length < best) {
        best = unknown.length
        target = unknown[0]!
      }
    }
    if (target < 0) {
      for (let e = 0; e < edges.length; e++) {
        if (vals[e] === -1) {
          target = e
          break
        }
      }
    }
    if (target < 0) {
      const out = vals.map((v) => (v === 1 ? 1 : 0))
      if (checkSolution(out, edges, size, maxDigit).ok) solutions.push(out)
      return
    }

    for (const value of [1, 0]) {
      const backup = vals.slice()
      vals[target] = value
      dfs()
      for (let e = 0; e < edges.length; e++) vals[e] = backup[e]!
      if (solutions.length >= limit || timedOut) break
    }
  }

  dfs()
  return { solutions, nodes, timedOut }
}

export function countSolutions(
  digits: number[],
  w: number,
  h: number,
  limit = 2,
  maxNodes = 500_000,
): CountOutcome {
  const edges = buildEdges(digits, w, h)
  const maxDigit = digits.reduce((a, b) => Math.max(a, b), 0)
  const out = search(edges, w * h, maxDigit, limit, maxNodes)
  return { count: out.solutions.length, nodes: out.nodes, timedOut: out.timedOut }
}

export function findSolution(
  digits: number[],
  w: number,
  h: number,
  maxNodes = 2_000_000,
): number[] | null {
  const edges = buildEdges(digits, w, h)
  const maxDigit = digits.reduce((a, b) => Math.max(a, b), 0)
  const out = search(edges, w * h, maxDigit, 1, maxNodes)
  return out.solutions[0] ?? null
}

export function solvePuzzle(puzzle: Puzzle, maxNodes = 1_500_000): SolveResult {
  const p = puzzle as DominosaPuzzle
  if (!p.digits || p.digits.length !== p.width * p.height) {
    return { solved: false, solution: null, nodes: 0, timedOut: false }
  }
  const edges = buildEdges(p.digits, p.width, p.height)
  const maxDigit = p.digits.reduce((a, b) => Math.max(a, b), 0)
  const out = search(edges, p.width * p.height, maxDigit, 1, maxNodes)
  const values = out.solutions[0]
  if (!values) return { solved: false, solution: null, nodes: out.nodes, timedOut: out.timedOut }
  return { solved: true, solution: makeState(p, values), nodes: out.nodes, timedOut: out.timedOut }
}

export function makeState(puzzle: DominosaPuzzle, values: number[]): DominosaState {
  return {
    puzzleId: puzzle.id,
    width: puzzle.width,
    height: puzzle.height,
    edges: values.map((v) => (v === 1 ? 1 : 0)),
  }
}
