import { toPng } from "html-to-image";

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

/**
 * Renders an element as it is seen on screen, or as one continuous page.
 *
 * Portal pages are built from nested fixed-height flex containers. Expanding
 * only the outer element leaves the inner scroll panel clipped, so full-page
 * captures temporarily expand that panel and its ancestors before rendering.
 */
export async function capturePage(target: HTMLElement, fullPage: boolean) {
  const options = {
    quality: 1,
    pixelRatio: window.devicePixelRatio || 1,
    filter: (node: Node) => !(node instanceof HTMLElement && node.tagName === "IFRAME"),
  };

  if (!fullPage) {
    return toPng(target, { ...options, width: target.clientWidth, height: target.clientHeight });
  }

  const saved = new Map<HTMLElement, string>();
  const save = (element: HTMLElement) => {
    if (!saved.has(element)) saved.set(element, element.style.cssText);
  };
  const expand = (element: HTMLElement) => {
    save(element);
    element.style.setProperty("height", "auto", "important");
    element.style.setProperty("max-height", "none", "important");
    element.style.setProperty("min-height", "0", "important");
    element.style.setProperty("overflow-y", "visible", "important");
    element.style.setProperty("flex", "none", "important");
  };

  try {
    const clippedPanels = [...target.querySelectorAll<HTMLElement>("*")].filter(element => {
      const style = getComputedStyle(element);
      return element.scrollHeight > element.clientHeight + 1 &&
        ["auto", "scroll", "hidden", "clip"].includes(style.overflowY);
    });

    expand(target);
    for (const panel of clippedPanels) {
      for (let element: HTMLElement | null = panel; element && element !== target.parentElement; element = element.parentElement) {
        expand(element);
      }
    }

    // Let the expanded flex layout reflow before html-to-image clones it.
    await nextFrame();
    await nextFrame();
    return await toPng(target, { ...options, width: target.clientWidth, height: target.scrollHeight });
  } finally {
    [...saved.entries()].reverse().forEach(([element, cssText]) => {
      element.style.cssText = cssText;
    });
  }
}
