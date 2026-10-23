/**
 * localStorage 小工具：读时校验、写时防抖、storage 不可用（隐私模式 / 无权限）时静默退化。
 *
 * 这里只管机制，具体 key 与默认值留在调用方（App.svelte）。
 * `autoSave` 用了 `$effect`，所以本文件是 `.svelte.js`。
 */

/** 读字符串 */
export function readString(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * 读纯文本。兼容两种存量格式：按 JSON 字符串写入的（当前写法）和早期直接写原始字符串的。
 * 注意别用 `readString` 读 `writeJson` 写的东西 —— 那样拿到的是带引号和 `\n` 转义的源码。
 */
export function readText(key, fallback) {
  const raw = readString(key, null);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : raw;
  } catch {
    return raw;
  }
}

/** 读 JSON；缺失 / 坏数据 / 无权限都返回 fallback */
export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 写不进去就算了，不影响使用
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 同上
  }
}

/** 读一个去重后的字符串数组（卡片以 font-family 作 key，重复项会让 {#each} 报错） */
export function readStringList(key, fallback = []) {
  const parsed = readJson(key, null);
  if (!Array.isArray(parsed)) return fallback;
  return [...new Set(parsed.filter((item) => typeof item === 'string'))];
}

/** 各类型的校验规则 */
const VALIDATORS = {
  number: (value, rule) => Number.isFinite(value) && value > (rule.gt ?? -Infinity),
  boolean: (value) => typeof value === 'boolean',
  string: (value) => typeof value === 'string',
  enum: (value, rule) => rule.values.includes(value),
};

/**
 * 按 schema 读一个对象，逐项校验，坏值退回默认。
 *
 * schema 形如：
 *   { fontSize: { type: 'number', gt: 0, default: 16 },
 *     heightMode: { type: 'enum', values: ['fixed', 'auto'], default: 'fixed' } }
 *
 * @param {string} key
 * @param {Record<string, { type: 'number' | 'string' | 'boolean' | 'enum', gt?: number, values?: string[], default: any }>} schema
 */
export function readSettings(key, schema) {
  const stored = readJson(key, null);
  const source = stored && typeof stored === 'object' ? stored : {};
  const out = {};
  for (const [name, rule] of Object.entries(schema)) {
    const value = source[name];
    out[name] = VALIDATORS[rule.type](value, rule) ? value : rule.default;
  }
  return out;
}

/**
 * 把 `getValue()` 读到的状态防抖写进 localStorage。只能在组件初始化时调用。
 * @param {() => any} getValue
 * @param {(value: any) => void} save
 * @param {number} delay 毫秒；0 表示尽快（仍然异步）
 */
export function autoSave(getValue, save, delay = 200) {
  $effect(() => {
    const value = getValue();
    const timer = setTimeout(() => save(value), delay);
    return () => clearTimeout(timer);
  });
}
