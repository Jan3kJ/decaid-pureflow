import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// A swipe down with two fingers on hot water, home or steam is the menu's 'Machine and app sleep';
// one finger, a short move or a move sideways is not. The menu's lines are of one height.

async function twoFingers(page: Page, dx: number, dy: number) {
  const cdp = await page.context().newCDPSession(page);
  const a = { x: 700, y: 300 };
  const b = { x: 900, y: 300 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
  for (let i = 1; i <= 8; i += 1) {
    const f = i / 8;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: a.x + dx * f, y: a.y + dy * f },
        { x: b.x + dx * f, y: b.y + dy * f },
      ],
    });
    await page.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function home(page: Page) {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  return gateway;
}

const sleeps = (gateway: Awaited<ReturnType<typeof mockGateway>>) => gateway.calls('PUT', '/api/v1/machine/state/sleeping').length;

test('two fingers swiped down send the machine and the app to sleep', async ({ page }) => {
  const gateway = await home(page);
  await twoFingers(page, 0, 400);
  await expect(page.getByTestId('asleep')).toBeVisible();
  expect(sleeps(gateway)).toBe(1);
});

test('a short or a sideways two-finger move does not sleep', async ({ page }) => {
  const gateway = await home(page);
  await twoFingers(page, 0, 60);
  await twoFingers(page, 400, 40);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('asleep')).toHaveCount(0);
  expect(sleeps(gateway)).toBe(0);
});

test('the menu lines are of one height, the steam heater among them', async ({ page }) => {
  await home(page);
  await page.getByTestId('menu').click();
  const boxes = await Promise.all(
    ['open-settings', 'open-beans', 'open-clean', 'steam-heater', 'machine-sleep', 'app-sleep'].map((id) =>
      page.getByTestId(id).boundingBox(),
    ),
  );
  const tops = boxes.map((box) => box!.y);
  const steps = tops.slice(1).map((top, i) => Math.round(top - tops[i]));
  expect(new Set(steps).size).toBe(1);
  const label = (await page.getByTestId('steam-heater').locator('.label').boundingBox())!;
  const other = (await page.getByTestId('open-clean').locator('.label').boundingBox())!;
  expect(Math.round(label.y - boxes[3]!.y)).toBe(Math.round(other.y - boxes[2]!.y));
});

async function machineAsleepAppAwake(page: Page) {
  const gateway = await home(page);
  await page.getByTestId('menu').click();
  await page.getByTestId('machine-sleep').click();
  await expect(page.getByTestId('status-title')).toHaveText('Asleep');
  await expect(page.getByTestId('asleep')).toHaveCount(0);
  expect(sleeps(gateway)).toBe(1);
  return gateway;
}

test("with the machine asleep the menu's 'Machine and app sleep' shows the Asleep screen and asks nothing", async ({ page }) => {
  const gateway = await machineAsleepAppAwake(page);
  const before = gateway.requests.length;
  await page.getByTestId('menu').click();
  await expect(page.getByTestId('wake-machine')).toHaveText('Wake machine');
  await expect(page.getByTestId('machine-sleep')).toHaveCount(0);
  await expect(page.getByTestId('app-sleep')).toBeEnabled();
  await page.getByTestId('app-sleep').click();
  await expect(page.getByTestId('asleep')).toBeVisible();
  await page.waitForTimeout(300);
  expect(gateway.requests.slice(before).filter((r) => r.method !== 'GET' && r.path.startsWith('/api/v1/machine/state'))).toEqual([]);
});

test('with the machine asleep two fingers swiped down show the Asleep screen and ask nothing', async ({ page }) => {
  const gateway = await machineAsleepAppAwake(page);
  const before = gateway.requests.length;
  await twoFingers(page, 0, 400);
  await expect(page.getByTestId('asleep')).toBeVisible();
  await page.waitForTimeout(300);
  expect(gateway.requests.slice(before).filter((r) => r.method !== 'GET' && r.path.startsWith('/api/v1/machine/state'))).toEqual([]);
});
