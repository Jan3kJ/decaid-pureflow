import type { Page } from '@playwright/test';

// A surface as the browser computes it: the glass is a gradient (background-image), anything else
// a colour.

/** A background token such as 'var(--panel)', as an element with it would compute. */
export const paint = (page: Page, value: string) =>
  page.evaluate((value) => {
    const probe = document.createElement('i');
    probe.style.background = value;
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const computed = style.backgroundImage === 'none' ? style.backgroundColor : style.backgroundImage;
    probe.remove();
    return computed;
  }, value);
