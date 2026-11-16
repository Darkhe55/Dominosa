# 数邻 Dominosa

一个基于 Web 的数邻（Dominosa）谜题游戏，原生 SVG 渲染，内置逻辑解题器。

## 在线体验

```bash
npm install
npm start
```

`npm start` 会等开发服务就绪后用默认浏览器打开 **http://127.0.0.1:5201/**。

> 也可以用 `npm run dev`，但不会自动打开浏览器。

## 游戏规则

- 用多米诺（相邻两格）铺满棋盘
- 每一对数字在整盘恰好出现一次，包括相同数字对
- 多米诺不能重叠或越界

## 操作

| 操作 | 说明 |
|------|------|
| 左键点相邻格之间的边 | 放置 / 取消多米诺 |
| 右键点边 | 清除多米诺 |
| 按住拖动 | 连续操作 |
| 滚轮 / 中键拖拽 | 缩放 / 平移画布 |
| Z / Shift+Z / Y | 撤销 / 重做 |
| C / H / S / Esc | 检查 / 提示一格 / 显示解 / 清空 |
| R / L / P / M | 随机抽题 / 逻辑解题 / 暂停回放 / 音效开关 |
| 0 / + / - | 视图复位 / 放大 / 缩小 |

## 数据存放

运行 `npm start` / `npm run dev` 时，题库、进度和上次题目保存在项目内 `data/` 目录；静态部署时自动降级到浏览器 localStorage。

## 功能

- **题库**：内置多道题，题目均校验唯一解
- **实时校验**：冲突与违规位置即时高亮，满足的条件同步变灰
- **图片导入**：`npm run import-image` 可识别数字表题图并写入题库
- **逻辑解题**：规则引擎逐帧回放，显示每一步理由；回放中按钮变为停止，按 `P` 暂停/继续
- **提示一格 / 显示解**：提示优先揭示所有解一致的格子，显示解直接填入可行答案
- **撤销/重做**：按手势分组，一次拖拽只需一步撤销
- **进度保存**：自动保存当前题目进度，刷新不丢失
- **音效特效**：Web Audio 合成拨弦、水滴与落子动画，无外部音频资源
- **缩放/平移**：滚轮缩放，中键或 `Shift` 拖拽平移

## 技术栈

- Vite + TypeScript
- 原生 SVG（无框架）
- Web Audio 合成音效（无外部资源）
- localStorage / 项目内 `data/` 存储进度与题库

## 项目结构

```
src/
  main.ts
  core/
    app.ts / ui.ts / view.ts      界面、交互、缩放、回放控制
    store.ts / library.ts         题库、进度、上次题目存储
    audio.ts / fx.ts              音效与落子特效
  game/
    adapter.ts                    游戏规则接入
    rules.ts                      推理规则
    logic.ts                      逻辑解题回放
    render.ts / state.ts          SVG 渲染与盘面状态
    validate.ts / solver.ts       实时校验与回溯求解
    puzzles.ts / puzzles-data.ts  题库加载与静态题库
```

## 识图导入

数邻题图通常是「没有竖线、只有数字」的数字表，识别流程会先找行带、再用数字中心拟合列网格。

```bash
# 预览：自动识别数字表并打印网格（默认自动识别行列数）
npm run import-image -- 题板.png

# 指定尺寸
npm run import-image -- 题板.png --width 42 --height 41

# 写入题库；数邻唯一解校验基本会超时，--verify 只作警告
npm run import-image -- 题板.png --append --verify

# 某个字形簇数字识别错了：按打印出的「簇号=数字」人工覆盖
npm run import-image -- 题板.png --map 21=0

# 导出识别叠加图（蓝框为识别出的格子，右上角绿色为识别值）
npm run import-image -- 题板.png --dry --debug 叠加.png
```

识别流程：投影暗像素找行带 → 全图墨迹连通块（数字）按行分组并按 x 间距合并成「格内数字」 → 相邻数字粘连时按列墨迹谷底切开 → 所有数字中心最小二乘拟合等距列网格 → 字高归一化聚类 + 多字体模板匹配 → 拼回每格数字。

识别后会自动做数邻结构校验：

- 棋盘须满足 `w×h=(n+1)(n+2)`（0–n 的全数对多米诺）；
- 每个数字 0–n 在盘面上出现次数必须是 `n+2`；
- 所有数对都必须在相邻格里出现过（否则必定无解）。

| 参数 | 说明 |
|------|------|
| `--width N` / `--height N` / `--size N` | 手动指定网格尺寸；默认自动识别 |
| `--name 名称` | 题库中显示的名称（默认 `识图 · 宽×高`） |
| `--series 系列` | 题库系列，默认 `human` |
| `--append` | 追加写入 `src/game/puzzles-data.ts` |
| `--verify` | 调 solver 校验唯一解；超大棋盘基本会超时，只警告、不写参考解 |
| `--map 簇号=数字,...` | 人工覆盖字形簇的识别结果 |
| `--debug 输出.png` | 导出识别叠加图，便于核对 |
| `--dry` | 只识别预览，不校验、不写入 |

已知限制：

- 只支持「数字表」型题图（数邻的标准题图样式）；
- 数字超过 9（例如 0–40 的 42×41 大棋）时，题面会自动使用 2 字符/格编码（旧格式仍可正常读取）；
- 42×41 这类超大棋盘求解器基本会超时，`--verify` 不写参考解（`npm run check` 会跳过无参考解的条目）；
- `npm run gen` 会重写 `src/game/puzzles-data.ts`，识图导入的条目也会被覆盖，需要重新导入。

## 命令

```bash
npm run dev       # 开发服务
npm start         # 开发服务 + 自动打开浏览器
npm run build     # tsc --noEmit + vite build
npm run import-image -- 题板.png   # 识图导入（预览）
npm run gen       # 重新生成题库
npm run check     # 审计题库
npm run verify    # 参考解、逻辑回放与交互验证
npm run audit     # 逐题审计逻辑解题
```
