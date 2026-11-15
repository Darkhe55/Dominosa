/**
 * 数邻 —— SVG 渲染
 */

import {
  cellCenter,
  edgeAtPoint,
  originOf,
  squareMetrics,
  cellSizeOf,
} from '../core/board'
import type { BoardMetrics, GameState, HitTarget, Puzzle, ValidationResult } from '../core/types'
import {
  asDominosaPuzzle,
  asDominosaState,
  buildEdges,
  type DominosaResult,
} from './types'

export function metricsFor(puzzle: Puzzle): BoardMetrics {
  return squareMetrics(puzzle.width, puzzle.height, { cell: 60, pad: 24 })
}

export function renderBoard(
  puzzle: Puzzle,
  state: GameState,
  result: ValidationResult,
): string {
  const p = asDominosaPuzzle(puzzle)
  const s = asDominosaState(state)
  const r = result as DominosaResult
  const m = metricsFor(puzzle)
  const o = originOf(m)
  const { w: cw, h: ch } = cellSizeOf(m)
  const bad = new Set(r.badCells ?? [])
  const edges = buildEdges(p.digits ?? [], p.width, p.height)
  const parts: string[] = []

  parts.push(
    `<rect class="dm-board-bg" x="${o.x}" y="${o.y}" width="${(cw * p.width).toFixed(2)}" height="${(ch * p.height).toFixed(2)}" />`,
  )

  for (let i = 0; i < p.width * p.height; i++) {
    const x = o.x + (i % p.width) * cw
    const y = o.y + Math.floor(i / p.width) * ch
    parts.push(
      `<rect class="dm-cell" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cw.toFixed(2)}" height="${ch.toFixed(2)}" />`,
    )
    const c = cellCenter(m, i)
    parts.push(
      `<text class="dm-digit${bad.has(i) ? ' bad' : ''}" x="${c.x.toFixed(2)}" y="${(c.y + 2).toFixed(2)}" style="font-size:${(m.cell * 0.52).toFixed(2)}px">${p.digits?.[i] ?? 0}</text>`,
    )
  }

  for (let e = 0; e < edges.length; e++) {
    if ((s.edges[e] ?? 0) !== 1) continue
    const edge = edges[e]!
    const ca = cellCenter(m, edge.a)
    const cb = cellCenter(m, edge.b)
    const pad = cw * 0.44
    const x = Math.min(ca.x, cb.x) - pad
    const y = Math.min(ca.y, cb.y) - pad
    const w = Math.abs(ca.x - cb.x) + pad * 2
    const h = Math.abs(ca.y - cb.y) + pad * 2
    parts.push(
      `<rect class="dm-domino" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${(cw * 0.16).toFixed(2)}" />`,
    )
  }

  return `<svg class="board-svg dm-board" viewBox="0 0 ${m.svgWidth} ${m.svgHeight}" width="${m.svgWidth}" height="${m.svgHeight}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
}

export function hitTest(m: BoardMetrics, puzzle: Puzzle, x: number, y: number): HitTarget | null {
  void puzzle
  const edge = edgeAtPoint(m, x, y, m.cell * 0.42)
  return edge === null ? null : { index: edge, kind: 'edge' }
}
