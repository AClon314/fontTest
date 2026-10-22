/**
 * textarea 尺寸同步 action。
 *
 * 尺寸本身基本不归 JS 管：
 * - `auto` 模式：CSS 的 `field-sizing: content` 让浏览器按内容定宽（= 最长行）定高（= 内容全高），
 *   `max-width` 负责最长行装不下时回到换行。这里一行测量代码都不用写。
 * - `fixed` 模式：把 opts.width / opts.height 写到每个 textarea 上（所有卡片共享同一 px）。
 *   `max-width` 同样夹住拖宽的上限，所以 JS 不用算「可用宽度」。
 *
 * JS 只剩一件事：用户在 fixed 模式拖原生 resize 手柄时，ResizeObserver 量到的尺寸和 state 对不上，
 * 就把新尺寸回报给组件回写 state —— 其余卡片跟着一起变。
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

  function render() {
    const fixed = current.mode === 'fixed';
    node.style.width = fixed ? `${current.width}px` : '';
    node.style.height = fixed ? `${current.height}px` : '';
  }

  const observer = new ResizeObserver(() => {
    if (current.mode !== 'fixed') return;
    const rect = node.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    // 自己写进去的尺寸只会因取整差 <1px；只有用户拖手柄才明显不同。
    // （state 超出 max-width 时这里也会回报被夹住后的真实尺寸，state 随之收敛。）
    if (Math.abs(width - current.width) <= 1 && Math.abs(height - current.height) <= 1) return;
    current.onResize({ width, height });
  });

  observer.observe(node);
  render();

  return {
    update(next) {
      current = next;
      render();
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
