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
  - 尺寸本身交给 CSS / 模板：`auto` 模式是 `field-sizing: content`（浏览器按内容定宽高），
    `fixed` 模式由模板的 `style` 属性按 state 写 `width` / `height`；
    action 只负责「拖一个，其它跟着变」（不碰 inline style，详见下方简化记录）。
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
  - 字体族名从 sfnt 的 `name` 表里读（`src/lib/fontFiles.js: readFontFamily()`，**英文名优先**，
    typographic family 优先于带 `Bold` 后缀的 legacy family）；`.woff` / `.woff2` 是压缩容器，解析不动，
    退回用文件名。`.ttc` 字体集合只能注册 **第一个 face**（`FontFace` 没有 face index 参数）。
  - 防护：一次最多读 40 个文件、单个文件 ≤ 128MB，超了跳过并在提示里写清楚。
  - 这些字体**只在本次会话有效**（不写 localStorage，否则得把整个字体文件塞进去），
    刷新后对应名字会从勾选列表里剔除，不会留下渲染不出的坏卡片。
- **网络字体（CDN，默认不加载）**：`加载网络字体 Maple Mono NF CN（CDN）` 按钮 = 注入
  `https://fontsapi.zeoseven.com/442/main/result.css` 后把该族加进候选。没点之前一个字节都不下载。
  实测加载量、防盗链坑见下一节。
- 字号 / 行高实时可调，卡片底部显示实际 `font-family` 栈；卡片用 flex-wrap 排列，超宽卡片独占一行。

## 网络字体（ZeoSeven CDN 上的 Maple Mono NF CN）

`https://fonts.zeoseven.com/items/442/` 是 Maple Mono NF CN（圆角等宽 + 连字 + Nerd Font 图标 + 中日韩字形，
SIL OFL 1.1）。它用 `cn-font-split` 把字体切成 **191 个 woff2 分块**，每块带自己的 `unicode-range`，
浏览器只会下载「页面真的用到的字形」所在的分块。用裸 Chrome + CDP 量的真实传输量（含 gzip）：

| 场景 | 字体分块 | 字体字节 | + 样式表 | 合计 |
|---|---|---|---|---|
| 纯英文 + 数字（默认文本第一行） | 2 块 | ~61 KB | 48.3 KB | **~0.11 MB** |
| 应用默认文本（110 字，含几十个汉字与繁体） | 16 块 | 783 KB | 48.3 KB | **~0.81 MB** |
| 100 个常用汉字 + 英文 | 7 块 | 246 KB | 48.3 KB | **~0.29 MB** |
| 300 个不重复汉字 | 18 块 | 1.05 MB | 48.3 KB | **~1.10 MB** |
| 460 个不重复汉字（README 全文的汉字集合） | 21 块 | 1.31 MB | 48.3 KB | **~1.36 MB** |
| 全部 191 块（整个字体的字形集合） | 191 块 | 10.23 MB | 48.3 KB | **~10.3 MB** |

样式表 151 KB 原始 / 48.3 KB gzip（191 条 `@font-face`，解析本身很快）；分块带
`cache-control: public, immutable, max-age=31536000`，同一浏览器第二次只付样式表（还能 304）。
结论：**不会一上来就 10MB**，实际是 0.1～1.4 MB 量级，取决于文本里出现了多少不重复的字。

⚠️ **防盗链**：该 CDN 对 `Referer` 是 **IP 字面量**（`http://127.0.0.1:5180`、`http://192.168.x.x`、`http://[::1]`）
或 **没有 UA** 的请求直接返回 `204 No Content`（0 字节），浏览器控制台不会有报错，只是字体静默不生效
（`document.fonts.size === 0`）。用域名（`http://localhost:5180`）或干脆不发 Referer 就正常。
所以注入 `<link>` 时显式设了 `link.referrerPolicy = 'no-referrer'`；想写死静态 `<link>` 的话要带
`referrerpolicy="no-referrer"` 或页面里加 `<meta name="referrer" content="no-referrer">`。

加载流程：插 `<link>` → 等 `load` → `await document.fonts.load('16px "Maple Mono NF CN"', 当前文本)`
先把当前文本的分块拉下来 → 才把族名加进候选列表，这样紧接着的 canvas 检测量到的是真字体而不是回退字体。

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
index.html              # 入口
src/main.js             # mount(App)
src/App.svelte          # UI 与状态编排（runes）+ scoped 样式
src/lib/fonts.js        # 候选/通用字体列表 + canvas 可用性检测 + CSS 栈拼装
src/lib/fontFiles.js    # 本地字体文件：name 表解析 + FontFace 注册（含限额）
src/lib/sizeSync.js     # fixed 尺寸拖拽回写 + 按比例同步滚动
src/lib/storage.svelte.js # localStorage：schema 校验 + 防抖写
src/app.css             # 仅 root token / body 基础样式
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

用消融实验（逐个拿掉实现、看行为差分）砍掉的东西。第一轮（尺寸/检测）：

| 拿掉的部分 | 为什么能拿 |
|---|---|
| JS 量内容宽高（`contentSize` / `wrap` 切换 / 双帧 `requestAnimationFrame`） | CSS `field-sizing: content` 一次性替掉，量出来同宽同高（仅差约 5px 的旧实现欠量） |
| JS 算可用宽度（遍历 `main` / `.card` 的 padding、边框，外加 `window.resize` 监听） | `100cqw` + 固定 `rem` 的卡片 padding，上限直接写进 `max-width` |
| `dataset.applied*` 基线（区分“程序设的尺寸”与“用户拖的尺寸”） | 直接和 state 比（1px 取整容差），超上限时还能自动收敛 |
| 拖到内容高自动切 `auto`、双击右下角切模式 | 第 1 行「尺寸」按钮一键切即可，省掉一整套内容测量 + 右下角坐标命中 |
| action 的 `text` / `fontSize` / `lineHeight` 触发参数 | CSS 自己会根据内容与字体重排 |
| `data-mode` 属性作为跨模块契约（scrollSync 读它判断模式） | 改成向 action 传 `enabled: syncScroll && mode === 'fixed'` |
| `quoteFamily` 里的正则 + 手写转义 | `JSON.stringify` 就是合法 CSS 字串；通用族靠 `GENERIC_ALIASES` 短接 |

第二轮（抽象/模块化）：

| 改动 | 结果 |
|---|---|
| action 不再写 inline `width` / `height`，改由模板的 `style` 属性从 state 写 | **修掉一个真 bug**：Svelte 更新 `style` 属性时会抹掉 action 写的尺寸，`fixed` 模式改字号后框会塔成浏览器默认尺寸（实测 360×140 → 287×68）；现在 action 只读 style 判断“是不是用户拖的” |
| 持久化样板（4 个 key × 逐个校验 + 防抖 `$effect` + try/catch） | 抽成 `src/lib/storage.svelte.js`：`readSettings(key, schema)` + `autoSave(getter, save)`；新增一个持久化字段 = schema 一行 |
| 字体文件导入（筛扩展名 / 限大小 / FontFace / 组提示文本）与 name 表解析 | 抽成 `src/lib/fontFiles.js`；`fonts.js` 只留候选列表 + canvas 检测 |
| 两个提示位（`localFontsNote` + `copyNote` + 两个定时器） | 合并为一个 `note` + `say(message, ttl)` |
| 字号/行高两套输入框（一个手写校验、一个 `bind:value`） | 一个 `{#snippet numberField}` + 统一 `setNumber()` 校验（顺手修了行高可被写成空值/NaN 的隐患） |
| 全选/反选/清空三份 `includes` 扫描 | `selectedSet` / `visibleSet` 两个 `$derived(Set)` + 一个 `pick(predicate)` |
| name 表的手写 UTF-16BE / MacRoman 解码 | `TextDecoder('utf-16be')` / `TextDecoder('macintosh')`（解析结果与之前、与 `fc-scan` 逐字一致） |

规模（去注释/空行）：`src/` 880 → 925 行，但拆成了 5 个职责单一的文件（`App.svelte` 583 → 550，
`fonts.js` 209 → 149，`sizeSync.js` 60 → 51，新增 `fontFiles.js` 93、`storage.svelte.js` 54）。
代码总量略升是因为把原本写死在组件里的机制抽象成了可复用模块；组件侧的样板明显变少。

依赖写在 `package.json` 的 `devDependencies`（svelte 5 / vite 8 / @sveltejs/vite-plugin-svelte），
`bun install` 装到本地 `node_modules`，不依赖任何其他仓库。
