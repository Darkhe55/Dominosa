/**
 * 数邻（Dominosa）题图识别导入（全自动识图）
 *
 * 用法：
 *   node scripts/import-image.mjs <图片路径> [--width 42 --height 41 | --size 42]
 *        [--name 名称] [--series human] [--append] [--verify] [--map 0=3,1=7] [--dry]
 *        [--debug 叠加图.png]
 *
 * 数邻题图通常是「没有竖线的数字表」：只有行分隔，靠数字本身占位。
 * 所以网格检测不用网格线，而是：
 *   1. 投影暗像素找行带（数字行），得到行数与行中心；
 *   2. 全图找墨迹连通块（数字），按行分组、按 x 间距合并成「一个格里的数字」；
 *   3. 用所有数字中心做最小二乘，拟合出列中心（等距列）与列数；
 *   4. 每格数字按字高归一化 → 聚类 → 多字体模板匹配得到 0–9；
 *   5. 校验：棋盘尺寸必须满足 w×h=(n+1)(n+2)（0..n 的全数对多米诺），
 *      每个数字出现次数必须是 n+2，且所有相邻数对都要出现（否则必定无解）；
 *   6. 预览数字网格；--map 可人工覆盖字形簇；
 *   7. --append 写入 src/game/puzzles-data.ts（与现有题库条目同一格式）；
 *   8. --verify 调项目 solver 校验唯一解，超大棋盘通常超时，只警告。
 *
 * 已知限制：
 *   - 只支持「数字表」型题图（数邻的标准题图样式）；
 *   - 数字 > 9 时题面自动使用 2 字符/格编码（旧格式仍可正常读取）；
 *   - 42×41 这类超大棋盘求解器基本会超时，--verify 只作警告、不写参考解；
 *   - `npm run gen` 会重写 puzzles-data.ts，识图导入的条目会被覆盖。
 */

import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { countSolutions } from '../src/game/solver.ts'
import { allPairs, buildEdges, encodeDigits, encodeEdges } from '../src/game/types.ts'

const S = 20

const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

function edgePath() {
  for (const p of EDGE_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p
    } catch {
      /* ignore */
    }
  }
  throw new Error('找不到 Edge，请用环境变量 EDGE_PATH 指定 msedge.exe')
}

const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const arg = (flag, fallback = null) => {
  const i = argv.indexOf(flag)
  return i >= 0 ? (argv[i + 1] ?? fallback) : fallback
}

const imageArg = argv.find((a) => !a.startsWith('--'))
if (!imageArg) {
  console.error(
    '用法：node scripts/import-image.mjs <图片路径> [--width N --height N] [--name 名称] [--append] [--verify] [--map 0=3] [--dry] [--debug 输出.png]',
  )
  process.exit(1)
}
const IMAGE = path.resolve(imageArg)
if (!fs.existsSync(IMAGE)) {
  console.error('找不到图片：', IMAGE)
  process.exit(1)
}

const widthOpt = Number(arg('--width', '0')) || 0
const heightOpt = Number(arg('--height', '0')) || 0
const sizeOpt = Number(arg('--size', '0')) || 0
const append = has('--append')
const verify = has('--verify')
const dry = has('--dry')
const nameOpt = arg('--name')
const series = arg('--series', 'human')
const debugOut = arg('--debug')

const manualMap = {}
{
  const i = argv.findIndex((a) => a === '--map' || a.startsWith('--map='))
  if (i >= 0) {
    const raw = argv[i].startsWith('--map=') ? argv[i].slice(6) : (argv[i + 1] ?? '')
    for (const part of String(raw).split(',')) {
      const [k, v] = part.split('=')
      if (k && v) manualMap[Number(k)] = Number(v)
    }
  }
}

const FONTS = []
for (const weight of ['400', '700']) {
  for (const family of [
    'Arial',
    'Helvetica',
    'Tahoma',
    'Verdana',
    '"Segoe UI"',
    '"Times New Roman"',
    'Georgia',
    'Calibri',
    'Cambria',
    '"Lucida Sans Unicode"',
    '"Trebuchet MS"',
    'Consolas',
    '"DejaVu Sans"',
    '"Liberation Sans"',
  ]) {
    FONTS.push(`${weight} 48px ${family}`)
  }
}

// ───────────────────────── 浏览器侧：行带 / 连通块 / 列拟合 ─────────────────────────

const browser = await chromium.launch({ headless: true, executablePath: edgePath() })
const page = await browser.newPage()
await page.setContent('<canvas id="c"></canvas>')
const dataUrl = 'data:image/png;base64,' + fs.readFileSync(IMAGE).toString('base64')

const analyzed = await page.evaluate(
  async ({ u, S, widthOpt, heightOpt, sizeOpt }) => {
    const img = new Image()
    img.src = u
    await img.decode()
    const W = img.naturalWidth
    const H = img.naturalHeight
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const g = cv.getContext('2d', { willReadFrequently: true })
    g.drawImage(img, 0, 0)
    const px = g.getImageData(0, 0, W, H).data
    const lum = (x, y) => {
      const i = (y * W + x) * 4
      return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    }
    const dark = (x, y) => x >= 0 && y >= 0 && x < W && y < H && lum(x, y) < 170

    // —— 行带（数字行） ——
    const rowCount = new Int32Array(H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dark(x, y)) rowCount[y]++
    const maxRow = Math.max(...rowCount)
    const rowThr = Math.max(6, maxRow * 0.12)
    const bands = []
    let start = -1
    for (let y = 0; y < H; y++) {
      const on = rowCount[y] >= rowThr
      if (on && start < 0) start = y
      if (!on && start >= 0) {
        if (y - start >= 6) bands.push({ start, end: y - 1, center: (start + y - 1) / 2 })
        start = -1
      }
    }
    if (start >= 0 && H - start >= 6) bands.push({ start, end: H - 1, center: (start + H - 1) / 2 })
    if (bands.length < 2) throw new Error('没有找到数字行，请确认是数邻的数字表题图。')
    const rowPitch =
      bands.length > 1 ? (bands[bands.length - 1].center - bands[0].center) / (bands.length - 1) : 0
    const wantH = heightOpt || sizeOpt || 0
    if (wantH && wantH !== bands.length) {
      throw new Error(`行数不匹配：识别到 ${bands.length} 行，指定 --height ${wantH}`)
    }

    // —— 全图连通块（数字） ——
    const seen = new Uint8Array(W * H)
    const comps = []
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = y * W + x
        if (seen[k] || lum(x, y) >= 170) continue
        const stack = [[x, y]]
        seen[k] = 1
        let mnx = x
        let mxx = x
        let mny = y
        let mxy = y
        let area = 0
        while (stack.length) {
          const [cx, cy] = stack.pop()
          area++
          if (cx < mnx) mnx = cx
          if (cx > mxx) mxx = cx
          if (cy < mny) mny = cy
          if (cy > mxy) mxy = cy
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = cx + dx
            const ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
            const nk = ny * W + nx
            if (seen[nk] || lum(nx, ny) >= 170) continue
            seen[nk] = 1
            stack.push([nx, ny])
          }
        }
        const w = mxx - mnx + 1
        const h = mxy - mny + 1
        comps.push({ mnx, mxx, mny, mxy, w, h, area })
      }
    }
    // 只保留数字大小的连通块（排除外框）
    const digitComps = comps.filter(
      (c) => c.area >= 12 && c.h >= 5 && c.h <= rowPitch * 0.85 && c.w <= rowPitch * 1.1,
    )

    // —— 按行分组，再按 x 间距合并成一个「数字」 ——
    const gapMerge = Math.max(3, rowPitch * 0.14)
    const rows = bands.map(() => [])
    let unassigned = 0
    for (const c of digitComps) {
      const cy = (c.mny + c.mxy) / 2
      let bi = 0
      let bd = Infinity
      for (let i = 0; i < bands.length; i++) {
        const d = Math.abs(bands[i].center - cy)
        if (d < bd) {
          bd = d
          bi = i
        }
      }
      if (bd > rowPitch * 0.55) {
        unassigned++
        continue
      }
      rows[bi].push(c)
    }
    const numbers = []
    let oddNumbers = 0
    for (let bi = 0; bi < rows.length; bi++) {
      const list = rows[bi].slice().sort((a, b) => a.mnx - b.mnx)
      const groups = []
      for (const c of list) {
        const last = groups[groups.length - 1]
        if (last && c.mnx - last.x1 <= gapMerge) {
          last.items.push(c)
          last.x1 = Math.max(last.x1, c.mxx)
        } else {
          groups.push({ items: [c], x0: c.mnx, x1: c.mxx })
        }
      }
      for (const gr of groups) {
        const digits = gr.items.slice().sort((a, b) => a.mnx - b.mnx)
        if (digits.length > 2) oddNumbers++
        numbers.push({
          row: bi,
          cx: (gr.x0 + gr.x1) / 2,
          x0: gr.x0,
          x1: gr.x1,
          digits: digits.map((d) => ({ x: d.mnx, y: d.mny, w: d.w, h: d.h })),
        })
      }
    }

    // —— 列数：行内数字个数取众数 ——
    const countsByRow = bands.map(() => 0)
    for (const n of numbers) countsByRow[n.row]++
    const freq = new Map()
    for (const c of countsByRow) freq.set(c, (freq.get(c) ?? 0) + 1)
    let nCols = 0
    let best = -1
    for (const [c, f] of freq) {
      if (c > best) {
        best = c
        nCols = c
      }
    }
    const wantW = widthOpt || sizeOpt || 0
    if (wantW && wantW !== nCols) {
      throw new Error(`列数不匹配：识别到 ${nCols} 列，指定 --width ${wantW}`)
    }
    if (nCols < 2) throw new Error('识别到的列数太少，题图可能不是数邻数字表。')

    // —— 用最小二乘拟合列中心：x_i = x0 + i * pitch ——
    const withinDiffs = []
    for (let bi = 0; bi < rows.length; bi++) {
      const centers = numbers.filter((n) => n.row === bi).map((n) => n.cx).sort((a, b) => a - b)
      for (let i = 1; i < centers.length; i++) withinDiffs.push(centers[i] - centers[i - 1])
    }
    withinDiffs.sort((a, b) => a - b)
    const pitch0 = withinDiffs.length ? withinDiffs[Math.floor(withinDiffs.length / 2)] : 0
    if (!(pitch0 > 1)) throw new Error('列间距识别失败。')
    let x0 = Math.min(...numbers.map((n) => n.cx))
    let pitch = pitch0
    const refine = () => {
      let si = 0
      let sc = 0
      let sii = 0
      let sic = 0
      let cnt = 0
      for (const n of numbers) {
        const i = Math.round((n.cx - x0) / pitch)
        si += i
        sc += n.cx
        sii += i * i
        sic += i * n.cx
        cnt++
      }
      const den = cnt * sii - si * si
      if (!den || !cnt) return
      const p = (cnt * sic - si * sc) / den
      if (Number.isFinite(p) && p > 1) pitch = p
      x0 = (sc - pitch * si) / cnt
    }
    for (let it = 0; it < 4; it++) refine()

    // —— 每格：数字中心 → 列号；字形按字高归一化 ——
    const small = document.createElement('canvas')
    small.width = S
    small.height = S
    const sg = small.getContext('2d', { willReadFrequently: true })
    sg.imageSmoothingEnabled = true
    const normGlyph = (bx, by, bw, bh) => {
      const sw = Math.max(1, Math.round((bw * S) / bh))
      sg.fillStyle = '#fff'
      sg.fillRect(0, 0, S, S)
      sg.drawImage(cv, bx, by, bw, bh, Math.floor((S - sw) / 2), 0, sw, S)
      const sd = sg.getImageData(0, 0, S, S).data
      const out = new Array(S * S)
      for (let i = 0; i < S * S; i++) out[i] = 255 - sd[i * 4]
      return out
    }
    const cellGlyphs = Array.from({ length: bands.length * nCols }, () => [])
    let outside = 0
    let mergedSplits = 0
    let wideGlyphs = 0
    // 粗体字里相邻两个数字有时会粘连成一个连通块：按列墨迹找谷底切开
    const splitWide = (d) => {
      if (d.h <= 0 || d.w / d.h < 0.9) return [d]
      const colInk = new Array(d.w).fill(0)
      for (let x = d.x; x < d.x + d.w; x++) {
        let c = 0
        for (let y = d.y; y < d.y + d.h; y++) if (lum(x, y) < 170) c++
        colInk[x - d.x] = c
      }
      const lo = Math.floor(d.w * 0.3)
      const hi = Math.ceil(d.w * 0.7)
      let cut = -1
      let bestInk = Infinity
      for (let i = lo; i <= hi; i++) {
        if (colInk[i] < bestInk) {
          bestInk = colInk[i]
          cut = i
        }
      }
      if (cut < 1 || cut >= d.w - 1) return [d]
      wideGlyphs++
      return [
        { x: d.x, y: d.y, w: cut, h: d.h },
        { x: d.x + cut, y: d.y, w: d.w - cut, h: d.h },
      ]
    }
    for (const n of numbers) {
      const ci = Math.round((n.cx - x0) / pitch)
      if (ci < 0 || ci >= nCols) {
        outside++
        continue
      }
      const idx = n.row * nCols + ci
      const parts = []
      for (const d of n.digits) {
        const split = splitWide(d)
        if (split.length > 1) mergedSplits++
        parts.push(...split)
      }
      parts.forEach((d, order) => {
        cellGlyphs[idx][order] = { m: normGlyph(d.x, d.y, d.w, d.h), w: d.w, h: d.h }
      })
      if (parts.length > 2) oddNumbers++
    }
    return {
      W,
      H,
      w: nCols,
      h: bands.length,
      x0,
      pitch,
      yCenters: bands.map((b) => b.center),
      rowPitch,
      comps: comps.length,
      digitComps: digitComps.length,
      unassigned,
      outside,
      oddNumbers,
      mergedSplits,
      wideGlyphs,
      countsByRow,
      glyphs: cellGlyphs.map((list) =>
        list.filter(Boolean).map((gl) => ({ m: gl.m, w: gl.w, h: gl.h })),
      ),
    }
  },
  { u: dataUrl, S, widthOpt, heightOpt, sizeOpt },
)

// —— 数字模板 0–9 ——
const templates = await page.evaluate(
  ({ fonts, S }) => {
    const c = document.createElement('canvas')
    c.width = 240
    c.height = 120
    const g = c.getContext('2d', { willReadFrequently: true })
    const make = (text, font) => {
      g.fillStyle = '#fff'
      g.fillRect(0, 0, 240, 120)
      g.fillStyle = '#000'
      g.font = font
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(text, 120, 60)
      const d = g.getImageData(0, 0, 240, 120).data
      let ax = 240
      let bx = -1
      let ay = 120
      let by = -1
      for (let y = 0; y < 120; y++)
        for (let x = 0; x < 240; x++)
          if (d[(y * 240 + x) * 4] < 128) {
            if (x < ax) ax = x
            if (x > bx) bx = x
            if (y < ay) ay = y
            if (y > by) by = y
          }
      if (bx < ax) return null
      const bw = bx - ax + 1
      const bh = by - ay + 1
      const t = document.createElement('canvas')
      t.width = S
      t.height = S
      const tg = t.getContext('2d', { willReadFrequently: true })
      tg.imageSmoothingEnabled = true
      tg.fillStyle = '#fff'
      tg.fillRect(0, 0, S, S)
      const sw = Math.max(1, Math.round((bw * S) / bh))
      tg.drawImage(c, ax, ay, bw, bh, Math.floor((S - sw) / 2), 0, sw, S)
      const td = tg.getImageData(0, 0, S, S).data
      const out = new Array(S * S)
      for (let i = 0; i < S * S; i++) out[i] = 255 - td[i * 4]
      return out
    }
    const out = {}
    for (let v = 0; v <= 9; v++) {
      out[v] = {}
      for (const font of fonts) out[v][font] = make(String(v), font)
    }
    return out
  },
  { fonts: FONTS, S },
)

// ───────────────────────── Node 侧：聚类 + 定值 ─────────────────────────

const { w, h, glyphs } = analyzed
const size = w * h

function dist(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i])
  return s / (a.length * 255)
}

const flat = []
for (let i = 0; i < size; i++) {
  ;(glyphs[i] ?? []).forEach((gl, order) => flat.push({ cell: i, order, m: gl.m }))
}
if (!flat.length) {
  console.error('[import] 没有识别到任何数字。')
  process.exit(1)
}

const clusters = []
for (const gl of flat) {
  let best = -1
  let bd = Infinity
  for (let k = 0; k < clusters.length; k++) {
    const d = dist(clusters[k].sum, gl.m)
    if (d < bd) {
      bd = d
      best = k
    }
  }
  if (best >= 0 && bd <= 0.055) {
    const c = clusters[best]
    c.items.push(gl)
    const n = c.items.length
    for (let i = 0; i < c.sum.length; i++) c.sum[i] = (c.sum[i] * (n - 1) + gl.m[i]) / n
  } else {
    clusters.push({ sum: Float32Array.from(gl.m), items: [gl] })
  }
}
for (let round = 0; round < 3; round++) {
  for (const c of clusters) c.items = []
  for (const gl of flat) {
    let best = 0
    let bd = Infinity
    for (let k = 0; k < clusters.length; k++) {
      const d = dist(clusters[k].sum, gl.m)
      if (d < bd) {
        bd = d
        best = k
      }
    }
    clusters[best].items.push(gl)
  }
  for (const c of clusters) {
    if (!c.items.length) continue
    const sum = new Float32Array(S * S)
    for (const gl of c.items) for (let i = 0; i < sum.length; i++) sum[i] += gl.m[i]
    for (let i = 0; i < sum.length; i++) sum[i] /= c.items.length
    c.sum = sum
  }
}
const live = clusters.filter((c) => c.items.length > 0)

const sim = (a, b) => {
  let inter = 0
  let uni = 0
  for (let i = 0; i < a.length; i++) {
    const av = a[i] > 127 ? 1 : 0
    const bv = b[i] > 127 ? 1 : 0
    if (av && bv) inter++
    if (av || bv) uni++
  }
  return uni ? inter / uni : 0
}

const parent = live.map((_, i) => i)
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
for (let i = 0; i < live.length; i++) {
  for (let j = i + 1; j < live.length; j++) {
    if (dist(live[i].sum, live[j].sum) < 0.035) {
      const a = find(i)
      const b = find(j)
      if (a !== b) parent[b] = a
    }
  }
}
const merged = new Map()
for (let i = 0; i < live.length; i++) {
  const r = find(i)
  if (!merged.has(r)) merged.set(r, [])
  merged.get(r).push(i)
}
const info = [...merged.values()].map((members) => {
  const sum = new Float32Array(S * S)
  let count = 0
  for (const i of members) {
    for (const gl of live[i].items) {
      for (let k = 0; k < sum.length; k++) sum[k] += gl.m[k]
      count++
    }
  }
  for (let k = 0; k < sum.length; k++) sum[k] /= Math.max(1, count)
  const ranked = []
  for (let v = 0; v <= 9; v++) {
    let best = 0
    for (const f of FONTS) {
      const t = templates[v][f]
      if (!t) continue
      const sc = sim(sum, t)
      if (sc > best) best = sc
    }
    ranked.push({ v, score: best })
  }
  ranked.sort((a, b) => b.score - a.score)
  return { members, size: count, ranked }
})
info.sort((a, b) => b.size - a.size)

const digits = new Array(info.length).fill(-1)
for (const [k, v] of Object.entries(manualMap)) {
  const ki = Number(k)
  if (!Number.isInteger(ki) || ki < 0 || ki >= info.length) {
    console.warn(`[import] --map 里的簇号 ${k} 不存在（有效范围 0–${info.length - 1}）。`)
    continue
  }
  digits[ki] = Number(v)
}
for (let k = 0; k < info.length; k++) if (digits[k] < 0) digits[k] = info[k].ranked[0].v

console.log(
  `[import] ${path.basename(IMAGE)}：${analyzed.W}×${analyzed.H}px，数字表 ${w}×${h}（列距 ${analyzed.pitch.toFixed(2)}px），` +
    `连通块 ${analyzed.comps} → 数字块 ${analyzed.digitComps}，字形 ${flat.length} 个 → ${info.length} 簇`,
)
if (analyzed.unassigned || analyzed.outside) {
  console.warn(
    `[import] 有 ${analyzed.unassigned} 个数字块没落到行上、${analyzed.outside} 个没落到列上（已忽略）。`,
  )
}
if (analyzed.oddNumbers) {
  console.warn(`[import] 有 ${analyzed.oddNumbers} 个格子里超过 2 个数字块，可能粘连或多识别。`)
}
if (analyzed.mergedSplits) {
  console.log(
    `[import] 已把 ${analyzed.mergedSplits} 个粘连的两位数字块按列谷底切开（宽字形 ${analyzed.wideGlyphs} 个）。`,
  )
}
const rowMode = [...new Set(analyzed.countsByRow)]
if (rowMode.length > 1) {
  console.warn(`[import] 每行数字个数不一致：${rowMode.sort((a, b) => a - b).join('/')}。`)
}
for (let k = 0; k < info.length; k++) {
  const [first, second] = info[k].ranked
  console.log(
    `  簇${String(k).padStart(2)} → 数字 ${digits[k]}（${manualMap[k] !== undefined ? '人工' : '模板'}，` +
      `n=${String(info[k].size).padStart(4)}，得分 ${first.score.toFixed(2)}，次佳 ${second.v}=${second.score.toFixed(2)}）`,
  )
}

// —— 拼回每格数字 ——
const cellDigitList = Array.from({ length: size }, () => [])
for (let k = 0; k < info.length; k++) {
  for (const ci of info[k].members) {
    for (const it of live[ci].items) cellDigitList[it.cell][it.order] = digits[k]
  }
}
const values = new Array(size).fill(-1)
for (let i = 0; i < size; i++) {
  const list = cellDigitList[i]
  if (!list.length) continue
  let v = 0
  let ok = true
  for (const d of list) {
    if (d === undefined || d < 0) {
      ok = false
      break
    }
    v = v * 10 + d
  }
  if (ok) values[i] = v
}

// —— 预览 ——
const valueMax = values.reduce((a, v) => Math.max(a, v), 0)
const pad2 = String(Math.max(9, valueMax)).length + 1
console.log(`\n识别数字表：${w}×${h}，最大数字 ${valueMax}`)
for (let y = 0; y < h; y++) {
  const row = []
  for (let x = 0; x < w; x++) {
    const v = values[y * w + x]
    row.push((v >= 0 ? String(v) : '?').padStart(pad2))
  }
  console.log(String(y + 1).padStart(2) + ' |' + row.join(''))
}
const missing = values.reduce((a, v) => a + (v < 0 ? 1 : 0), 0)
if (missing) console.warn(`[import] 有 ${missing} 格没有识别到数字。`)

// —— 数邻结构校验：w×h=(n+1)(n+2)，每个数字出现 n+2 次，且所有数对都要出现 ——
const cellsTotal = w * h
let n = -1
for (let k = 1; k < 200; k++) {
  if ((k + 1) * (k + 2) === cellsTotal) {
    n = k
    break
  }
}
if (n < 0) {
  console.warn(
    `[import] 注意：${w}×${h}=${cellsTotal} 格不满足 (n+1)(n+2)，不是完整的 0..n 数对多米诺棋盘（可能是残缺题图）。`,
  )
} else {
  console.log(`[import] 棋盘结构：${w}×${h} = ${n + 1}×${n + 2}，对应 0–${n} 的全数对多米诺。`)
  const freq = new Map()
  for (const v of values) if (v >= 0) freq.set(v, (freq.get(v) ?? 0) + 1)
  const freqBad = []
  for (let v = 0; v <= n; v++) {
    const c = freq.get(v) ?? 0
    if (c !== n + 2) freqBad.push(`${v}出现${c}次`)
  }
  if (freqBad.length) {
    console.warn(
      `[import] 数字出现次数不符合「每个数字 ${n + 2} 次」（识别可能有误）：` + freqBad.slice(0, 12).join('，'),
    )
  } else {
    console.log(`[import] 数字频次校验通过：0–${n} 每个数字都出现 ${n + 2} 次。`)
  }
  // 数对覆盖：每个数对至少要在相邻格里出现一次，否则一定无解
  const edges = buildEdges(values, w, h)
  const present = new Set(edges.map((e) => e.key))
  const missingPairs = allPairs(n).filter((k) => !present.has(k))
  if (missingPairs.length) {
    console.warn(
      `[import] 相邻格里缺少 ${missingPairs.length} 个数对（必然无解，识别可能有误）：` +
        missingPairs.slice(0, 12).join('，'),
    )
  } else {
    console.log(`[import] 数对覆盖校验通过：${allPairs(n).length} 个数对在盘面上都出现过。`)
  }
}
const lowConfidence = info
  .map((it, k) => ({ k, margin: it.ranked[0].score - it.ranked[1].score, score: it.ranked[0].score }))
  .filter((x) => x.margin < 0.12 || x.score < 0.6)
if (lowConfidence.length) {
  console.warn(
    `[import] 这些字形簇置信度偏低，识别有误可用 --map 修正：` +
      lowConfidence.map((x) => `簇${x.k}(${x.score.toFixed(2)}/${x.margin.toFixed(2)})`).join(' '),
  )
}

// —— 可选：导出识别叠加图 ——
if (debugOut) {
  const debugPath = path.resolve(debugOut)
  const png = await page.evaluate(
    ({ u, values, w, h, x0, pitch, yCenters }) => {
      const img = new Image()
      img.src = u
      return new Promise((resolve) => {
        img.onload = () => {
          const cv = document.createElement('canvas')
          cv.width = img.naturalWidth
          cv.height = img.naturalHeight
          const g = cv.getContext('2d')
          g.drawImage(img, 0, 0)
          g.strokeStyle = 'rgba(0,160,255,0.55)'
          g.lineWidth = 1
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const cx = x0 + x * pitch
              const cy = yCenters[y]
              g.strokeRect(cx - pitch * 0.48, cy - pitch * 0.42, pitch * 0.96, pitch * 0.84)
            }
          }
          g.font = 'bold 13px Arial'
          g.fillStyle = 'rgba(0,200,0,0.9)'
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const v = values[y * w + x]
              if (v < 0) continue
              g.fillText(String(v), x0 + x * pitch + pitch * 0.36, yCenters[y] - pitch * 0.36)
            }
          }
          resolve(cv.toDataURL('image/png'))
        }
      })
    },
    { u: dataUrl, values, w, h, x0: analyzed.x0, pitch: analyzed.pitch, yCenters: analyzed.yCenters },
  )
  fs.writeFileSync(debugPath, Buffer.from(png.split(',')[1], 'base64'))
  console.log(`[import] 已导出识别叠加图：${debugPath}`)
}
await browser.close()

if (dry) {
  console.log('\n[import] --dry：只识别预览，不校验唯一解、不写入。')
  process.exit(0)
}
if (missing) process.exit(1)

// —— 可选：唯一解校验（超大棋盘基本会超时） ——
let solution = ''
if (verify) {
  const t0 = Date.now()
  const budget = size > 400 ? 60_000 : 400_000
  const counted = countSolutions(values, w, h, 2, budget)
  if (counted.timedOut) {
    console.warn(
      `[import] 唯一解校验超时（${counted.nodes} 节点，${Date.now() - t0}ms），只作警告，不写参考解。`,
    )
  } else if (counted.count === 0) {
    console.warn('[import] 当前数字表无解，识别可能有误（可用 --map 修正）。')
  } else if (counted.count > 1) {
    console.warn(`[import] 解不唯一（${counted.count} 个），识别可能有误或题面本身不唯一。`)
  } else {
    console.warn('[import] 唯一解校验通过，但未提取参考解；如需参考解请人工补齐。')
  }
}

if (!append) {
  console.log('\n[import] 预览模式（未写入）。加 --append 写入 src/game/puzzles-data.ts。')
  process.exit(0)
}

// —— 写入题库 ——
const id = arg('--id', `dominosa-img-${w}x${h}-${Date.now().toString(36)}`)
const name = nameOpt || `识图 · ${w}×${h}`
const board = encodeDigits(values)
const entry =
  `  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)}, width: ${w}, height: ${h}, ` +
  `difficulty: 'hard', series: ${JSON.stringify(series)}, board: ${JSON.stringify(board)}, ` +
  `solution: ${JSON.stringify(solution)} },\n`
const dataFile = path.resolve('src/game/puzzles-data.ts')
let text = fs.readFileSync(dataFile, 'utf8').replace(/\r\n/g, '\n')
const marker = text.lastIndexOf('\n]')
if (marker < 0) throw new Error('puzzles-data.ts 格式异常：找不到结尾 ]')
text = text.slice(0, marker + 1) + '\n' + entry + text.slice(marker + 1)
fs.writeFileSync(dataFile, text)
console.log(`[import] 已写入 src/game/puzzles-data.ts：${id} ${name}`)
