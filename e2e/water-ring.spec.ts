import { expect, test, type Page } from '@playwright/test';
import { mockGateway, profile } from './mock-gateway';
import { back, swipe, toPage } from './touch';

// The ring's frame: while hot water or flush runs, every screen
// shows the one large ring of home over its main frame (`data-main-frame`; a screen without one
// under its header), with stop in it; the header, the right column and the dots stay; a tap on
// stop sends the stop, a swipe on the ring leaves nothing, and the frame's content is back when the
// run ends. There is no small ring. The workflow's targets are the mock's: hot water 30 s, flush 10 s.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

/** Where the ring lies against the screen it covers, measured in the browser. */
async function placement(page: Page) {
  return page.evaluate(() => {
    const cover = document.querySelector('[data-testid="water-cover"]')!;
    const box = cover.getBoundingClientRect();
    const history = document.querySelector('[data-testid="history"]');
    const scope = history ?? document.querySelector('main > .page:not([inert])')!;
    const frames = [...scope.querySelectorAll('[data-main-frame]')]
      .map((frame) => frame.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const header = scope.querySelector('header')?.getBoundingClientRect() ?? null;
    let want: { left: number; top: number; right: number; bottom: number };
    if (frames.length) {
      want = {
        left: Math.min(...frames.map((rect) => rect.left)),
        top: Math.min(...frames.map((rect) => rect.top)),
        right: Math.max(...frames.map((rect) => rect.right)),
        bottom: Math.max(...frames.map((rect) => rect.bottom)),
      };
    } else {
      const screen = scope.getBoundingClientRect();
      want = { left: screen.left, top: header ? header.bottom : screen.top, right: screen.right, bottom: screen.bottom };
    }
    const near = (a: number, b: number) => Math.abs(a - b) <= 1;
    const stop = document.querySelector('[data-testid="water-stop"]')!.getBoundingClientRect();
    const hit = (x: number, y: number) => document.elementFromPoint(x, y);
    const covered = (rect: DOMRect | null) => !!rect && cover.contains(hit(rect.left + rect.width / 2, rect.top + rect.height / 2));
    const column = scope.querySelector('aside:not([data-main-frame])');
    return {
      marked: frames.length > 0,
      onFrame: near(box.left, want.left) && near(box.top, want.top) && near(box.right, want.right) && near(box.bottom, want.bottom),
      // A finger at stop's centre reaches stop, so the ring is drawn on top.
      stopOnTop: document
        .querySelector('[data-testid="water-stop"]')!
        .contains(hit(stop.left + stop.width / 2, stop.top + stop.height / 2)),
      // Large: stop is a finger's target many times over.
      large: stop.width >= 150,
      headerFree: !covered(header),
      columnFree: !covered(column && column !== history ? column.getBoundingClientRect() : null),
    };
  });
}

async function expectRing(page: Page, kind: 'flush' | 'hotWater', time: string, marked = true) {
  await expect(page.getByTestId('water-view')).toHaveCount(1);
  await expect(page.getByTestId('water-view')).toHaveAttribute('data-kind', kind);
  await expect(page.getByTestId('water-label')).toHaveText(kind === 'flush' ? 'Flush' : 'Hot water');
  await expect(page.getByTestId('water-time')).toHaveText(time);
  await expect(page.getByTestId('small-ring')).toHaveCount(0);
  await expect
    .poll(() => placement(page))
    .toEqual({ marked, onFrame: true, stopOnTop: true, large: true, headerFree: true, columnFree: true });
}

async function fromMenu(page: Page, entry: string) {
  await back(page);
  await page.getByTestId('menu').click();
  await page.getByTestId(entry).click();
}

test('flush: the one ring over the main frame of home, the history, steam, settings, beans and hot water; its stop stops', async ({
  page,
}) => {
  const gateway = (await mockGateway(page)).withDefaults('dark');
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('water-view')).toHaveCount(0);

  gateway.waterFor('flush', 6, 6, 90);
  // Home: over the graph's frame; the right column with its own stop and the dots stay.
  await expectRing(page, 'flush', '6 / 10 s');
  await expect(page.getByTestId('shot-column')).toBeVisible();
  await expect(page.getByTestId('page-dot-steam')).toBeVisible();
  await page.screenshot({ path: 'docs/product/ring-frame-home.png' });

  // The history over home: its list.
  await page.getByTestId('history-handle').click();
  await expect(page.getByTestId('history')).toBeVisible();
  await expectRing(page, 'flush', '6 / 10 s');
  await page.getByTestId('history-outside').click({ position: { x: 900, y: 100 } });
  await expect(page.getByTestId('history')).toHaveCount(0);

  await toPage(page, 'steam');
  await expectRing(page, 'flush', '6 / 10 s');
  await expect(page.getByTestId('water-ring')).toHaveAttribute('data-share', '0.600');
  await page.screenshot({ path: 'docs/product/ring-frame-steam.png' });

  await fromMenu(page, 'open-settings');
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await expectRing(page, 'flush', '6 / 10 s');

  await fromMenu(page, 'open-beans');
  await expect(page.getByTestId('screen-beans')).toBeVisible();
  await expectRing(page, 'flush', '6 / 10 s');
  await page.screenshot({ path: 'docs/product/ring-frame-beans.png' });

  // The hot water page: its rows' panel, for a flush too.
  await back(page);
  await toPage(page, 'hot-water');
  await expectRing(page, 'flush', '6 / 10 s');
  await expect(page.getByTestId('hot-water-stop')).toHaveCount(0);

  // It counts on, and stays full past the target.
  gateway.waterFlow(0, 1);
  await expect(page.getByTestId('water-time')).toHaveText('7 / 10 s');
  await expect(page.getByTestId('water-ring')).toHaveAttribute('data-share', '0.700');
  gateway.waterFlow(0, 5);
  await expect(page.getByTestId('water-time')).toHaveText('12 / 10 s');
  await expect(page.getByTestId('water-ring')).toHaveAttribute('data-share', '1.000');

  const before = gateway.calls('PUT', '/api/v1/machine/state/idle').length;
  await page.getByTestId('water-stop').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/idle').length).toBe(before + 1);
  await expect(page.getByTestId('screen-hot-water')).toBeVisible();
  gateway.waterEnded();
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  // The frame's content is back.
  await expect(page.getByTestId('hot-water-temperature')).toBeVisible();
  expect(errors).toEqual([]);
});

test('flush: the ring over the picker and the A-Flow editor', async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('dark');
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  await page.getByTestId('open-profiles').click();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  gateway.waterFor('flush', 6, 6, 90);
  await expectRing(page, 'flush', '6 / 10 s');
  gateway.waterEnded();
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  await expect(page.getByTestId('profile-list')).toBeVisible();

  await back(page);
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('screen-editor')).toBeVisible();
  await expect(page.getByTestId('graph')).toBeVisible();
  gateway.waterFor('flush', 6, 6, 90);
  await expectRing(page, 'flush', '6 / 10 s');
  await page.screenshot({ path: 'docs/product/ring-frame-editor.png' });
  gateway.waterEnded();
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  await expect(page.getByTestId('graph')).toBeVisible();
  expect(errors).toEqual([]);
});

test('hot water: the ring over the step editor, its page and steam, gone when it ends', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.workflow.profile = profile('Steps', 36, 3);
  gateway.connectScale(false);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('step-cards')).toBeVisible();
  gateway.waterFor('hotWater', 3, 8, 40);
  await expectRing(page, 'hotWater', '3 / 30 s');
  await expect(page.getByTestId('water-ring')).toHaveAttribute('data-share', '0.100');
  // A tab without a marked frame: the ring covers the editor under its header.
  await page.getByTestId('tab-settings').click();
  await expectRing(page, 'hotWater', '3 / 30 s', false);
  await page.getByTestId('tab-cards').click();

  await back(page);
  await toPage(page, 'hot-water');
  await expectRing(page, 'hotWater', '3 / 30 s');
  await page.screenshot({ path: 'docs/product/hot-water-pouring.png' });

  await back(page);
  await toPage(page, 'steam');
  await expectRing(page, 'hotWater', '3 / 30 s');

  // Hot water ends by itself (at its volume): the ring goes without a tap.
  gateway.waterEnded();
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  expect(errors).toEqual([]);
});

/**
 * Where the stop button's lines lie, top to bottom, and whether each fits inside its round face
 * (the corners of a line's box lie within the circle), measured in the browser.
 */
async function stopLines(page: Page) {
  return page.evaluate(() => {
    const stop = document.querySelector('[data-testid="water-stop"]')!.getBoundingClientRect();
    const r = stop.width / 2;
    const cx = stop.left + r;
    const cy = stop.top + stop.height / 2;
    const inside = (x: number, y: number) => Math.hypot(x - cx, y - cy) <= r;
    const ids = ['water-label', 'water-time', 'water-temperature', 'water-weight', 'water-target'];
    const lines = ids
      .map((id) => [id, document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect()] as const)
      .filter((entry): entry is readonly [string, DOMRect] => !!entry[1]);
    const word = document.querySelector('[data-testid="water-stop"] strong')!.getBoundingClientRect();
    const all = [...lines, ['stop', word] as const];
    return {
      order: all.map(([id]) => id),
      downwards: all.every(([, box], i) => i === 0 || box.top >= all[i - 1][1].top),
      fits: all.every(
        ([, box]) =>
          inside(box.left, box.top) && inside(box.right, box.top) && inside(box.left, box.bottom) && inside(box.right, box.bottom),
      ),
    };
  });
}

// The target in the ring: hot water shows the stop of
// `hotWaterData.volume` under its values, in g with a connected scale and in ml without one, inside
// the button over the frame; a flush and a target of 0 show none, and the ring still fills by time.
test('hot water: the target under the values, in g with a scale and in ml without, none for a flush or 0', async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('dark');
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  gateway.putOnScale(12.4);

  gateway.waterFor('hotWater', 4, 8, 80);
  await expectRing(page, 'hotWater', '4 / 30 s');
  await expect(page.getByTestId('water-weight')).toHaveText('12.4 g');
  await expect(page.getByTestId('water-target')).toHaveText('target 50 g');
  await expect(page.getByTestId('water-ring')).toHaveAttribute('data-share', '0.133');
  expect(await stopLines(page)).toEqual({
    order: ['water-label', 'water-time', 'water-temperature', 'water-weight', 'water-target', 'stop'],
    downwards: true,
    fits: true,
  });

  // Without a scale: the target in ml alone, no weight beside it.
  gateway.connectScale(false);
  await expect(page.getByTestId('water-target')).toHaveText('target 50 ml');
  await expect(page.getByTestId('water-weight')).toHaveCount(0);
  await expectRing(page, 'hotWater', '4 / 30 s');
  expect(await stopLines(page)).toEqual({
    order: ['water-label', 'water-time', 'water-temperature', 'water-target', 'stop'],
    downwards: true,
    fits: true,
  });

  // Over another screen's frame too: the hot water page.
  await toPage(page, 'hot-water');
  await expectRing(page, 'hotWater', '4 / 30 s');
  await expect(page.getByTestId('water-target')).toHaveText('target 50 ml');
  expect((await stopLines(page)).fits).toBe(true);
  gateway.waterEnded();
  await expect(page.getByTestId('water-view')).toHaveCount(0);

  // A flush has a time, not an amount.
  gateway.connectScale(true);
  gateway.waterFor('flush', 4, 6, 90);
  await expectRing(page, 'flush', '4 / 10 s');
  await expect(page.getByTestId('water-target')).toHaveCount(0);
  gateway.waterEnded();
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('hot water without a stop (a target of 0): no target line', async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('dark');
  gateway.workflow.hotWaterData = { ...gateway.workflow.hotWaterData, volume: 0 };
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  gateway.waterFor('hotWater', 4, 8, 80);
  await expectRing(page, 'hotWater', '4 / 30 s');
  await expect(page.getByTestId('water-temperature')).toBeVisible();
  await expect(page.getByTestId('water-target')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a swipe on the ring leaves neither the screen nor the page, and stops nothing', async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('dark');
  await page.goto('/');
  await toPage(page, 'steam');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  gateway.waterFor('flush', 4, 6, 90);
  await expectRing(page, 'flush', '4 / 10 s');
  const before = gateway.calls('PUT', '/api/v1/machine/state/idle').length;

  const ring = (await page.getByTestId('water-ring').boundingBox())!;
  const { width } = page.viewportSize()!;
  const from = { x: ring.x + ring.width * 0.1, y: ring.y + ring.height / 2 };
  await swipe(page, from, { x: Math.min(width - 2, from.x + width * 0.45), y: from.y }, 120);
  await expect(page.locator('.page.settling')).toHaveCount(0);
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await expect(page.getByTestId('water-view')).toHaveCount(1);

  // On a page too: steam does not slide to home.
  await back(page);
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  const steamRing = (await page.getByTestId('water-ring').boundingBox())!;
  const start = { x: steamRing.x + steamRing.width * 0.1, y: steamRing.y + steamRing.height / 2 };
  await swipe(page, start, { x: Math.min(width - 2, start.x + width * 0.45), y: start.y }, 120);
  await expect(page.locator('.page.settling')).toHaveCount(0);
  await expect(page.locator('.page')).toHaveCount(1);
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  expect(gateway.calls('PUT', '/api/v1/machine/state/idle').length).toBe(before);
  gateway.waterEnded();
  await expect(page.getByTestId('water-view')).toHaveCount(0);
  expect(errors).toEqual([]);
});

// Every screen times both kinds: the run starts at the machine
// with the screen already open, the one large ring shows over the screen's main frame, a tap on its
// stop sends the stop, and it goes when the run ends.
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
      await expectRing(page, kind, kind === 'flush' ? '4 / 10 s' : '4 / 30 s');

      const before = gateway.calls('PUT', '/api/v1/machine/state/idle').length;
      await page.getByTestId('water-stop').click();
      await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/idle').length).toBe(before + 1);
      gateway.waterEnded();
      await expect(page.getByTestId('water-view')).toHaveCount(0);
      await expect(page.getByTestId(`screen-${screen}`)).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}
