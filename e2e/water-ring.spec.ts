import { expect, test, type Page } from '@playwright/test';
import { mockGateway, profile } from './mock-gateway';
import { toPage } from './touch';

// The small countdown ring on every screen (W2, spec 3.10, acceptance 58): while hot water or
// flush runs, every screen without the large ring (home's, the hot water page's while hot water
// pours) shows one small ring at the bottom of the left column with the time; it overlaps no
// other button, a tap on it sends the stop, and it goes when the run ends. The workflow's
// targets are the mock's: hot water 30 s, flush 10 s.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

/**
 * The buttons and fields the small ring's box overlaps, by test id or text; the full-screen
 * closers behind a dialog or the history (a tap anywhere outside) and what the history covers
 * (nothing a finger reaches at its centre) are not counted.
 */
function overlapped(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const ring = document.querySelector('[data-testid="small-ring"]')!;
    const box = ring.getBoundingClientRect();
    const half = (innerWidth * innerHeight) / 2;
    return [...document.querySelectorAll('button, input, select, textarea, a, [role="slider"]')]
      .filter((element) => element !== ring && !ring.contains(element) && !element.closest('[inert]'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || rect.width * rect.height > half) return false;
        const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (top !== null && top !== ring && !ring.contains(top) && !element.contains(top)) return false;
        return rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top;
      })
      .map((element) => element.getAttribute('data-testid') ?? element.textContent?.trim() ?? element.tagName);
  });
}

/** The small ring is in the left column, under the back arrow, inside the viewport. */
async function expectInColumn(page: Page) {
  const place = await page.evaluate(() => {
    const ring = document.querySelector('[data-testid="small-ring"]')!.getBoundingClientRect();
    const back = [...document.querySelectorAll('[data-testid="nav-home"]')]
      .find((element) => !element.closest('[inert]'))
      ?.getBoundingClientRect();
    return {
      inColumn: ring.left >= 0 && ring.right <= 4 * parseFloat(getComputedStyle(document.documentElement).fontSize) + 0.5,
      underBack: back === undefined || ring.top >= back.bottom,
      inside: ring.bottom <= innerHeight && ring.width > 40,
    };
  });
  expect(place).toEqual({ inColumn: true, underBack: true, inside: true });
}

async function expectSmallRing(page: Page, kind: 'flush' | 'hotWater', time: string) {
  const ring = page.getByTestId('small-ring');
  await expect(ring).toHaveCount(1);
  await expect(ring).toHaveAttribute('data-kind', kind);
  await expect(ring).toHaveAccessibleName(kind === 'flush' ? 'stop flush' : 'stop hot water');
  await expect(page.getByTestId('small-ring-time')).toHaveText(time);
  await expectInColumn(page);
  expect(await overlapped(page)).toEqual([]);
}

async function fromMenu(page: Page, entry: string) {
  await page.getByTestId('nav-home').click();
  await page.getByTestId('menu').click();
  await page.getByTestId(entry).click();
}

test('flush: the small ring on steam, settings, beans, the hot water page and the history; its tap stops', async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('dark');
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('small-ring')).toHaveCount(0);

  gateway.waterFor('flush', 6, 6, 90);
  // Home keeps its large ring and has no small one.
  await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', 'flush');
  await expect(page.getByTestId('small-ring')).toHaveCount(0);

  // The history covers home's ring: the small one stands in.
  await page.getByTestId('history-handle').click();
  await expect(page.getByTestId('history')).toBeVisible();
  await expectSmallRing(page, 'flush', '6 / 10 s');
  await page.getByTestId('history-outside').click({ position: { x: 900, y: 100 } });
  await expect(page.getByTestId('small-ring')).toHaveCount(0);

  await toPage(page, 'steam');
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  await expectSmallRing(page, 'flush', '6 / 10 s');
  await expect(page.getByTestId('small-ring')).toHaveAttribute('data-share', '0.600');
  await page.screenshot({ path: 'docs/product/small-ring-steam.png' });

  await fromMenu(page, 'open-settings');
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await expectSmallRing(page, 'flush', '6 / 10 s');

  await fromMenu(page, 'open-beans');
  await expect(page.getByTestId('screen-beans')).toBeVisible();
  await expectSmallRing(page, 'flush', '6 / 10 s');

  // The hot water page draws only hot water large: a flush is the small ring there.
  await page.getByTestId('nav-home').click();
  await toPage(page, 'hot-water');
  await expect(page.getByTestId('screen-hot-water')).toBeVisible();
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  await expectSmallRing(page, 'flush', '6 / 10 s');

  // It counts on, and stays full past the target.
  gateway.waterFlow(0, 1);
  await expect(page.getByTestId('small-ring-time')).toHaveText('7 / 10 s');
  await expect(page.getByTestId('small-ring')).toHaveAttribute('data-share', '0.700');
  gateway.waterFlow(0, 5);
  await expect(page.getByTestId('small-ring-time')).toHaveText('12 / 10 s');
  await expect(page.getByTestId('small-ring')).toHaveAttribute('data-share', '1.000');

  const before = gateway.calls('PUT', '/api/v1/machine/state/idle').length;
  await page.getByTestId('small-ring').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/idle').length).toBe(before + 1);
  await expect(page.getByTestId('screen-hot-water')).toBeVisible();
  gateway.waterEnded();
  await expect(page.getByTestId('small-ring')).toHaveCount(0);
  expect(errors).toEqual([]);
});

// The profile and bean buttons are home's right column, which the large ring replaces while
// water runs (spec 3.11): the picker and the editor are opened before the run starts.
test('flush: the small ring in the picker and the A-Flow editor', async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('dark');
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  await page.getByTestId('open-profiles').click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  gateway.waterFor('flush', 6, 6, 90);
  await expectSmallRing(page, 'flush', '6 / 10 s');
  gateway.waterEnded();
  await expect(page.getByTestId('small-ring')).toHaveCount(0);

  await page.getByTestId('nav-home').click();
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  await expect(page.getByTestId('graph')).toBeVisible();
  gateway.waterFor('flush', 6, 6, 90);
  await expectSmallRing(page, 'flush', '6 / 10 s');
  gateway.waterEnded();
  await expect(page.getByTestId('small-ring')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('hot water: large on its page, small in the step editor and on steam, gone when it ends', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.workflow.profile = profile('Steps', 36, 3);
  gateway.connectScale(false);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  // The editor is opened from home's column before the hot water starts (spec 3.11).
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('step-cards')).toBeVisible();
  gateway.waterFor('hotWater', 3, 8, 40);
  await expectSmallRing(page, 'hotWater', '3 / 30 s');
  await expect(page.getByTestId('small-ring')).toHaveAttribute('data-share', '0.100');
  await page.screenshot({ path: 'docs/product/small-ring-step-editor.png' });

  await page.getByTestId('nav-home').click();
  await toPage(page, 'hot-water');
  await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', 'hotWater');
  await expect(page.getByTestId('small-ring')).toHaveCount(0);

  await page.getByTestId('nav-home').click();
  await toPage(page, 'steam');
  await expectSmallRing(page, 'hotWater', '3 / 30 s');

  // Hot water ends by itself (at its volume): the ring goes without a tap.
  gateway.waterEnded();
  await expect(page.getByTestId('small-ring')).toHaveCount(0);
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  expect(errors).toEqual([]);
});

// Every screen times both kinds (spec 3.12, acceptance 78): the run starts at the machine with the
// screen already open, a ring shows, large where spec 3.6 puts it (home, the hot water page for
// hot water) and small elsewhere, a tap on it sends the stop, and it goes when the run ends.
const MATRIX = ['home', 'steam', 'hot-water', 'profiles', 'editor-aflow', 'editor-steps', 'settings', 'beans', 'history'] as const;

for (const kind of ['hotWater', 'flush'] as const) {
  for (const where of MATRIX) {
    test(`rings everywhere: ${kind === 'flush' ? 'flush' : 'hot water'} on ${where}`, async ({ page }) => {
      const gateway = (await mockGateway(page)).withDefaults('dark');
      if (where === 'editor-steps') gateway.workflow.profile = profile('Steps', 36, 3);
      const screen = where.startsWith('editor') ? 'editor' : where === 'history' ? 'home' : where;
      await page.addInitScript((stored) => localStorage.setItem('pureflow.screen', stored), screen);
      await page.goto('/');
      await expect(page.getByTestId(`screen-${screen}`)).toBeVisible();
      if (where === 'editor-aflow') await expect(page.getByTestId('graph')).toBeVisible();
      if (where === 'editor-steps') await expect(page.getByTestId('step-cards')).toBeVisible();
      if (where === 'history') {
        await page.getByTestId('history-handle').click();
        await expect(page.getByTestId('history')).toBeVisible();
      }

      gateway.waterFor(kind, 4, kind === 'flush' ? 6 : 8, 80);
      const large = where === 'home' || (where === 'hot-water' && kind === 'hotWater');
      if (large) {
        await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', kind);
        await expect(page.getByTestId('water-time')).toHaveText(kind === 'flush' ? '4 / 10 s' : '4 / 30 s');
        await expect(page.getByTestId('small-ring')).toHaveCount(0);
      } else {
        await expectSmallRing(page, kind, kind === 'flush' ? '4 / 10 s' : '4 / 30 s');
        await expect(page.getByTestId('small-ring-kind')).toHaveText(kind === 'flush' ? 'Flush' : 'Hot water');
        // Drawn on top: a finger at its centre reaches it.
        const onTop = await page.evaluate(() => {
          const ring = document.querySelector('[data-testid="small-ring"]')!;
          const box = ring.getBoundingClientRect();
          return ring.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
        });
        expect(onTop).toBe(true);
      }

      const before = gateway.calls('PUT', '/api/v1/machine/state/idle').length;
      await page.getByTestId(large ? 'stop' : 'small-ring').click();
      await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/idle').length).toBe(before + 1);
      gateway.waterEnded();
      await expect(page.getByTestId('small-ring')).toHaveCount(0);
      await expect(page.getByTestId('water-view')).toHaveCount(0);
      await expect(page.getByTestId(`screen-${screen}`)).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}
