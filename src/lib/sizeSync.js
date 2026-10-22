/**
 * textarea 尺寸同步 action。
 *
 * 尺寸本身不归 JS 管：
 * - `fixed` 模式：宽高由模板的 `style` 属性按 state 写成 px（所有卡片共享同一值）。
 * - `auto` 模式：CSS 的 `field-sizing: content` 按内容定宽高，`max-width` 负责装不下时换行。
 *
 * 所以这里只做一件事：用户在 fixed 模式拖原生 resize 手柄时，把新尺寸回报给组件回写 state。
 * 注意不要在这里写 inline style —— 模板的 style 属性一更新就会把它们抹掉
 * （旧实现因此会在改字号时把框塌成浏览器默认尺寸）。
 */

/**
 * @param {HTMLTextAreaElement} node
 * @param {{
 *   mode: 'fixed' | 'auto',
 *   width: number,
 *   height: number,
 *   onResize: (size: { width: number, height: number }) => void,
 * }} opts
 */
export function sizeSync(node, opts) {
  let current = opts;

  const observer = new ResizeObserver(() => {
    if (current.mode !== 'fixed') return;
    // 尺寸和 state 一致 → 这次变化是模板按 state 写的，不是用户拖的
    if (node.style.width === `${current.width}px` && node.style.height === `${current.height}px`) {
      return;
    }
    const rect = node.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    // 取整误差 / 被 max-width 夹住后的收敛过程不回报
    if (Math.abs(width - current.width) <= 1 && Math.abs(height - current.height) <= 1) return;
    current.onResize({ width, height });
  });

  observer.observe(node);

  return {
    update(next) {
      current = next;
    },
    destroy() {
      observer.disconnect();
    },
  };
}

/** 打开「同步滚动」时注册的所有 textarea（按比例对齐，因为各字体换行不同 → 内容高度不同） */
const peers = new Set();

/**
 * 同步滚动 action：只对有滚动条的固定尺寸框生效（auto 模式永远不会出滚动条）。
 * @param {HTMLTextAreaElement} node
 * @param {{ enabled: boolean }} opts
 */
export function scrollSync(node, opts) {
  let current = opts;

  function onScroll() {
    if (!current.enabled) return;
    const max = node.scrollHeight - node.clientHeight;
    if (max <= 0) return;
    const ratio = node.scrollTop / max;
    for (const peer of peers) {
      if (peer === node) continue;
      const peerMax = peer.scrollHeight - peer.clientHeight;
      if (peerMax <= 0) continue;
      const want = ratio * peerMax;
      // 目标相同就跳过：程序化设置 scrollTop 会再触发 scroll 事件，靠这一点天然止回环
      if (Math.abs(peer.scrollTop - want) > 0.5) peer.scrollTop = want;
    }
  }

  peers.add(node);
  node.addEventListener('scroll', onScroll, { passive: true });

  return {
    update(next) {
      current = next;
    },
    destroy() {
      peers.delete(node);
      node.removeEventListener('scroll', onScroll);
    },
  };
}
