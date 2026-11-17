/**
 * 数邻 —— 规则传播与校验
 *
 * 标准局部定式（都可单独证明，不需要试值）：
 * 1. 每格恰好被一条多米诺覆盖：已覆盖 → 其它相邻边全排除；只剩一条候选 → 强制配对。
 * 2. 每个数对恰好出现一次：已用过 → 其它同数对位置全排除；只剩一个位置 → 强制配对。
 * 3. 覆盖传播：某数对的全部候选位置都挨着同一格 → 这格必然被该数对覆盖，
 *    该格其它相邻边全部排除。
 * 4. 数对归属：某格剩下的候选边数对全都相同 → 该数对必然在这格用掉，
 *    别处同数对的候选位置全部排除。
 */

import { allPairs, incidentEdges, type DominoEdge } from './types.ts'

export type SetReason = 'cell' | 'pair' | 'pairOnly' | 'pairCover' | 'cellKey' | 'final'

/** 回放用的推理细节：说明这一步是哪个格子 / 哪个数对触发的 */
export interface SetDetail {
  cell?: number
  key?: string
  /** 触发推理时涉及的候选边（回放可用来高亮） */
  edges?: number[]
}

export type SetCallback = (
  edge: number,
  value: number,
  reason?: SetReason,
  detail?: SetDetail,
) => void

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
  const pairs = allPairs(maxDigit)
  let changed = true

  const set = (e: number, value: number, reason: SetReason, detail?: SetDetail): boolean => {
    if (values[e] === value) return true
    if (values[e] !== -1) return false
    // 先回调（让回放读到旧值），再写入
    onSet?.(e, value, reason, detail)
    values[e] = value
    changed = true
    return true
  }

  while (changed) {
    changed = false

    // 1) 每格恰好一条多米诺
    for (let i = 0; i < size; i++) {
      let selected = 0
      const unknown: number[] = []
      for (const e of incident[i]!) {
        if (values[e] === -1) unknown.push(e)
        else if (values[e] === 1) selected++
      }
      if (selected > 1) return false
      if (selected === 1) {
        for (const e of unknown) if (!set(e, 0, 'cell', { cell: i })) return false
      } else if (!unknown.length) {
        return false
      } else if (unknown.length === 1 && !set(unknown[0]!, 1, 'cell', { cell: i })) {
        return false
      }
    }

    // 2) 每个数对恰好一次；3) 数对只剩唯一候选位置 → 强制
    for (const [key, list] of byPair) {
      let selected = 0
      const unknown: number[] = []
      for (const e of list) {
        if (values[e] === 1) selected++
        else if (values[e] === -1) unknown.push(e)
      }
      if (selected > 1) return false
      if (selected === 1) {
        for (const e of unknown) if (!set(e, 0, 'pair', { key })) return false
      } else if (!unknown.length) {
        return false
      } else if (unknown.length === 1 && !set(unknown[0]!, 1, 'pairOnly', { key, edges: list })) {
        return false
      }
    }

    // 4) 覆盖传播：某数对的全部候选位置都挨着同一格 → 这格必被该数对覆盖
    for (const [key, list] of byPair) {
      if (list.some((e) => values[e] === 1)) continue
      const cand: number[] = []
      for (const e of list) if (values[e] === -1) cand.push(e)
      if (cand.length < 2) continue
      let common = new Set<number>([edges[cand[0]!]!.a, edges[cand[0]!]!.b])
      for (let k = 1; k < cand.length && common.size; k++) {
        const edge = edges[cand[k]!]!
        const next = new Set<number>()
        for (const c of common) if (c === edge.a || c === edge.b) next.add(c)
        common = next
      }
      if (common.size !== 1) continue
      const cell = common.values().next().value as number
      for (const e of incident[cell]!) {
        if (values[e] === -1 && !cand.includes(e) && !set(e, 0, 'pairCover', { key, cell })) {
          return false
        }
      }
    }

    // 5) 数对归属：某格剩下的候选边数对全都相同 → 该数对必在这格用掉
    for (let i = 0; i < size; i++) {
      let selected = 0
      const cand: number[] = []
      for (const e of incident[i]!) {
        if (values[e] === 1) selected++
        else if (values[e] === -1) cand.push(e)
      }
      if (selected > 0 || cand.length < 2) continue
      const key = edges[cand[0]!]!.key
      let sameKey = true
      for (const e of cand) {
        if (edges[e]!.key !== key) {
          sameKey = false
          break
        }
      }
      if (!sameKey) continue
      for (const e of byPair.get(key) ?? []) {
        if (values[e] === -1 && !cand.includes(e) && !set(e, 0, 'cellKey', { key, cell: i })) {
          return false
        }
      }
    }

    // 6) 每个数对都还留着候选位置
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
