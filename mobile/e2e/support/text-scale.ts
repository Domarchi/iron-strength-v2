import type { Page } from "@playwright/test";

/** Browser text-only enlargement; not a substitute for iOS Dynamic Type. */
export async function enlargeText(page: Page, factor = 2) {
  await page.evaluate((factor) => {
    const nodes = [...document.querySelectorAll<HTMLElement>('[dir="auto"],input,textarea')].filter(
      (el) => !el.dataset.textScaleApplied,
    );
    const sizes = nodes.map((el) => ({
      el,
      size: parseFloat(getComputedStyle(el).fontSize),
      line: parseFloat(getComputedStyle(el).lineHeight),
    }));
    for (const { el, size, line } of sizes) {
      el.dataset.textScaleApplied = String(factor);
      el.dataset.originalFontSize = el.style.getPropertyValue("font-size");
      el.dataset.originalFontPriority = el.style.getPropertyPriority("font-size");
      el.dataset.originalLineHeight = el.style.getPropertyValue("line-height");
      el.dataset.originalLinePriority = el.style.getPropertyPriority("line-height");
      el.style.setProperty("font-size", `${size * factor}px`, "important");
      if (Number.isFinite(line))
        el.style.setProperty("line-height", `${line * factor}px`, "important");
    }
  }, factor);
}
export async function horizontalClipping(page: Page) {
  return page.evaluate(() => {
    const viewport = innerWidth;
    return [
      ...document.querySelectorAll<HTMLElement>(
        '[dir="auto"],input,textarea,[role="button"],[role="checkbox"]',
      ),
    ].flatMap((el) => {
      if (el.closest('[aria-hidden="true"]') || !el.getClientRects().length) return [];
      let parent = el.parentElement,
        horizontal = false;
      while (parent) {
        const s = getComputedStyle(parent);
        if (s.overflowX === "auto" || s.overflowX === "scroll") {
          horizontal = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (horizontal) return [];
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height || getComputedStyle(el).visibility === "hidden") return [];
      const overflow =
        rect.right > viewport + 1 ||
        rect.left < -1 ||
        (el.matches('[dir="auto"]') &&
          !el.matches("input,textarea") &&
          el.scrollWidth > el.clientWidth + 2);
      return overflow
        ? [
            {
              label: el.getAttribute("aria-label") ?? el.textContent?.slice(0, 70),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: el.clientWidth,
              content: el.scrollWidth,
            },
          ]
        : [];
    });
  });
}

export async function restoreText(page: Page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>("[data-text-scale-applied]")) {
      for (const [property, value, priority] of [
        ["font-size", el.dataset.originalFontSize, el.dataset.originalFontPriority],
        ["line-height", el.dataset.originalLineHeight, el.dataset.originalLinePriority],
      ]) {
        if (value) el.style.setProperty(property!, value, priority);
        else el.style.removeProperty(property!);
      }
      delete el.dataset.textScaleApplied;
    }
  });
}
