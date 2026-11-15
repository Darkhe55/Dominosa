/**
 * 数邻题库生成器
 *
 * 5×6 棋盘（数字 0..4）。先随机生成多米诺完美匹配，
 * 再把 15 个数对随机分配给这些多米诺，最后检查盘面是否唯一。
 */

import type { Difficulty } from '../core/types'
import { countSolutions } from './solver.ts'
import { allPairs, encodeDigits, encodeEdges, buildEdges } from './types.ts'

interface GenSpec {
  seed: number
  difficulty: Difficulty
  name: string
  series: string
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

const SPECS: GenSpec[] = [
  { seed: 0x4d534901, difficulty: 'easy', name: '初识数邻', series: '入门' },
  { seed: 0x4d534902, difficulty: 'easy', name: '相邻数对', series: '入门' },
  { seed: 0x4d534903, difficulty: 'medium', name: '数对迷宫', series: '进阶' },
  { seed: 0x4d534904, difficulty: 'medium', name: '多米诺拼图', series: '进阶' },
  { seed: 0x4d534905, difficulty: 'hard', name: '数邻之壁', series: '挑战' },
  { seed: 0x4d534906, difficulty: 'hard', name: '终局数邻', series: '挑战' },
]

export interface GeneratedPuzzle {
  id: string
  name: string
  width: number
  height: number
  difficulty: Difficulty
  series: string
  board: string
  solution: string
}

function makeMatching(
  w: number,
  h: number,
  rng: () => number,
): Array<[number, number]> | null {
  const total = w * h
  const covered = new Uint8Array(total)
  const dominoes: Array<[number, number]> = []

  const dfs = (): boolean => {
    let first = -1
    for (let i = 0; i < total; i++) {
      if (!covered[i]) {
        first = i
        break
      }
    }
    if (first < 0) return true
    const x = first % w
    const y = (first / w) | 0
    const candidates: number[] = []
    if (x + 1 < w) candidates.push(first + 1)
    if (y + 1 < h) candidates.push(first + w)
    if (x > 0) candidates.push(first - 1)
    if (y > 0) candidates.push(first - w)
    const order = shuffle(candidates, rng)
    for (const j of order) {
      if (covered[j]) continue
      covered[first] = 1
      covered[j] = 1
      dominoes.push([first, j])
      if (dfs()) return true
      dominoes.pop()
      covered[first] = 0
      covered[j] = 0
    }
    return false
  }

  return dfs() ? dominoes : null
}

function attempt(spec: GenSpec, rng: () => number, w: number, h: number): GeneratedPuzzle | null {
  const dominoes = makeMatching(w, h, rng)
  if (!dominoes) return null
  const pairs = shuffle(allPairs(4), rng)
  const digits = new Array<number>(w * h).fill(0)
  for (let d = 0; d < dominoes.length; d++) {
    const [a, b] = dominoes[d]!
    const [x, y] = pairs[d]!.split('-').map(Number) as [number, number]
    if (rng() < 0.5) {
      digits[a] = x
      digits[b] = y
    } else {
      digits[a] = y
      digits[b] = x
    }
  }

  const counted = countSolutions(digits, w, h, 2, 400_000)
  if (counted.timedOut || counted.count !== 1) return null

  const edges = buildEdges(digits, w, h)
  const values = new Array<number>(edges.length).fill(0)
  const cellKey = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`)
  const edgeAt = new Map<string, number>()
  for (let e = 0; e < edges.length; e++) edgeAt.set(cellKey(edges[e]!.a, edges[e]!.b), e)
  for (const [a, b] of dominoes) {
    const e = edgeAt.get(cellKey(a, b))
    if (e !== undefined) values[e] = 1
  }

  return {
    id: `dominosa-${w}x${h}-${spec.seed.toString(36)}`,
    name: spec.name,
    width: w,
    height: h,
    difficulty: spec.difficulty,
    series: spec.series,
    board: encodeDigits(digits),
    solution: encodeEdges(values),
  }
}

export function generatePuzzles(): GeneratedPuzzle[] {
  const out: GeneratedPuzzle[] = []
  for (const spec of SPECS) {
    const t0 = Date.now()
    const rng = mulberry32(spec.seed)
    let made: GeneratedPuzzle | null = null
    for (let tries = 0; tries < 200 && !made; tries++) made = attempt(spec, rng, 6, 5)
    if (!made) throw new Error(`[数邻 gen] ${spec.name} 生成失败`)
    console.log(`[数邻 gen] ${spec.name}：${Date.now() - t0}ms`)
    out.push(made)
  }
  return out
}
