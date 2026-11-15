/**
 * 数邻 —— 状态
 */

import type { GameState, HitTarget, Move, Puzzle } from '../core/types'
import {
  asDominosaPuzzle,
  asDominosaState,
  decodeEdges,
  edgeCount,
  encodeEdges,
  type DominosaState,
} from './types'

export function createEmptyState(puzzle: Puzzle): DominosaState {
  const p = asDominosaPuzzle(puzzle)
  return {
    puzzleId: p.id,
    width: p.width,
    height: p.height,
    edges: new Array<number>(edgeCount(p.width, p.height)).fill(0),
  }
}

export function cloneState(state: GameState): DominosaState {
  const s = asDominosaState(state)
  return {
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    edges: s.edges.slice(),
  }
}

export function cycleValue(state: GameState, target: HitTarget): number {
  const s = asDominosaState(state)
  return (s.edges[target.index] ?? 0) ? 0 : 1
}

export function rightClickValue(): number {
  return 0
}

export function applyMove(state: GameState, move: Move): void {
  const s = asDominosaState(state)
  if (move.index < 0 || move.index >= s.edges.length) return
  s.edges[move.index] = move.to ? 1 : 0
}

export function invertMove(move: Move): Move {
  return { index: move.index, from: move.to, to: move.from }
}

export function valueAt(state: GameState, index: number): number {
  return asDominosaState(state).edges[index] ?? 0
}

export function serializeState(state: GameState): Record<string, unknown> {
  const s = asDominosaState(state)
  return {
    version: 1,
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    edgeCount: s.edges.length,
    edges: encodeEdges(s.edges),
  }
}

export function deserializeState(data: Record<string, unknown>): DominosaState | null {
  if (typeof data.puzzleId !== 'string') return null
  if (typeof data.width !== 'number' || typeof data.height !== 'number') return null
  if (data.width < 2 || data.height < 2) return null
  const expected = typeof data.edgeCount === 'number' ? data.edgeCount : 0
  if (expected <= 0) return null
  const edges = typeof data.edges === 'string' ? decodeEdges(data.edges, expected) : null
  if (!edges) return null
  return { puzzleId: data.puzzleId, width: data.width, height: data.height, edges }
}

export function firstHintMove(state: GameState, solution: GameState): Move | null {
  const s = asDominosaState(state)
  const sol = asDominosaState(solution)
  for (let i = 0; i < s.edges.length; i++) {
    if ((s.edges[i] ?? 0) !== (sol.edges[i] ?? 0)) {
      return { index: i, from: s.edges[i] ?? 0, to: sol.edges[i] ?? 0 }
    }
  }
  return null
}
