import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// The header's light and corner (dark glass): the machine's state is a light behind the row (heating
// breathes red, water or a shot a steady blue, steam a steady red, idle none); the top left corner
// holds only 'Asleep' or 'Off' (dim, no action) or a fault in orange whose tap opens its details.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const header = (page: Page) => page.locator('header.page-header');

/** The light's colour as the browser computes it: the pseudo element's background has the gradient's colour in it. */
const lightRgb = (page: Page) =>
  header(page).evaluate((node) => {
    const probe = document.createElement('i');
    probe.style.color = getComputedStyle(node).getPropertyValue('--light');
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });

const token = (page: Page, name: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('i');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, name);

const light = (page: Page) => header(page).locator('.light');
const opacity = (page: Page) => light(page).evaluate((node) => getComputedStyle(node).opacity);

test('idle has no light and no word; heating breathes red in three seconds', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  await expect(header(page)).toHaveAttribute('data-light', 'none');
  await expect.poll(() => opacity(page)).toBe('0');
  await expect(page.getByTestId('status-word')).toHaveCount(0);
  await expect(page.getByTestId('status-fault')).toHaveCount(0);
  await page.screenshot({ path: 'docs/product/header-idle.png' });

  gateway.heatTo({ group: 70 });
  await expect(header(page)).toHaveAttribute('data-light', 'heating');
  expect(await lightRgb(page)).toBe(await token(page, '--temperature'));
  const breathing = await light(page).evaluate((node) => {
    const style = getComputedStyle(node);
    return { name: style.animationName, duration: style.animationDuration };
  });
  expect(breathing).toEqual({ name: expect.stringContaining('breathe'), duration: '3s' });
  await expect(page.getByTestId('status-word')).toHaveCount(0);
  await page.screenshot({ path: 'docs/product/header-heating.png' });
  expect(errors).toEqual([]);
});

test('water or a shot running is a steady blue, steam a steady red', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');

  gateway.waterFor('hotWater', 4, 4);
  await expect(header(page)).toHaveAttribute('data-light', 'flow');
  expect(await lightRgb(page)).toBe(await token(page, '--flow'));
  await expect.poll(() => opacity(page)).toBe('1');
  expect(await light(page).evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
  await expect(page.getByTestId('status-word')).toHaveCount(0);
  gateway.waterEnded();
  await expect(header(page)).toHaveAttribute('data-light', 'none');

  gateway.state = 'espresso';
  await expect(header(page)).toHaveAttribute('data-light', 'flow');
  gateway.state = 'idle';

  await toPage(page, 'steam');
  gateway.steamFor(6);
  await expect(header(page)).toHaveAttribute('data-light', 'steam');
  expect(await lightRgb(page)).toBe(await token(page, '--temperature'));
  expect(await light(page).evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
  await expect(page.getByTestId('status-word')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('no other state shows a word: starting, busy, preheating and the procedures', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  for (const [state, title] of [
    ['booting', 'Starting'],
    ['busy', 'Busy'],
    ['preheating', 'Preheating'],
    ['cleaning', 'Cleaning'],
    ['descaling', 'Descaling'],
  ] as const) {
    gateway.state = state;
    await expect(page.getByTestId('status')).toHaveAttribute('data-state', title);
    await expect(page.getByTestId('status-word')).toHaveCount(0);
    await expect(page.getByTestId('status-fault')).toHaveCount(0);
    await expect(header(page)).toHaveAttribute('data-light', 'none');
  }
  expect(errors).toEqual([]);
});

test('a fault is an orange word with a steady orange light, and a tap opens its details', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');

  gateway.state = 'needsWater';
  const fault = page.getByTestId('status-fault');
  await expect(fault).toHaveText('Needs water');
  await expect(header(page)).toHaveAttribute('data-light', 'fault');
  expect(await lightRgb(page)).toBe(await token(page, '--warn'));
  expect(await fault.evaluate((node) => getComputedStyle(node).color)).toBe(await token(page, '--warn'));
  expect(await light(page).evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
  await page.screenshot({ path: 'docs/product/header-fault.png' });

  await fault.click();
  const dialog = page.getByTestId('status-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('status-dialog-title')).toHaveText('Needs water');
  await expect(page.getByTestId('status-dialog-detail')).toContainText('group');
  // only a refused link offers a reconnect
  await expect(page.getByTestId('status-reconnect')).toHaveCount(0);
  await page.getByTestId('status-dialog-close').click();
  await expect(dialog).toHaveCount(0);

  // a tap on the scrim cancels as well, and the fault going takes the popup with it
  await fault.click();
  await expect(dialog).toBeVisible();
  gateway.state = 'idle';
  await expect(dialog).toHaveCount(0);
  await expect(fault).toHaveCount(0);
  await expect(header(page)).toHaveAttribute('data-light', 'none');

  gateway.state = 'error';
  await expect(fault).toHaveText('Error');
  expect(errors).toEqual([]);
});

test('no machine connected and a gateway that is not reachable are faults too', async ({ page }) => {
  await mockGateway(page, { machine: false });
  await page.goto('/');
  await expect(page.getByTestId('status-fault')).toHaveText('No machine connected', { timeout: 8000 });
  await expect(header(page)).toHaveAttribute('data-light', 'fault');
  await expect(page.getByTestId('state-group')).toHaveCount(0);
  await page.getByTestId('status-fault').click();
  await expect(page.getByTestId('status-dialog-detail')).toContainText('Connect it in Decaid');
});

test('a refused link offers reconnect in the details', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.refuseStreams = true;
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await page.goto('/');
  await expect(page.getByTestId('stream-failed')).toHaveCount(0);
  for (let seconds = 0; seconds < 40 && !(await page.getByTestId('stream-failed').isVisible()); seconds++) {
    await page.clock.runFor(1000);
    await page.waitForTimeout(30);
  }
  await page.clock.resume();
  await expect(page.getByTestId('status-fault')).toHaveText('Decaid closed the connection');
  await page.getByTestId('status-fault').click();
  const reconnect = page.getByTestId('status-reconnect');
  await expect(reconnect).toBeVisible();
  const before = gateway.refused;
  await reconnect.click();
  await expect(page.getByTestId('status-dialog')).toHaveCount(0);
  await expect.poll(() => gateway.refused).toBeGreaterThan(before);
});

test('Asleep is a dim word without an action', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.state = 'sleeping';
  await page.goto('/');
  // the Asleep screen covers the page; the header under it carries the word
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Asleep');
  const word = page.getByTestId('status-word');
  await expect(word).toHaveText('Asleep');
  expect(await word.evaluate((node) => node.tagName)).toBe('SPAN');
  expect(await word.evaluate((node) => getComputedStyle(node).color)).toBe(await token(page, '--dim'));
  await expect(header(page)).toHaveAttribute('data-light', 'none');
});
