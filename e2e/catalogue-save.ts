import type { Page, Response } from '@playwright/test';

/**
 * The answer to a catalogue entry's save, its PUT to `path` (research.md 29.6). The form's save
 * button is disabled from the tap on, while the write is still on its way, so a check that only
 * waits for a disabled button may read the entry before the write landed: it waits for this.
 * Start it before the tap.
 */
export function saveAnswered(page: Page, path: string): Promise<Response> {
  return page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname === path);
}

/**
 * Holds the gateway's answer to PUTs on `path` back by `ms`, as a busy gateway does, so a check
 * that reads too early fails every time rather than now and then.
 */
export async function slowSave(page: Page, path: string, ms = 500): Promise<void> {
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      if (route.request().method() === 'PUT') await new Promise((done) => setTimeout(done, ms));
      await route.fallback();
    },
  );
}
