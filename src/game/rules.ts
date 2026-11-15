/**
 * 数邻 —— 规则传播与校验
 */

import { allPairs, incidentEdges, type DominoEdge } from './types.ts'

export type SetCallback = (edge: number, value: number) => void

/** edges 就地修改：-1 未知 / 0 不连 / 1 连成多米诺 */
export function propagate(
  values: number[],
  edges: DominoEdge[],
  size: number,
  maxDigit: number,
  onSet?: SetCallback,
): boolean {
  const incident = incidentEdges(edges, size)
  const byPair = new Map<string, number[]>()
  for (let e = 0; e < edges.length; e++) {
    const key = edges[e]!.key
    const list = byPair.get(key) ?? []
    list.push(e)
    byPair.set(key, list)
  }
  let changed = true

  const set = (e: number, value: number): boolean => {
    if (values[e] === value) return true
    if (values[e] !== -1) return false
    values[e] = value
    onSet?.(e, value)
    changed = true
    return true
  }

  while (changed) {
    changed = false

    for (let i = 0; i < size; i++) {
      let selected = 0
      const unknown: number[] = []
      for (const e of incident[i]!) {
        if (values[e] === -1) unknown.push(e)
        else if (values[e] === 1) selected++
      }
      if (selected > 1) return false
      if (selected === 1) {
        for (const e of unknown) if (!set(e, 0)) return false
      } else if (!unknown.length) {
        return false
      } else if (unknown.length === 1 && !set(unknown[0]!, 1)) {
        return false
      }
    }

    for (const [key, list] of byPair) {
      let selected = 0
      let unknown = 0
      for (const e of list) {
        if (values[e] === 1) selected++
        else if (values[e] === -1) unknown++
      }
      if (selected > 1) return false
      if (selected === 1) {
        for (const e of list) if (values[e] === -1 && !set(e, 0)) return false
      } else if (!unknown) {
        return false
      }
      void key
    }

    const pairs = allPairs(maxDigit)
    for (const key of pairs) {
      const list = byPair.get(key) ?? []
      if (!list.length) continue
      if (list.every((e) => values[e] === 0)) return false
    }
  }
  return true
}

export interface DominosaCheck {
  ok: boolean
  badCells: number[]
  duplicatePairs: string[]
  missingPairs: string[]
  uncovered: number[]
}

export function checkSolution(
  values: ArrayLike<number>,
  edges: DominoEdge[],
  size: number,
  maxDigit: number,
): DominosaCheck {
  const bad = new Set<number>()
  const counts = new Map<string, number>()
  const covered = new Map<number, number>()
  for (let e = 0; e < edges.length; e++) {
    if ((values[e] ?? 0) !== 1) continue
    const edge = edges[e]!
    counts.set(edge.key, (counts.get(edge.key) ?? 0) + 1)
    covered.set(edge.a, (covered.get(edge.a) ?? 0) + 1)
    covered.set(edge.b, (covered.get(edge.b) ?? 0) + 1)
  }
  const uncovered: number[] = []
  for (let i = 0; i < size; i++) {
    const c = covered.get(i) ?? 0
    if (c !== 1) {
      uncovered.push(i)
      bad.add(i)
    }
  }
  const duplicatePairs: string[] = []
  for (const [key, c] of counts) if (c > 1) duplicatePairs.push(key)
  const missingPairs = allPairs(maxDigit).filter((key) => !counts.has(key))
  for (const key of duplicatePairs) {
    for (let e = 0; e < edges.length; e++) {
      if ((values[e] ?? 0) === 1 && edges[e]!.key === key) {
        bad.add(edges[e]!.a)
        bad.add(edges[e]!.b)
      }
    }
  }
  return {
    badCells: Array.from(bad),
    duplicatePairs,
    missingPairs,
    uncovered,
    ok: uncovered.length === 0 && duplicatePairs.length === 0 && missingPairs.length === 0,
  }
}
