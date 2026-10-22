# fontTest — font-family 对照测试页

一个最小的 Svelte 5 + Vite 页面：同一段多行文本、相同字号/行高，只改 `font-family`，并排对比渲染效果。
**不下载任何网络字体**，只看本机已装的字体。

## 运行

```bash
cd ~/document/code/fontTest
bun install   # 首次：装 svelte / vite / @sveltejs/vite-plugin-svelte
bun run dev   # → http://127.0.0.1:5180/
```

打开 <http://127.0.0.1:5180/>。

## 功能

- **共享文本**：每个卡片是一个 `<textarea>`，任意一个里改字，全部同步（`bind:value` 绑同一份 state）。
  输入内容存在 `localStorage`（`fontTest.text.v1`）里，刷新/重开页面不丢；「重置文本」会把这条记录一并清掉。
- **字号 / 行高**：字号任意 `> 0` 的有限值（`0` / 负数 / NaN 会被丢弃，不改状态），
  滑块 1–128 与数字框的 `step` 都是 `0.5`（两者不再打架）；行高默认 `1`，滑块 0.5–2.5、数字框 0.5–3，
  `step` 都是 `0.25`。
- **尺寸同步**（`src/lib/sizeSync.js` action，宽高一起管）：
  - `fixed` 模式：宽高写死成同一 px，拖任一框右下角，所有框同步；正常换行，内容超出就出滚动条。
  - `auto` 模式：**宽 = 该框内最长行的完整宽度**，**高 = 内容的完整高度**，两个方向都没滚动条。
    各字体行宽不同 → 各框宽高可以不一样。
  - 两种模式用第 1 行「尺寸」按钮切换（`fixed` 显示当前 px）。
  - 尺寸本身交给 CSS：`auto` 模式是 `field-sizing: content`（浏览器按内容定宽高），
    `fixed` 模式是 JS 写 `width` / `height`；JS 只负责「拖一个，其它跟着变」。
  - **宽度上限** = `main` 内容宽 − 卡片左右 padding − 边框（`max-width: calc(100cqw - 1.5rem - 2px)`）：
    最长行装不下时自动回到换行并按该宽度重算高；`fixed` 模式拖宽也夹在这个上限内。
    窗口缩放由 CSS 自己跟着变，没有 `resize` 监听器。
- **同步滚动** checkbox：`fixed` 模式且有滚动条时生效，滚动一个框会把其它框按**比例**滚到同一位置
  （各字体换行不同 → 内容高度不同，按比例才对齐）；`auto` 模式自动禁用（不会出滚动条）。
- **候选字体面板**：按 `font-family` 名称过滤；点 chip 加/减卡片；打叉的表示本机没检测到。
  - 勾选结果跨刷新保留（`fontTest.selected.v1`），空选也算有效状态（刷新后仍是 0 张卡片）；
    「全选 / 反选 / 清空」也会即时写回。
  - 通过「读取系统字体列表」拿到的字体族也会缓存（`fontTest.localFonts.v1`），
    否则勾选过的本地字体刷新后会变成「没有 chip 可选中的卡片」；重开页面时会提示已恢复几个族。
  - `复制` = 把当前选中的字体导出成 CSS `font-family` 值（逗号分隔；名字里带空格的用双引号包，
    如 `system-ui, "Sarasa Mono SC", 得意黑`），写进剪贴板；剪贴板 API 被拒时回落 `execCommand`。
  - `全选` / `反选` / `清空` 都只作用于**当前筛选结果**（被过滤掉的选中项不受影响）。
  - badge `L` / `C` / `L+C` = 拉丁 / 中日韩字形是否检测到。
  - `check✓` = `document.fonts.check('16px "X"')` 也返回 true（附加参考，不参与判定）。
- **读取系统字体列表**：调用 `window.queryLocalFonts()`（Local Font Access API，Chromium 系）。
  需要用户手势 + 授权，且必须 localhost/https；headless 下常被直接拒绝，会显示拒绝原因。
- **读取字体文件 / 文件夹**（不依赖 Chromium 专有 API，Chrome / Firefox / Safari 都能用）：
  - `打开字体文件…` = `<input type="file" multiple>`；`打开字体文件夹…` = 同一个 input 加 `webkitdirectory`
    （两家浏览器都实现了，所以不需要 Chrome 的 `showDirectoryPicker`）。
  - 每个文件走标准 `new FontFace(family, arrayBuffer)` + `document.fonts.add()`，按内容自动命名、
    导入后自动入选中列表，检测 badge 也照常算；支持 `.ttf` `.otf` `.ttc` `.otc` `.woff` `.woff2`。
  - 字体族名从 sfnt 的 `name` 表里读（`src/lib/fonts.js: readFontFamily()`，**英文名优先**，
    typographic family 优先于带 `Bold` 后缀的 legacy family）；`.woff` / `.woff2` 是压缩容器，解析不动，
    退回用文件名。`.ttc` 字体集合只能注册 **第一个 face**（`FontFace` 没有 face index 参数）。
  - 防护：一次最多读 40 个文件、单个文件 ≤ 128MB，超了跳过并在提示里写清楚。
  - 这些字体**只在本次会话有效**（不写 localStorage，否则得把整个字体文件塞进去），
    刷新后对应名字会从勾选列表里剔除，不会留下渲染不出的坏卡片。
- 字号 / 行高实时可调，卡片底部显示实际 `font-family` 栈；卡片用 flex-wrap 排列，超宽卡片独占一行。

## 可用性检测原理（`src/lib/fonts.js`）

对每条基线 `monospace` / `serif` / `sans-serif`：

```
metrics("72px \"Some Font\", <基线>")  vs  metrics("72px <基线>")
```

字体不存在时整段回落到基线，五项度量（`width` / `actualBoundingBox{Ascent,Descent}` /
`fontBoundingBox{Ascent,Descent}`）必然一致；存在时任意一项不同即算命中。三条基线任一命中即判定存在。

注意两点：

1. **只比宽度不够**：CJK 表意字在多数中文字体里都是 1em 全宽，纯宽度对比会把 `Sarasa Mono SC`
   这类字体判成「不存在」。所以要带上 bounding box 度量。
2. 仍然只是启发式：若两个字体所有度量完全一致（例如本机 monospace 的 CJK 回落字体本身就是
   `Noto Sans CJK SC`），对某条基线无法区分 —— 但三条基线同时一致的概率很低。
   `document.fonts.check()` 对系统字体并不可靠，仅作参考展示。

这套度量是消融实验验证过的最小集合，三项都别删：

| 消融 | 结果 |
|---|---|
| 去掉 `fontBoundingBox{Ascent,Descent}` | CJK 样本几乎全部漏检 |
| 只留 `width` | CJK 全宽字形全部漏检 |
| 只留 `sans-serif` 一条基线 | `Arial` / `Helvetica` 这类与基线同族的字体漏检 |
| 字体名引号改用 `JSON.stringify` | 66 个候选零差异（已采用） |

## 结构

```
index.html           # 入口
src/main.js          # mount(App)
src/App.svelte       # 全部 UI + 样式（scoped）；auto 模式的尺寸走 CSS
src/lib/fonts.js     # 候选/通用字体列表 + canvas 检测 + 字体文件 name 表解析（纯逻辑，不依赖 Svelte）
src/lib/sizeSync.js  # fixed 尺寸下发 + 拖拽回写；scrollSync 比例对齐
src/app.css          # 仅 root token / body 基础样式
```

浏览器要求：

- `auto` 模式：CSS `field-sizing: content`（Chromium 123+ / 较新的 Firefox、Safari）
- `读取系统字体列表`：Local Font Access API，仅 Chromium 系
- `读取字体文件 / 文件夹`、`复制`、持久化：标准 `FontFace` + `File` + `localStorage`，
  各家浏览器都可用（`webkitdirectory` Firefox 50+ 也支持）

## 持久化

| localStorage key | 内容 |
|---|---|
| `fontTest.text.v1` | textarea 里的文本（等于默认文本时删 key） |
| `fontTest.selected.v1` | 勾选的字体列表（`[]` 也算有效状态） |
| `fontTest.settings.v1` | 字号 / 行高 / `fixed`、`auto` / 固定宽高 / 同步滚动 / 筛选词 / 「只显示检测到的」 |
| `fontTest.localFonts.v1` | `queryLocalFonts()` 读到的字体族名缓存 |

读的时候逐项校验（非法数值、非布尔值、重复或非字符串项都丢掉），localStorage 不可用就用默认值；
文本与设置写入都做了 200ms 防抖（拖 resize 手柄时会频繁变）。

## 简化记录

用消融实验（逐个拿掉实现、看行为差分）砍掉的东西：

| 拿掉的部分 | 为什么能拿 |
|---|---|
| JS 量内容宽高（`contentSize` / `wrap` 切换 / 双帧 `requestAnimationFrame`） | CSS `field-sizing: content` 一次性替掉，量出来同宽同高（仅差约 5px 的旧实现欠量） |
| JS 算可用宽度（遍历 `main` / `.card` 的 padding、边框，外加 `window.resize` 监听） | `100cqw` + 固定 `rem` 的卡片 padding，上限直接写进 `max-width` |
| `dataset.applied*` 基线（区分“程序设的尺寸”与“用户拖的尺寸”） | 直接和 state 比（1px 取整容差），超上限时还能自动收敛 |
| 拖到内容高自动切 `auto`、双击右下角切模式 | 第 1 行「尺寸」按钮一键切即可，省掉一整套内容测量 + 右下角坐标命中 |
| action 的 `text` / `fontSize` / `lineHeight` 触发参数 | CSS 自己会根据内容与字体重排 |
| `data-mode` 属性作为跨模块契约（scrollSync 读它判断模式） | 改成向 action 传 `enabled: syncScroll && mode === 'fixed'` |
| `quoteFamily` 里的正则 + 手写转义 | `JSON.stringify` 就是合法 CSS 字串；通用族靠 `GENERIC_ALIASES` 短接 |

规模：`src/` 915 → 771 行（`sizeSync.js` 213 → 95，`App.svelte` 459 → 455，`fonts.js` +3 行注释）。
功能上只少了两个交互快捷方式：拖到内容高自动切自适应、双击右下角切模式（都改由「尺寸」按钮完成）。

依赖写在 `package.json` 的 `devDependencies`（svelte 5 / vite 8 / @sveltejs/vite-plugin-svelte），
`bun install` 装到本地 `node_modules`，不依赖任何其他仓库。
