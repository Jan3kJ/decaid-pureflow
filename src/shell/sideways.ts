// A row that scrolls sideways is the browser's pan along only while it overflows: `data-sideways`
// is set then, and the row's CSS gives `touch-action: pan-x pan-y` for it. A row that fits keeps
// the page's `pan-y` (app.css), so a move along it is the swipe back, which a
// pan along would cancel even with nothing to scroll.

/** Whether `node` is wider inside than its box: the rule of `onControl` (swipe.ts). */
export function overflowsAlong(node: { scrollWidth: number; clientWidth: number }): boolean {
  return node.scrollWidth > node.clientWidth;
}

/** The Svelte action: keeps `data-sideways` on `node` while it overflows, as it and its children change size. */
export function sideways(node: HTMLElement) {
  const mark = () => node.toggleAttribute('data-sideways', overflowsAlong(node));
  const resized = new ResizeObserver(mark);
  const observe = () => {
    resized.disconnect();
    resized.observe(node);
    for (const child of node.children) resized.observe(child);
  };
  const changed = new MutationObserver(() => {
    observe();
    mark();
  });
  changed.observe(node, { childList: true });
  observe();
  mark();
  return {
    destroy() {
      resized.disconnect();
      changed.disconnect();
    },
  };
}
