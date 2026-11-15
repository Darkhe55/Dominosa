/* 自动生成，勿手改。运行 npm run gen 重新生成。 */
export interface RawPuzzle {
  id: string
  name: string
  width: number
  height: number
  difficulty: 'easy' | 'medium' | 'hard' | 'custom'
  series: string
  /** 题面编码串（格式由 src/game/puzzles.ts 解析） */
  board: string
  /** 参考解编码串（没有则留空） */
  solution?: string
}

export const RAW_PUZZLES: RawPuzzle[] = [
  { id: "dominosa-6x5-lgdq0x", name: "初识数邻", width: 6, height: 5, difficulty: 'easy', series: "入门", board: "312334022241344041104230201103", solution: "1001010010100100001000101001001000000001001110000" },
  { id: "dominosa-6x5-lgdq0y", name: "相邻数对", width: 6, height: 5, difficulty: 'easy', series: "入门", board: "302424310031422021143040332141", solution: "1000110000010000100010100001100000011100100000011" },
  { id: "dominosa-6x5-lgdq0z", name: "数对迷宫", width: 6, height: 5, difficulty: 'medium', series: "进阶", board: "431100043010124412422321430233", solution: "0101000100001000101010101100001010010100001000000" },
  { id: "dominosa-6x5-lgdq10", name: "多米诺拼图", width: 6, height: 5, difficulty: 'medium', series: "进阶", board: "340100012134134322022304144312", solution: "0000100000101000100101001111100000011000000100100" },
  { id: "dominosa-6x5-lgdq11", name: "数邻之壁", width: 6, height: 5, difficulty: 'hard', series: "挑战", board: "430232411431322100310203140424", solution: "0100101001010010100010100100100000000100100000011" },
  { id: "dominosa-6x5-lgdq12", name: "终局数邻", width: 6, height: 5, difficulty: 'hard', series: "挑战", board: "141440103320210312023422304341", solution: "0001000000010000101010101111001000110100001000000" },
]
