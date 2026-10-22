<script>
  import {
    CANDIDATES,
    DEFAULT_SELECTED,
    GENERICS,
    cssList,
    cssStack,
    detectAll,
  } from './lib/fonts.js';
  import { FONT_FILE_RE, MAX_FONT_BYTES, MAX_IMPORT_FILES, importFontFiles } from './lib/fontFiles.js';
  import { scrollSync, sizeSync } from './lib/sizeSync.js';
  import {
    autoSave,
    readSettings,
    readString,
    readStringList,
    removeKey,
    writeJson,
  } from './lib/storage.svelte.js';

  const DEFAULT_TEXT = `The quick brown fox jumps over the lazy dog 0123456789
中文字体渲染测试：零壹贰叁，繁體字也来一行。
对齐检查 0O1Il|  iiilll ▏▎▍▌ mmm WWW`;

  const TEXT_KEY = 'fontTest.text.v1';
  const SELECTED_KEY = 'fontTest.selected.v1';
  const SETTINGS_KEY = 'fontTest.settings.v1';
  const LOCAL_FONTS_KEY = 'fontTest.localFonts.v1';

  /** 除文本外的 UI 状态：schema 一项 = 默认值 + 校验规则（读时逐项校验，坏值退回默认） */
  const SETTINGS_SCHEMA = {
    fontSize: { type: 'number', gt: 0, default: 16 },
    lineHeight: { type: 'number', gt: 0, default: 1 },
    heightMode: { type: 'enum', values: ['fixed', 'auto'], default: 'fixed' },
    boxWidth: { type: 'number', gt: 0, default: 320 },
    boxHeight: { type: 'number', gt: 0, default: 150 },
    syncScroll: { type: 'boolean', default: true },
    query: { type: 'string', default: '' },
    onlyAvailable: { type: 'boolean', default: false },
  };
  const saved = readSettings(SETTINGS_KEY, SETTINGS_SCHEMA);

  /** 所有卡片共享的同一段文本 */
  let text = $state(readString(TEXT_KEY, DEFAULT_TEXT));
  let fontSize = $state(saved.fontSize);
  let lineHeight = $state(saved.lineHeight);
  /** 尺寸：fixed 时所有卡片共享同一 px；auto 时宽=最长行全宽、高=内容全高 */
  let heightMode = $state(/** @type {'fixed' | 'auto'} */ (saved.heightMode));
  let boxWidth = $state(saved.boxWidth);
  let boxHeight = $state(saved.boxHeight);
  /** 固定模式（有滚动条）下，滚动一个框会把其它框按比例滚到同一位置 */
  let syncScroll = $state(saved.syncScroll);
  let query = $state(saved.query);
  let onlyAvailable = $state(saved.onlyAvailable);

  /** 系统字体族（queryLocalFonts，可缓存）与本次导入的字体文件（会话内有效）分开存 */
  const cachedSystemFonts = readStringList(LOCAL_FONTS_KEY);
  let systemFonts = $state(cachedSystemFonts);
  let fileFonts = $state([]);
  const localFonts = $derived([...systemFonts, ...fileFonts]);

  /** 勾选的字体：丢掉当前认不得的名字（文件导入的字体刷新后就没了，留着只会变成坏卡片） */
  const knownFamilies = new Set([...GENERICS, ...CANDIDATES, ...cachedSystemFonts]);
  let selected = $state(
    readStringList(SELECTED_KEY, [...DEFAULT_SELECTED]).filter((family) => knownFamilies.has(family)),
  );

  /** 唯一提示位：系统字体读取 / 字体文件导入 / 复制结果共用，带自动消失 */
  let note = $state(
    cachedSystemFonts.length
      ? `已恢复上次读到的 ${cachedSystemFonts.length} 个字体族（可点「读取系统字体列表」刷新）`
      : '',
  );
  let noteTimer = 0;
  function say(message, ttl = 0) {
    note = message;
    clearTimeout(noteTimer);
    if (ttl) noteTimer = setTimeout(() => (note = ''), ttl);
  }

  // 持久化：文本、勾选列表、其余设置（都防抖写，拖 resize 手柄不会每帧写盘）
  autoSave(
    () => text,
    (value) => (value === DEFAULT_TEXT ? removeKey(TEXT_KEY) : writeJson(TEXT_KEY, value)),
  );
  autoSave(() => selected, (value) => writeJson(SELECTED_KEY, value), 0);
  autoSave(
    () => ({
      fontSize,
      lineHeight,
      heightMode,
      boxWidth,
      boxHeight,
      syncScroll,
      query,
      onlyAvailable,
    }),
    (value) => writeJson(SETTINGS_KEY, value),
  );

  const fontList = $derived([...new Set([...GENERICS, ...CANDIDATES, ...localFonts])]);
  const detection = $derived(detectAll(fontList));
  const selectedSet = $derived(new Set(selected));

  const filtered = $derived(
    fontList.filter((family) => {
      if (query && !family.toLowerCase().includes(query.trim().toLowerCase())) return false;
      if (onlyAvailable && !detection[family]?.latin && !detection[family]?.cjk) return false;
      return true;
    }),
  );
  const visibleSet = $derived(new Set(filtered));

  const cards = $derived(
    selected.map((family) => ({ family, stack: cssStack(family, 'sans-serif') })),
  );

  const hasLocalFontApi = typeof window !== 'undefined' && 'queryLocalFonts' in window;

  /** 数字输入统一校验：只接受 > 0 的有限值，非法输入原地丢弃（state 不动） */
  function setNumber(raw, apply) {
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) apply(value);
  }

  /** 拖任一框右下角 resize 手柄 → 所有卡片同步到同一 px（由 sizeSync action 回报） */
  function onResize({ width, height }) {
    boxWidth = width;
    boxHeight = height;
  }

  function toggleFit() {
    heightMode = heightMode === 'auto' ? 'fixed' : 'auto';
  }

  /** 全选 / 反选 / 清空都只作用于当前筛选结果；按 fontList 顺序重排，卡片不会因勾选顺序乱跳 */
  function pick(predicate) {
    selected = fontList.filter(predicate);
  }
  const selectAllVisible = () => pick((f) => selectedSet.has(f) || visibleSet.has(f));
  const invertVisible = () => pick((f) => selectedSet.has(f) !== visibleSet.has(f));
  const clearSelection = () => (selected = []);

  function toggle(family) {
    selected = selectedSet.has(family)
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
      say('没选中字体', 2000);
      return;
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      copied = legacyCopy(value);
    }
    say(copied ? `已复制 ${selected.length} 个字体` : '复制失败（剪贴板不可用）', 2000);
  }

  async function loadLocalFonts() {
    if (!hasLocalFontApi) {
      say('这个浏览器没有 window.queryLocalFonts（Local Font Access API，仅 Chromium 系）');
      return;
    }
    try {
      const fonts = await window.queryLocalFonts();
      const families = [...new Set(fonts.map((font) => font.family))].sort((a, b) =>
        a.localeCompare(b, 'zh-Hans-CN'),
      );
      systemFonts = families;
      writeJson(LOCAL_FONTS_KEY, families);
      say(`读到 ${families.length} 个字体族（含样式 ${fonts.length} 条）`);
    } catch (error) {
      say(`读取失败：${error?.message ?? error}（需要用户授权，且必须 localhost / https）`);
    }
  }

  /** @type {HTMLInputElement | null} */
  let fileInput = $state(null);
  /** @type {HTMLInputElement | null} */
  let dirInput = $state(null);

  /** 「选文件」和「选文件夹」（webkitdirectory）共用一个处理函数 */
  async function onFilesPicked(event) {
    const input = event.currentTarget;
    // 先拷贝：FileList 是活对象，input.value = '' 会把它清空
    const files = [...(input.files ?? [])];
    input.value = ''; // 同一个文件再选一次也要能触发 change

    if (!files.length) return;
    if (!files.some((file) => FONT_FILE_RE.test(file.name))) {
      say('没找到字体文件（支持 .ttf / .otf / .ttc / .woff / .woff2）');
      return;
    }

    const result = await importFontFiles(files);
    if (result.families.length) {
      fileFonts = [...new Set([...fileFonts, ...result.families])];
      selected = [...selected, ...result.families.filter((family) => !selectedSet.has(family))];
    }

    const parts = [
      result.families.length ? `导入 ${result.families.length} 个字体族` : '没有导入成功的字体',
    ];
    if (result.truncated) parts.push(`只读了前 ${MAX_IMPORT_FILES} 个文件（共 ${result.total} 个）`);
    if (result.skipped) parts.push(`跳过 ${result.skipped} 个超过 ${MAX_FONT_BYTES / 1024 / 1024}MB 的文件`);
    if (result.failed.length) {
      const names = result.failed.slice(0, 3).join('、');
      parts.push(`失败 ${result.failed.length} 个（${names}${result.failed.length > 3 ? '…' : ''}）`);
    }
    parts.push('文件字体只在本次会话有效');
    say(parts.join('；'));
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
    {#snippet numberField(label, value, unit, opts)}
      <label>
        {label}
        <input
          type="range"
          min={opts.min}
          max={opts.max}
          step={opts.step}
          value={value}
          oninput={(event) => setNumber(event.currentTarget.value, opts.apply)}
        />
        <input
          class="num"
          type="number"
          min={opts.min}
          max={opts.numMax ?? opts.max}
          step={opts.step}
          value={value}
          oninput={(event) => setNumber(event.currentTarget.value, opts.apply)}
        />{unit}
      </label>
    {/snippet}

    {@render numberField('字号', fontSize, 'px', {
      min: 0.5,
      max: 128,
      step: 0.5,
      apply: (value) => (fontSize = value),
    })}
    {@render numberField('行高', lineHeight, '', {
      min: 0.5,
      max: 2.5,
      numMax: 3,
      step: 0.25,
      apply: (value) => (lineHeight = value),
    })}
    <span class="field">
      尺寸
      <button
        title="点击在「固定尺寸（共享同一 px，可拖右下角同步改）」与「自适应内容（最长行全宽 × 内容全高）」之间切换"
        onclick={toggleFit}
      >
        {heightMode === 'auto'
          ? '自动（最长行宽 × 内容全高）'
          : `固定 ${Math.round(boxWidth)}×${Math.round(boxHeight)}px`}
      </button>
    </span>
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
  {#if note}
    <p class="note">{note}</p>
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
      <span class="mono">{selected.length} 个已选中 / 共 {filtered.length} 个</span>
    </div>
    <ul class="chips">
      {#each filtered as family (family)}
        {@const d = detection[family]}
        {@const on = selectedSet.has(family)}
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
          style="font-family: {card.stack}; font-size: {fontSize}px; line-height: {lineHeight}{
            heightMode === 'fixed' ? `; width: ${boxWidth}px; height: ${boxHeight}px` : ''
          }"
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

  .controls label,
  .controls .field {
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
