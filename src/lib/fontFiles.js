/**
 * 把用户选的本地字体文件注册进文档：读文件 → 解析族名 → FontFace。
 *
 * 只用标准 API（File / FontFace / document.fonts），Chrome、Firefox 都支持，
 * 所以「选文件」（multiple）和「选文件夹」（webkitdirectory）共用这一条路径，
 * 不需要 Chrome 专有的 showDirectoryPicker。
 */

/** 认得的字体文件扩展名 */
export const FONT_FILE_RE = /\.(ttf|otf|ttc|otc|woff2?)$/i;
/** 一次最多读多少个文件（CJK 字体动辄十几 MB，别一口气吃爆内存） */
export const MAX_IMPORT_FILES = 40;
/** 单个字体文件大小上限 */
export const MAX_FONT_BYTES = 128 * 1024 * 1024;

/**
 * 从字体文件里读 family 名（仅 sfnt / TTC，即 .ttf / .otf / .ttc / .otc）。
 * .woff / .woff2 是压缩容器，解析不动，调用方用文件名兑底。
 * @param {ArrayBuffer} buffer
 * @returns {string | null}
 */
/** 字体文件里 name 表的两种字符串编码 */
const UTF16BE = new TextDecoder('utf-16be');
const MAC_ROMAN = new TextDecoder('macintosh');

/** 按编码解码一段字节（`ignoreBOM` 用默认值即可） */
function decode(decoder, buffer, offset, length) {
  try {
    return decoder.decode(new Uint8Array(buffer, offset, length));
  } catch {
    return '';
  }
}

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
      value = decode(UTF16BE, buffer, offset, length);
    } else if (platform === 1) {
      // Macintosh Roman
      value = decode(MAC_ROMAN, buffer, offset, length);
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

/**
 * 批量导入字体文件。族名取 name 表里的（woff/woff2 解析不出，退回文件名）。
 *
 * @param {FileList | File[]} fileList
 * @returns {Promise<{
 *   families: string[],
 *   failed: string[],
 *   skipped: number,
 *   total: number,
 *   truncated: number,
 * }>}
 */
export async function importFontFiles(fileList) {
  const all = [...fileList].filter((file) => FONT_FILE_RE.test(file.name));
  const batch = all.slice(0, MAX_IMPORT_FILES);
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

  return {
    families: [...new Set(families)],
    failed,
    skipped,
    total: all.length,
    truncated: all.length - batch.length,
  };
}
