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
