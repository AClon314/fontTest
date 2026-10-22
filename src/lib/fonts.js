/**
 * 字体可用性检测（纯浏览器侧，无网络、无额外字体下载）。
 *
 * 原理：canvas.measureText 对 "Family, <基线>" 与该基线自身测宽。
 * 字体不存在时会整段回落到基线字体，全部度量必然与基线相同；存在时（几乎）必然不同。
 * 对三条基线（monospace / serif / sans-serif）分别测，任一不同即判定「存在」。
 *
 * 这套度量是消融实验留下的最小可用集合：
 * - 去掉 fontBoundingBox{Ascent,Descent} 后 CJK 样本几乎全部漏检；
 * - 只比 width 时 CJK 全宽字形也全部漏检（见下）；
 * - 只留 sans-serif 一条基线时 Arial / Helvetica 这类「与基线同族」的字体漏检。
 * 所以 3 基线 × 2 样本 × 5 度量都别删。
 *
 * 另外用 document.fonts.check() 做一个交叉参考（它只反映 FontFaceSet 里能命中的字体，
 * 对系统字体结果不一定准，所以只作为附加信息展示，不参与判定）。
 */

const LATIN_SAMPLE = 'mmmmmmmmmmlliWWW@0O1Il意';
const CJK_SAMPLE = '中文字体测试国国国體繁體';

const BASELINES = ['monospace', 'serif', 'sans-serif'];

/** @type {CanvasRenderingContext2D | null} */
let ctx = null;

function getCtx() {
  if (!ctx) {
    const canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
  }
  return ctx;
}

/** 通用族是 CSS 关键字，不能加引号；其余一律加引号（JSON 字符串即合法的 CSS 字串，顺带转义） */
export function quoteFamily(family) {
  const name = family.trim();
  if (!name) return '';
  return GENERIC_ALIASES.has(name) ? name : JSON.stringify(name);
}

/** 组装 CSS font-family 栈，例如 `"Sarasa Mono SC", monospace` */
export function cssStack(family, fallback = 'monospace') {
  const quoted = quoteFamily(family);
  return quoted && quoted !== fallback ? `${quoted}, ${fallback}` : fallback;
}

function metricsOf(text, fontSpec) {
  const c = getCtx();
  if (!c) return [0, 0, 0, 0, 0];
  c.font = fontSpec;
  const m = c.measureText(text);
  return [
    m.width,
    m.actualBoundingBoxAscent,
    m.actualBoundingBoxDescent,
    m.fontBoundingBoxAscent,
    m.fontBoundingBoxDescent,
  ];
}

function differs(a, b) {
  return a.some((v, i) => Math.abs(v - b[i]) > 0.05);
}

function existsForSample(family, sample) {
  return BASELINES.some((b) => {
    const base = metricsOf(sample, `72px ${b}`);
    const withFamily = metricsOf(sample, `72px ${cssStack(family, b)}`);
    return differs(base, withFamily);
  });
}

/**
 * @param {string} family
 * @returns {{ family: string, latin: boolean, cjk: boolean, fontsCheck: boolean }}
 */
export function detectFamily(family) {
  const name = family.trim();
  const isGeneric = GENERIC_ALIASES.has(name);
  const latin = isGeneric || existsForSample(name, LATIN_SAMPLE);
  const cjk = isGeneric || existsForSample(name, CJK_SAMPLE);
  let fontsCheck = false;
  try {
    fontsCheck = document.fonts?.check?.(`16px ${quoteFamily(name)}`) ?? false;
  } catch {
    // 非法字体名会让 check() 抛错，当成「不认识」处理
    fontsCheck = false;
  }
  return { family: name, latin, cjk, fontsCheck };
}

/** @param {string[]} families */
export function detectAll(families) {
  /** @type {Record<string, { latin: boolean, cjk: boolean, fontsCheck: boolean }>} */
  const out = {};
  for (const family of families) {
    const r = detectFamily(family);
    out[family] = { latin: r.latin, cjk: r.cjk, fontsCheck: r.fontsCheck };
  }
  return out;
}

/** 导出成 CSS font-family 值列表：逗号分隔，名字里带空格（或引号）的用双引号包裹 */
export function cssList(families) {
  return families
    .map((family) => (/[\s"]/.test(family) ? `"${family.replaceAll('"', '\\"')}"` : family))
    .join(', ');
}

/**
 * 从字体文件里读 family 名（仅 sfnt / TTC，即 .ttf / .otf / .ttc / .otc）。
 * .woff / .woff2 是压缩容器，解析不动，调用方用文件名兑底。
 * @param {ArrayBuffer} buffer
 * @returns {string | null}
 */
export function readFontFamily(buffer) {
  if (buffer.byteLength < 16) return null;
  const view = new DataView(buffer);
  const SFNT = 0x00010000;
  const OTTO = 0x4f54544f;
  const TRUE_TYPE = 0x74727565;
  const TTCF = 0x74746366;

  let base = 0;
  if (view.getUint32(0) === TTCF) {
    // 字体集合：取第一个 face
    base = view.getUint32(12);
    if (base + 12 > view.byteLength) return null;
  } else {
    const tag = view.getUint32(0);
    if (tag !== SFNT && tag !== OTTO && tag !== TRUE_TYPE) return null;
  }

  const numTables = view.getUint16(base + 4);
  let nameTable = 0;
  for (let i = 0; i < numTables; i += 1) {
    const record = base + 12 + i * 16;
    if (record + 16 > view.byteLength) return null;
    if (view.getUint32(record) === 0x6e616d65 /* 'name' */) {
      nameTable = view.getUint32(record + 8);
      break;
    }
  }
  if (!nameTable || nameTable + 6 > view.byteLength) return null;

  const count = view.getUint16(nameTable + 2);
  const storage = nameTable + view.getUint16(nameTable + 4);
  /** @type {{ score: number, value: string } | null} */
  let best = null;

  for (let i = 0; i < count; i += 1) {
    const record = nameTable + 6 + i * 12;
    if (record + 12 > view.byteLength) break;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    const languageId = view.getUint16(record + 4);
    const nameId = view.getUint16(record + 6);
    const length = view.getUint16(record + 8);
    const offset = storage + view.getUint16(record + 10);
    if ((nameId !== 1 && nameId !== 16) || offset + length > view.byteLength) continue;

    let value = '';
    if (platform === 0 || platform === 3) {
      // Unicode / Windows：UTF-16BE
      for (let j = 0; j + 1 < length; j += 2) {
        value += String.fromCharCode((view.getUint8(offset + j) << 8) | view.getUint8(offset + j + 1));
      }
    } else if (platform === 1) {
      // Macintosh Roman
      for (let j = 0; j < length; j += 1) value += String.fromCharCode(view.getUint8(offset + j));
    } else {
      continue;
    }

    value = value.replace(/\0/g, '').trim();
    if (!value) continue;
    // 英文名优先（CSS 与系统匹配都靠它），typographic family 优先于 legacy family（不带 Bold 后缀）：
    // 中文/韩文等本地化名字排在后面，否则同一字体在 canvas 里和系统名对不上。
    const score =
      (languageId === 0x0409 ? 4 : 0) +
      (platform === 3 && encoding === 1 ? 2 : 0) +
      (nameId === 16 ? 2 : 0) +
      (platform === 0 ? 1 : 0);
    if (!best || score > best.score) best = { score, value };
  }

  return best?.value ?? null;
}

/** 通用族：浏览器保证能解析，但具体映射到哪个字体由浏览器/系统决定 */
export const GENERICS = [
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
];

const GENERIC_ALIASES = new Set(GENERICS);

/** 拿来当候选的常见字体名（本机有的才会亮） */
export const CANDIDATES = [
  // CJK 黑/宋
  'Noto Sans CJK SC',
  'Noto Serif CJK SC',
  'Noto Sans SC',
  'Noto Serif SC',
  'Source Han Sans SC',
  'Source Han Serif SC',
  'Sarasa Gothic SC',
  'Sarasa Mono SC',
  'Sarasa UI SC',
  'Sarasa Term SC',
  'Sarasa Fixed SC',
  '得意黑',
  'Smiley Sans',
  'WenQuanYi Micro Hei',
  'WenQuanYi Zen Hei',
  'Droid Sans Fallback',
  'Microsoft YaHei',
  'SimSun',
  'SimHei',
  'PingFang SC',
  'Hiragino Sans GB',
  'Songti SC',
  // 西文 sans
  'Inter',
  'Roboto',
  'Open Sans',
  'Source Sans 3',
  'Fira Sans',
  'DejaVu Sans',
  'Liberation Sans',
  'Cantarell',
  'Ubuntu',
  'Adwaita Sans',
  'IBM Plex Sans',
  'Noto Sans',
  'Noto Serif',
  'Segoe UI',
  'Calibri',
  'Arial',
  'Helvetica',
  'Verdana',
  'Tahoma',
  // 等宽
  'Noto Sans Mono',
  'Noto Sans Mono CJK SC',
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'IBM Plex Mono',
  'Cascadia Code',
  'DejaVu Sans Mono',
  'Liberation Mono',
  'Ubuntu Mono',
  'Adwaita Mono',
  'Consolas',
  'Menlo',
  'Monaco',
  'Courier New',
];

export const DEFAULT_SELECTED = [
  'system-ui',
  'sans-serif',
  'monospace',
  'Noto Sans CJK SC',
  'Sarasa Mono SC',
  'Sarasa Gothic SC',
  'serif',
];
