/**
 * 数邻 —— 状态
 */

import type { GameState, HitTarget, Move, Puzzle } from '../core/types'
import {
  asDominosaPuzzle,
  asDominosaState,
  buildEdges,
  decodeEdges,
  edgeCount,
  EDGE_SEPARATOR,
  encodeEdges,
  incidentEdges,
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
  const v = asDominosaState(state).edges[target.index] ?? 0
  // 左键：空 → 数对；数对 → 空；隔板 → 空
  return v === 0 ? 1 : 0
}

export function rightClickValue(state: GameState, target: HitTarget): number {
  const v = asDominosaState(state).edges[target.index] ?? 0
  // 右键：空 → 隔板；数对/隔板 → 空
  return v === 0 ? EDGE_SEPARATOR : 0
}

/** 放置数对前清除与它共用格子的旧数对，保证一个格子只属于一个多米诺。 */
export function prepareMove(state: GameState, move: Move): Move {
  if (move.to !== 1) return move
  const s = asDominosaState(state)
  const w = s.width
  const h = s.height
  const edges = buildEdges(new Array<number>(w * h).fill(0), w, h)
  if (move.index < 0 || move.index >= edges.length) return move
  const incident = incidentEdges(edges, w * h)
  const target = edges[move.index]!
  const conflicts = new Set<number>()
  for (const cell of [target.a, target.b]) {
    for (const e of incident[cell] ?? []) {
      if (e !== move.index && s.edges[e] === 1) conflicts.add(e)
    }
  }
  if (!conflicts.size) return move
  return {
    ...move,
    extra: Array.from(conflicts, (index) => ({ index, from: 1, to: 0 })),
  }
}

function edgeValue(v: number): number {
  return v === 1 ? 1 : v === EDGE_SEPARATOR ? EDGE_SEPARATOR : 0
}

export function applyMove(state: GameState, move: Move): void {
  const s = asDominosaState(state)
  if (move.index >= 0 && move.index < s.edges.length) s.edges[move.index] = edgeValue(move.to)
  for (const change of move.extra ?? []) {
    if (change.index >= 0 && change.index < s.edges.length) s.edges[change.index] = edgeValue(change.to)
  }
}

export function invertMove(move: Move): Move {
  return {
    index: move.index,
    from: move.to,
    to: move.from,
    extra: move.extra?.map((change) => ({ index: change.index, from: change.to, to: change.from })),
  }
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
