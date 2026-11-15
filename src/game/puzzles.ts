/**
 * 数邻 —— 题库
 */

import type { Difficulty, GameState, Puzzle } from '../core/types'
import { RAW_PUZZLES } from './puzzles-data'
import {
  decodeDigits,
  decodeEdges,
  edgeCount,
  type DominosaPuzzle,
  type DominosaState,
} from './types'

export interface RawPuzzle {
  id: string
  name: string
  width: number
  height: number
  difficulty: Difficulty
  series?: string
  board: string
  solution?: string
}

export function decodePuzzle(raw: RawPuzzle): DominosaPuzzle | null {
  const expected = raw.width * raw.height
  const digits = decodeDigits(raw.board, expected, 9)
  if (!digits) return null
  return {
    id: raw.id,
    name: raw.name,
    width: raw.width,
    height: raw.height,
    difficulty: raw.difficulty,
    digits,
    solutionEdges: raw.solution,
  }
}

export const builtinPuzzles: Puzzle[] = (RAW_PUZZLES as RawPuzzle[])
  .map(decodePuzzle)
  .filter((p): p is DominosaPuzzle => p !== null)

export function getReferenceSolution(id: string): GameState | null {
  const raw = (RAW_PUZZLES as RawPuzzle[]).find((p) => p.id === id)
  if (!raw || typeof raw.solution !== 'string') return null
  const puzzle = decodePuzzle(raw)
  if (!puzzle) return null
  const edges = decodeEdges(raw.solution, edgeCount(puzzle.width, puzzle.height))
  if (!edges) return null
  const state: DominosaState = {
    puzzleId: puzzle.id,
    width: puzzle.width,
    height: puzzle.height,
    edges,
  }
  return state
}
