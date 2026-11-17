/**
 * 数邻（Dominosa）—— 类型
 *
 * digits[i]：0..4 的数字。
 * edges[e]：相邻格之间的边，0 = 未标记，1 = 连成多米诺，2 = 隔板。
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'

export interface DominosaPuzzle extends Puzzle {
  digits: number[]
  solutionEdges?: string
}

export interface DominosaState extends GameState {
  edges: number[]
}

export interface DominoEdge {
  a: number
  b: number
  key: string
}

export interface DominosaResult extends ValidationResult {
  badCells: number[]
  duplicatePairs: string[]
  missingPairs: string[]
  uncovered: number[]
}

export function asDominosaPuzzle(p: Puzzle): DominosaPuzzle {
  return p as DominosaPuzzle
}

export function asDominosaState(s: GameState): DominosaState {
  return s as DominosaState
}

export function pairKey(a: number, b: number): string {
  return a <= b ? `${a}-${b}` : `${b}-${a}`
}

/** 所有 0..n 的数对 */
export function allPairs(n: number): string[] {
  const out: string[] = []
  for (let a = 0; a <= n; a++) for (let b = a; b <= n; b++) out.push(`${a}-${b}`)
  return out
}

export function buildEdges(digits: ArrayLike<number>, w: number, h: number): DominoEdge[] {
  const edges: DominoEdge[] = []
  // 先所有水平边（逐行），与 core/board 的边索引一致
  for (let y = 0; y < h; y++) {
    for (let x = 0; x + 1 < w; x++) {
      const i = y * w + x
      const j = i + 1
      edges.push({ a: i, b: j, key: pairKey(digits[i]!, digits[j]!) })
    }
  }
  for (let y = 0; y + 1 < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const j = i + w
      edges.push({ a: i, b: j, key: pairKey(digits[i]!, digits[j]!) })
    }
  }
  return edges
}

export function edgeCount(w: number, h: number): number {
  return h * (w - 1) + w * (h - 1)
}

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz'

/**
 * 编码数字串：默认每格 1 个十进制字符（0–9，现有题库都是这种）。
 * 当出现 >9 的数字（数邻的通用棋盘，如 0–40 的 42×41 大棋）时，
 * 自动改成每格 2 个 base36 字符（支持到 1295），解码时按长度区分。
 */
export function encodeDigits(digits: ArrayLike<number>): string {
  let max = 0
  for (let i = 0; i < digits.length; i++) {
    const v = digits[i]! | 0
    if (v > max) max = v
  }
  if (max <= 9) {
    let out = ''
    for (let i = 0; i < digits.length; i++) out += String(digits[i]! | 0)
    return out
  }
  let out = ''
  for (let i = 0; i < digits.length; i++) {
    const v = Math.max(0, digits[i]! | 0)
    out += BASE36[Math.floor(v / BASE36.length)]! + BASE36[v % BASE36.length]!
  }
  return out
}

export function decodeDigits(text: string, expected: number, maxDigit = 4): number[] | null {
  if (typeof text !== 'string') return null
  // 2 字符/格：数字可超过 9（不再受 maxDigit 限制）
  if (expected > 0 && text.length === expected * 2) {
    const out = new Array<number>(expected).fill(0)
    for (let i = 0; i < expected; i++) {
      const hi = BASE36.indexOf(text[i * 2]!.toLowerCase())
      const lo = BASE36.indexOf(text[i * 2 + 1]!.toLowerCase())
      if (hi < 0 || lo < 0) return null
      out[i] = hi * BASE36.length + lo
    }
    return out
  }
  if (text.length !== expected) return null
  const out = new Array<number>(expected).fill(0)
  for (let i = 0; i < expected; i++) {
    const v = text.charCodeAt(i) - 48
    if (v < 0 || v > maxDigit) return null
    out[i] = v
  }
  return out
}

export const EDGE_SEPARATOR = 2

export function encodeEdges(edges: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < edges.length; i++) {
    const v = edges[i]! | 0
    out += v === 1 ? '1' : v === EDGE_SEPARATOR ? '2' : '0'
  }
  return out
}

export function decodeEdges(text: string, expected: number): number[] | null {
  if (typeof text !== 'string' || text.length !== expected) return null
  const out = new Array<number>(expected).fill(0)
  for (let i = 0; i < expected; i++) {
    if (text[i] === '1') out[i] = 1
    else if (text[i] === '2') out[i] = EDGE_SEPARATOR
    else if (text[i] === '0') out[i] = 0
    else return null
  }
  return out
}

export function incidentEdges(edges: DominoEdge[], size: number): number[][] {
  const out: number[][] = Array.from({ length: size }, () => [])
  for (let e = 0; e < edges.length; e++) {
    out[edges[e]!.a]!.push(e)
    out[edges[e]!.b]!.push(e)
  }
  return out
}
