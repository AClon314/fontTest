<script>
  import {
    CANDIDATES,
    DEFAULT_SELECTED,
    GENERICS,
    cssList,
    cssStack,
    detectAll,
    readFontFamily,
  } from './lib/fonts.js';
  import { scrollSync, sizeSync } from './lib/sizeSync.js';

  const DEFAULT_TEXT = `The quick brown fox jumps over the lazy dog 0123456789
中文字体渲染测试：零壹贰叁，繁體字也来一行。
对齐检查 0O1Il|  iiilll ▏▎▍▌ mmm WWW`;

  const TEXT_KEY = 'fontTest.text.v1';
  const SELECTED_KEY = 'fontTest.selected.v1';
  const SETTINGS_KEY = 'fontTest.settings.v1';
  const LOCAL_FONTS_KEY = 'fontTest.localFonts.v1';

  /** 从 localStorage 读一个字符串数组；缺失/坏数据/不可用时返回 fallback */
  function loadList(key, fallback = []) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (!Array.isArray(parsed)) return fallback;
      // 去重：卡片以 font-family 为 key，重复项会让 {#each} 报错
      return [...new Set(parsed.filter((item) => typeof item === 'string'))];
    } catch {
      return fallback;
    }
  }

  /** 输入内容跨刷新保留；localStorage 不可用（隐私模式等）时静默退回默认文本 */
  function loadText() {
    try {
      return localStorage.getItem(TEXT_KEY) ?? DEFAULT_TEXT;
    } catch {
      return DEFAULT_TEXT;
    }
  }

  /** 所有卡片共享的同一段文本 */
  let text = $state(loadText());

  $effect(() => {
    const value = text;
    const timer = setTimeout(() => {
      try {
        if (value === DEFAULT_TEXT) localStorage.removeItem(TEXT_KEY);
        else localStorage.setItem(TEXT_KEY, value);
      } catch {
        // 写不进去就算了，不影响使用
      }
    }, 200);
    return () => clearTimeout(timer);
  });

  /** 除文本之外的 UI 状态整包存一个 key；读时逐项校验，坏值退回默认 */
  function loadSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  const saved = loadSettings();
  const positive = (value, fallback) => (Number.isFinite(value) && value > 0 ? value : fallback);

  let fontSize = $state(positive(saved.fontSize, 16));
  let lineHeight = $state(positive(saved.lineHeight, 1));
  /** 尺寸：fixed 时所有卡片共享同一 px；auto 时宽=最长行全宽、高=内容全高 */
  let heightMode = $state(
    /** @type {'fixed' | 'auto'} */ (saved.heightMode === 'auto' ? 'auto' : 'fixed'),
  );
  let boxWidth = $state(positive(saved.boxWidth, 320));
  let boxHeight = $state(positive(saved.boxHeight, 150));
  /** 固定模式（有滚动条）下，滚动一个框会把其它框按比例滚到同一位置 */
  let syncScroll = $state(typeof saved.syncScroll === 'boolean' ? saved.syncScroll : true);
  let query = $state(typeof saved.query === 'string' ? saved.query : '');
  let onlyAvailable = $state(saved.onlyAvailable === true);

  /** 系统字体族（queryLocalFonts，可缓存）与本次导入的字体文件（会话内有效）分开存 */
  const cachedSystemFonts = loadList(LOCAL_FONTS_KEY);
  let systemFonts = $state(cachedSystemFonts);
  let fileFonts = $state([]);
  const localFonts = $derived([...systemFonts, ...fileFonts]);

  /** 勾选的字体：丢掉当前认不得的名字（文件导入的字体刷新后就没了，留着只会变成坏卡片） */
  const knownFamilies = new Set([...GENERICS, ...CANDIDATES, ...cachedSystemFonts]);
  let selected = $state(
    loadList(SELECTED_KEY, [...DEFAULT_SELECTED]).filter((f) => knownFamilies.has(f)),
  );

  let localFontsNote = $state(
    cachedSystemFonts.length
      ? `已恢复上次读到的 ${cachedSystemFonts.length} 个字体族（可点「读取系统字体列表」刷新）`
      : '',
  );
  let copyNote = $state('');

  /** 勾选的字体列表跨刷新保留（空数组也保留，即「清空」是有效状态） */
  $effect(() => {
    const value = selected;
    try {
      localStorage.setItem(SELECTED_KEY, JSON.stringify(value));
    } catch {
      // 同上，忽略
    }
  });

  /** 字号 / 行高 / 尺寸 / 同步滚动 / 筛选条件全部跨刷新保留（拖手柄会频繁变，防抖写） */
  $effect(() => {
    const value = { fontSize, lineHeight, heightMode, boxWidth, boxHeight, syncScroll, query, onlyAvailable };
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
      } catch {
        // 写不进去就算了
      }
    }, 200);
    return () => clearTimeout(timer);
  });

  const fontList = $derived([...new Set([...GENERICS, ...CANDIDATES, ...localFonts])]);
  const detection = $derived(detectAll(fontList));

  const filtered = $derived(
    fontList.filter((f) => {
      if (query && !f.toLowerCase().includes(query.trim().toLowerCase())) return false;
      if (onlyAvailable && !detection[f]?.latin && !detection[f]?.cjk) return false;
      return true;
    }),
  );

  const cards = $derived(
    selected.map((family) => ({ family, stack: cssStack(family, 'sans-serif') })),
  );

  const hasLocalFontApi = typeof window !== 'undefined' && 'queryLocalFonts' in window;

  /** 字号只接受 > 0 的有限值，非法输入原地丢弃（state 不动） */
  function setFontSize(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;
    fontSize = value;
  }

  /** 拖任一框右下角 resize 手柄 → 所有卡片同步到同一 px（由 sizeSync action 回报） */
  function onResize({ width, height }) {
    boxWidth = width;
    boxHeight = height;
  }

  /** 固定尺寸 ⇄ 自适应内容 */
  function toggleFit() {
    heightMode = heightMode === 'auto' ? 'fixed' : 'auto';
  }

  /** 全选：把当前筛选结果全部选中（保留原有顺序） */
  function selectAllVisible() {
    const visible = new Set(filtered);
    selected = fontList.filter((f) => selected.includes(f) || visible.has(f));
  }

  /** 反选：只翻转当前筛选结果里的选中状态，其余不动 */
  function invertVisible() {
    const visible = new Set(filtered);
    selected = fontList.filter((f) =>
      visible.has(f) ? !selected.includes(f) : selected.includes(f),
    );
  }

  function clearSelection() {
    selected = [];
  }

  function toggle(family) {
    selected = selected.includes(family)
      ? selected.filter((f) => f !== family)
      : [...selected, family];
  }

  /** 剪贴板 API 不可用 / 被拒时的同步兜底（旧浏览器、无权限） */
  function legacyCopy(value) {
    const node = document.createElement('textarea');
    node.value = value;
    node.setAttribute('readonly', '');
    node.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(node);
    node.select();
    const ok = document.execCommand('copy');
    node.remove();
    return ok;
  }

  /** 把当前选中的字体导出成 CSS font-family 值，写进剪贴板 */
  async function copySelection() {
    const value = cssList(selected);
    if (!value) {
      copyNote = '没选中字体';
      return;
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      copied = legacyCopy(value);
    }
    copyNote = copied ? `已复制 ${selected.length} 个` : '复制失败（剪贴板不可用）';
    setTimeout(() => (copyNote = ''), 2000);
  }

  async function loadLocalFonts() {
    if (!hasLocalFontApi) {
      localFontsNote = '这个浏览器没有 window.queryLocalFonts（Local Font Access API，仅 Chromium 系）';
      return;
    }
    try {
      const fonts = await window.queryLocalFonts();
      const families = [...new Set(fonts.map((f) => f.family))].sort((a, b) =>
        a.localeCompare(b, 'zh-Hans-CN'),
      );
      systemFonts = families;
      localFontsNote = `读到 ${families.length} 个字体族（含样式 ${fonts.length} 条）`;
      try {
        localStorage.setItem(LOCAL_FONTS_KEY, JSON.stringify(families));
      } catch {
        // 缓存失败不影响当前使用
      }
    } catch (error) {
      localFontsNote = `读取失败：${error?.message ?? error}（需要用户授权，且必须 localhost / https）`;
    }
  }

  /** 一次最多读多少个文件（CJK 字体动耼十几 MB，别一口气吃爆内存） */
  const MAX_IMPORT_FILES = 40;
  const MAX_FONT_BYTES = 128 * 1024 * 1024;
  /** @type {HTMLInputElement | null} */
  let fileInput = $state(null);
  /** @type {HTMLInputElement | null} */
  let dirInput = $state(null);

  /**
   * 读本地字体文件：FontFace + ArrayBuffer 是标准 API，Chrome / Firefox 都支持，
   * 所以「选文件」与「选文件夹」（`webkitdirectory`，两家都实现了）共用这一条路径。
   * 字体族名从 sfnt 的 name 表里读（woff/woff2 是压缩容器，退回文件名）。
   */
  async function importFonts(fileList) {
    const candidates = [...fileList].filter((file) => /\.(ttf|otf|ttc|otc|woff2?)$/i.test(file.name));
    if (!candidates.length) {
      localFontsNote = '没找到字体文件（支持 .ttf / .otf / .ttc / .woff / .woff2）';
      return;
    }

    const batch = candidates.slice(0, MAX_IMPORT_FILES);
    const families = [];
    const failed = [];
    let skipped = 0;

    for (const file of batch) {
      if (file.size > MAX_FONT_BYTES) {
        skipped += 1;
        continue;
      }
      try {
        const buffer = await file.arrayBuffer();
        const family = readFontFamily(buffer) ?? file.name.replace(/\.[^.]+$/, '');
        const face = new FontFace(family, buffer);
        await face.load();
        document.fonts.add(face);
        families.push(family);
      } catch {
        failed.push(file.name);
      }
    }

    const added = [...new Set(families)];
    if (added.length) {
      fileFonts = [...new Set([...fileFonts, ...added])];
      selected = [...selected, ...added.filter((family) => !selected.includes(family))];
    }

    const notes = [added.length ? `导入 ${added.length} 个字体族` : '没有导入成功的字体'];
    if (candidates.length > batch.length) {
      notes.push(`只读了前 ${batch.length} 个文件（共 ${candidates.length} 个）`);
    }
    if (skipped) notes.push(`跳过 ${skipped} 个超过 ${MAX_FONT_BYTES / 1024 / 1024}MB 的文件`);
    if (failed.length) {
      notes.push(`失败 ${failed.length} 个（${failed.slice(0, 3).join('、')}${failed.length > 3 ? '…' : ''}）`);
    }
    notes.push('文件字体只在本次会话有效');
    localFontsNote = notes.join('；');
  }

  function onFilesPicked(event) {
    const input = event.currentTarget;
    if (input.files?.length) importFonts(input.files);
    input.value = ''; // 同一个文件再选一次也要能触发
  }

  function badgeOf(family) {
    const d = detection[family];
    if (!d) return '';
    if (d.latin && d.cjk) return 'L+C';
    if (d.latin) return 'L';
    if (d.cjk) return 'C';
    return '—';
  }
</script>

<main>
  <header>
    <h1>font-family 多行文本对照</h1>
    <p class="hint">
      下面是同一段文本、同样的字号与行高，只有 <code>font-family</code> 不同。任意一个输入框里改字，所有框同步。
      检测用的是 canvas 测宽对比（对 monospace / serif / sans-serif 三条基线），不下载任何字体。
      badge <code>L</code> / <code>C</code> / <code>L+C</code> = 拉丁 / 中日韩字形是否检测到，
      <code>check✓</code> = <code>document.fonts.check()</code> 也命中（只是附加参考，不参与判定）。
    </p>
  </header>

  <section class="controls">
    <label>
      字号
      <input
        type="range"
        min="1"
        max="128"
        step="0.5"
        value={fontSize}
        oninput={(e) => setFontSize(e.currentTarget.value)}
      />
      <input
        class="num"
        type="number"
        min="0.5"
        step="0.5"
        value={fontSize}
        oninput={(e) => setFontSize(e.currentTarget.value)}
      />px
    </label>
    <label>
      行高
      <input type="range" min="0.5" max="2.5" step="0.25" bind:value={lineHeight} />
      <input class="num" type="number" min="0.5" max="3" step="0.25" bind:value={lineHeight} />
    </label>
    <label>
      尺寸
      <button
        title="点击在「固定尺寸（共享同一 px，可拖右下角同步改）」与「自适应内容（最长行全宽 × 内容全高）」之间切换"
        onclick={toggleFit}
      >
        {heightMode === 'auto'
          ? '自动（最长行宽 × 内容全高）'
          : `固定 ${Math.round(boxWidth)}×${Math.round(boxHeight)}px`}
      </button>
    </label>
    <label class="inline" title="仅对 fixed 模式、确实有滚动条的框生效">
      <input type="checkbox" bind:checked={syncScroll} disabled={heightMode === 'auto'} /> 同步滚动
    </label>
    <button onclick={() => (text = DEFAULT_TEXT)}>重置文本</button>
    <button onclick={() => (selected = [...GENERICS])}>只看通用族</button>
    <button onclick={loadLocalFonts} disabled={!hasLocalFontApi}>
      读取系统字体列表{hasLocalFontApi ? '' : '（不支持）'}
    </button>
    <button onclick={() => fileInput?.click()}>打开字体文件…</button>
    <button
      onclick={() => dirInput?.click()}
      title="选一个文件夹，自动读里面所有字体文件（Chrome / Firefox 都支持）"
    >
      打开字体文件夹…
    </button>
    <input
      class="file-input"
      type="file"
      multiple
      accept=".ttf,.otf,.ttc,.otc,.woff,.woff2"
      bind:this={fileInput}
      onchange={onFilesPicked}
    />
    <input
      class="file-input"
      type="file"
      webkitdirectory="webkitdirectory"
      multiple
      bind:this={dirInput}
      onchange={onFilesPicked}
    />
  </section>
  {#if localFontsNote}
    <p class="note">{localFontsNote}</p>
  {/if}

  <section class="picker">
    <div class="picker-head">
      <strong>候选字体</strong>
      <input
        class="search"
        type="search"
        placeholder="过滤字体名…"
        bind:value={query}
      />
      <label class="inline"><input type="checkbox" bind:checked={onlyAvailable} /> 只显示检测到的</label>
      <button onclick={selectAllVisible}>全选</button>
      <button onclick={invertVisible}>反选</button>
      <button onclick={clearSelection}>清空</button>
      <button onclick={copySelection} title="复制当前选中的 font-family 列表（CSS 值，逗号分隔，带空格的加双引号）">
        复制
      </button>
      {#if copyNote}<span class="mono">{copyNote}</span>{/if}
      <span class="mono">{selected.length} 个已选中 / 共 {filtered.length} 个</span>
    </div>
    <ul class="chips">
      {#each filtered as family (family)}
        {@const d = detection[family]}
        {@const on = selected.includes(family)}
        {@const missing = !d?.latin && !d?.cjk}
        <li>
          <button
            class="chip"
            class:on
            class:missing
            title={`latin=${d?.latin} cjk=${d?.cjk} fonts.check=${d?.fontsCheck}`}
            onclick={() => toggle(family)}
          >
            <span class="badge">{badgeOf(family)}</span>{family}
          </button>
        </li>
      {/each}
    </ul>
  </section>

  {#if cards.length === 0}
    <p class="note">上面挑几个字体看看。</p>
  {/if}

  <section class="grid">
    {#each cards as card (card.family)}
      {@const d = detection[card.family]}
      <article class="card">
        <div class="card-head">
          <span class="name" style="font-family: {card.stack}">{card.family}</span>
          <span class="meta mono">
            <span class="badge">{badgeOf(card.family)}</span>
            {#if d?.fontsCheck}<span title="document.fonts.check 返回 true">check✓</span>{/if}
          </span>
          <button class="close" title="移除" onclick={() => toggle(card.family)}>×</button>
        </div>
        <textarea
          class="sample"
          spellcheck="false"
          data-mode={heightMode}
          use:sizeSync={{ mode: heightMode, width: boxWidth, height: boxHeight, onResize }}
          use:scrollSync={{ enabled: syncScroll && heightMode === 'fixed' }}
          style="font-family: {card.stack}; font-size: {fontSize}px; line-height: {lineHeight}"
          bind:value={text}
        ></textarea>
        <div class="stack mono">{card.stack}</div>
      </article>
    {/each}
  </section>
</main>

<style>
  main {
    /* auto 模式用 100cqw 算尺寸上限：main 的内容宽度即可用宽度 */
    container-type: inline-size;
    padding: 2lh 3ch;
    display: flex;
    flex-direction: column;
    gap: 1.2lh;
  }

  h1 {
    font-size: 1.4em;
    margin: 0 0 0.5lh;
  }

  .hint {
    margin: 0;
    color: var(--muted);
    max-width: 90ch;
  }

  .controls,
  .picker-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6lh 2ch;
  }

  .controls label {
    display: flex;
    align-items: center;
    gap: 0.8ch;
  }

  .controls input[type='range'] {
    width: 16ch;
  }

  .num {
    width: 7ch;
  }

  .file-input {
    display: none;
  }

  .picker {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 1lh 1.5ch;
  }

  .picker-head {
    margin-bottom: 0.8lh;
  }

  .search {
    width: 24ch;
  }

  .inline {
    display: flex;
    align-items: center;
    gap: 0.5ch;
  }

  .chips {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5lh 1ch;
    margin: 0;
    padding: 0;
    max-height: 26lh;
    overflow: auto;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.6ch;
    padding: 0.25lh 1ch;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--chip);
    color: var(--fg);
    cursor: pointer;
    font-size: 0.9em;
  }

  .chip.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-fg);
  }

  .chip.missing {
    opacity: 0.45;
    text-decoration: line-through dotted;
  }

  .badge {
    font-family: ui-monospace, monospace;
    font-size: 0.75em;
    opacity: 0.8;
  }

  .grid {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 1.2lh 1.5ch;
    /* 放开宽度限制：卡片比视口还宽就顶出去，靠页面横向滚动，不缩回去 */
    overflow: visible;
  }

  .card {
    flex: 0 0 auto;
    max-width: none;
    border: 1px solid var(--line);
    border-radius: 8px;
    /* 用 rem 而不是 ch：下面的尺寸上限要按它做减法，ch 会随字体变 */
    padding: 0.8lh 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5lh;
    background: var(--card);
    min-width: 0;
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: 0.8ch;
  }

  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    display: flex;
    gap: 0.6ch;
    color: var(--muted);
    font-size: 0.8em;
  }

  .close {
    border: 1px solid var(--line);
    background: transparent;
    color: var(--fg);
    border-radius: 6px;
    width: 2.2lh;
    height: 2.2lh;
    line-height: 1;
    cursor: pointer;
  }

  .sample {
    box-sizing: border-box;
    resize: both;
    min-width: 8ch;
    min-height: 3lh;
    /* 宽度上限 = main 内容宽 − 卡片左右 padding − 卡片左右边框；拖宽也会被它夹住 */
    max-width: calc(100cqw - 1.5rem - 2px);
    padding: 0.4lh 0.8ch;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    overflow-wrap: break-word;
  }

  /* 自适应内容：宽 = 最长行全宽，高 = 内容全高；装不下时由 max-width 逼回换行 */
  .sample[data-mode='auto'] {
    field-sizing: content;
    resize: none;
    overflow: hidden;
  }

  .stack {
    font-size: 0.75em;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mono {
    font-family: ui-monospace, 'DejaVu Sans Mono', monospace;
    font-size: 0.8em;
    color: var(--muted);
  }

  .note {
    margin: 0;
    color: var(--muted);
    font-size: 0.9em;
  }

  code {
    font-family: ui-monospace, monospace;
    font-size: 0.9em;
  }

  button {
    padding: 0.3lh 1.2ch;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--chip);
    color: var(--fg);
    cursor: pointer;
    font: inherit;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
