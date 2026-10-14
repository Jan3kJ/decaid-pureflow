import { expect, test } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';

// The steam page against a mocked gateway (D8a, acceptance item 4): the scale's frames are
// the mock's, because the simulated scale's weight cannot be set (research.md 8.7). The
// founder agreed to this way of testing on 2026-10-13 (request 168).

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

/** The bodies of the workflow writes, in order. */
const written = (gateway: MockGateway) => gateway.calls('PUT', '/api/v1/workflow').map((call) => call.body);

// With the founder's defaults: mugs 150, 225 and 275 g, 26 s for 180 g of milk.
const MUGS = [
  { name: 'a small mug', weight: 300, size: 's', mug: '150 g', milk: '150 g', seconds: 22 },
  { name: 'a medium mug', weight: 405, size: 'm', mug: '225 g', milk: '180 g', seconds: 26 },
  { name: 'a large mug', weight: 575.4, size: 'l', mug: '275 g', milk: '300.4 g', seconds: 43 },
];

for (const mug of MUGS) {
  test(`${mug.name} with milk on the scale: the size, the milk and the seconds, and 'set timer' writes them`, async ({ page }) => {
    const gateway = await mockGateway(page);
    await page.goto('/');
    await page.getByTestId('open-steam').click();
    await expect(page.getByTestId('screen-steam')).toBeVisible();
    // The timer the machine has.
    await expect(page.getByTestId('steam-timer')).toHaveText('50s');

    gateway.putOnScale(mug.weight);
    await expect(page.getByTestId('steam-weight')).toHaveText(`${mug.weight.toFixed(1)} g`);
    await expect(page.getByTestId('steam-mug')).toHaveText(mug.size);
    await expect(page.getByTestId('steam-mug-weight')).toHaveText(mug.mug);
    await expect(page.getByTestId('steam-milk')).toHaveText(mug.milk);
    await expect(page.getByTestId('steam-seconds')).toHaveText(`${mug.seconds} s`);
    // Nothing is written before the tap.
    expect(written(gateway)).toEqual([]);

    await page.getByTestId('steam-set-timer').click();
    await expect(page.getByTestId('steam-timer')).toHaveText(`${mug.seconds}s`);
    expect(written(gateway)).toEqual([{ steamSettings: { duration: mug.seconds } }]);
    expect(gateway.workflow.steamSettings).toEqual({
      targetTemperature: 150,
      duration: mug.seconds,
      flow: 0.8,
      stopAtTemperature: 0,
    });
    expect(errors).toEqual([]);
  });
}

test('the mug follows the scale, and an empty scale offers no timer', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('open-steam').click();

  await expect(page.getByTestId('steam-weight')).toHaveText('0.0 g');
  await expect(page.getByTestId('steam-mug')).toHaveText('s');
  await expect(page.getByTestId('steam-milk')).toHaveText('0 g');
  await expect(page.getByTestId('steam-set-timer')).toBeDisabled();
  await expect(page.getByTestId('steam-seconds')).toHaveCount(0);

  // The borders of the founder's defaults: above 375 g it is the medium mug, above 425 g the large one.
  const borders = [
    [375, 's'],
    [376, 'm'],
    [425, 'm'],
    [426, 'l'],
    [150, 's'],
  ] as const;
  for (const [weight, size] of borders) {
    gateway.putOnScale(weight);
    await expect(page.getByTestId('steam-weight')).toHaveText(`${weight}.0 g`);
    await expect(page.getByTestId('steam-mug')).toHaveText(size);
  }
  // An empty small mug: no milk, nothing to set.
  await expect(page.getByTestId('steam-set-timer')).toBeDisabled();
  expect(written(gateway)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a favourite chip writes its seconds directly, without a scale weight', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('open-steam').click();

  const chips = page.getByTestId('steam-favourite');
  await expect(chips).toHaveText(['25 s', '50 s', '30 s']);
  // The chip of the machine's timer is marked.
  await expect(chips.nth(1)).toContainClass('on');

  await chips.nth(0).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('25s');
  await expect(chips.nth(0)).toContainClass('on');
  await chips.nth(2).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('30s');
  expect(written(gateway)).toEqual([{ steamSettings: { duration: 25 } }, { steamSettings: { duration: 30 } }]);
  expect(errors).toEqual([]);
});

// The founder's test of 2026-10-13: a favourite of 25 s was followed by 30 s of steam. The
// workflow's duration is not the machine's timer (research.md, section 16).

test("the timer on screen is the machine's, and a chip writes the machine when the workflow already had its seconds", async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  // The workflow says 25 s, the machine holds 30 s: Decaid passes a workflow write on only when the value changes.
  gateway.workflow.steamSettings.duration = 25;
  gateway.shotSettings.targetSteamDuration = 30;
  await page.goto('/');
  await page.getByTestId('open-steam').click();

  const chips = page.getByTestId('steam-favourite');
  await expect(page.getByTestId('steam-timer')).toHaveText('30s');
  await expect(chips.nth(2)).toContainClass('on');

  await chips.nth(0).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('25s');
  await expect(chips.nth(0)).toContainClass('on');
  expect(written(gateway)).toEqual([{ steamSettings: { duration: 25 } }]);
  // The whole frame of the machine's settings, with the new timer.
  expect(gateway.calls('POST', '/api/v1/machine/shotSettings').map((call) => call.body)).toEqual([
    { ...gateway.shotSettings, targetSteamDuration: 25 },
  ]);
  expect(gateway.shotSettings.targetSteamDuration).toBe(25);
  await expect(page.getByTestId('steam-mismatch')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('with Streamline open and remembering 30 s, a chip of 25 s and the timer from the milk both stay', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.streamlineOpen = true;
  gateway.store['streamline-app/last-steam-duration'] = 30;
  gateway.setMachineSteamTimer(50);
  // Streamline has written its 30 s over the 50 s.
  expect(gateway.shotSettings.targetSteamDuration).toBe(30);
  await page.goto('/');
  await page.getByTestId('open-steam').click();
  await expect(page.getByTestId('steam-timer')).toHaveText('30s');

  await page.getByTestId('steam-favourite').nth(0).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('25s');
  expect(gateway.store['streamline-app/last-steam-duration']).toBe(25);

  gateway.putOnScale(405);
  await page.getByTestId('steam-set-timer').click();
  await expect(page.getByTestId('steam-timer')).toHaveText('26s');
  expect(gateway.store['streamline-app/last-steam-duration']).toBe(26);
  // Both ways write the same call, and the machine keeps what they wrote.
  expect(written(gateway)).toEqual([{ steamSettings: { duration: 25 } }, { steamSettings: { duration: 26 } }]);
  expect(gateway.shotSettings.targetSteamDuration).toBe(26);
  expect(gateway.workflow.steamSettings.duration).toBe(26);
  await expect(page.getByTestId('steam-mismatch')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a timer another app changes afterwards is shown with a notice, until it is set again', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('open-steam').click();
  // No store key of Streamline: the skin does not create one.
  await page.getByTestId('steam-favourite').nth(0).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('25s');
  expect(gateway.store).toEqual({});
  await expect(page.getByTestId('steam-mismatch')).toHaveCount(0);

  gateway.setMachineSteamTimer(30);
  await expect(page.getByTestId('steam-timer')).toHaveText('30s');
  await expect(page.getByTestId('steam-mismatch')).toContainText("The machine's timer is 30 s, not the 25 s set here");

  await page.getByTestId('steam-favourite').nth(0).click();
  await expect(page.getByTestId('steam-timer')).toHaveText('25s');
  await expect(page.getByTestId('steam-mismatch')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the steam settings come from the settings store and survive a reload', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem(
      'decaid-skin.settings',
      JSON.stringify({ steam: { mugSmall: 100, referenceSeconds: 30, referenceMilk: 100, favourites: [10, 20, 40] } }),
    );
  });
  // The skin reads the store once, when it loads; afterwards the settings page changes it.
  await page.reload();
  await page.getByTestId('open-steam').click();
  gateway.putOnScale(200);

  for (const reload of [false, true]) {
    // After the reload the steam screen is the one the skin opens with.
    if (reload) await page.reload();
    await expect(page.getByTestId('steam-favourite')).toHaveText(['10 s', '20 s', '40 s']);
    await expect(page.getByTestId('steam-mug-weight')).toHaveText('100 g');
    await expect(page.getByTestId('steam-milk')).toHaveText('100 g');
    await expect(page.getByTestId('steam-seconds')).toHaveText('30 s');
  }
  expect(errors).toEqual([]);
});

test('start and stop steam, with a graph of pressure and temperature', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('open-steam').click();
  gateway.putOnScale(405);
  await page.getByTestId('steam-set-timer').click();
  await expect(page.getByTestId('steam-timer')).toHaveText('26s');

  await expect(page.getByTestId('steam-start')).toBeEnabled();
  await expect(page.getByTestId('shot-graph')).toHaveAttribute('data-points', '0');
  await page.getByTestId('steam-start').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/steam').length).toBe(1);
  // The page waits for the machine: no stop before a frame says steam.
  await expect(page.getByTestId('steam-start')).toBeVisible();

  gateway.steamFor(18);
  await expect(page.getByTestId('steam-stop')).toBeVisible();
  await expect(page.getByTestId('steam-state')).toContainText('steaming');
  expect(Number(await page.getByTestId('shot-graph').getAttribute('data-points'))).toBeGreaterThanOrEqual(72);
  for (const line of ['pressure', 'temperature']) {
    expect((await page.getByTestId(`shot-line-${line}`).getAttribute('d'))!.length).toBeGreaterThan(100);
  }
  // Steam has no flow and no weight line.
  await expect(page.getByTestId('shot-line-flow')).toHaveCount(0);
  await expect(page.getByTestId('shot-line-weight')).toHaveCount(0);
  // The steam screen stays: only espresso opens a screen by itself.
  await expect(page.getByTestId('screen-steam')).toBeVisible();

  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const outside = [...document.querySelectorAll('button, dl, header, aside, svg')].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < 0 || rect.top < 0 || rect.right > innerWidth + 0.5 || rect.bottom > innerHeight + 0.5);
    });
    return { scrolls: root.scrollWidth > innerWidth || root.scrollHeight > innerHeight, outside: outside.length };
  });
  expect(overflow).toEqual({ scrolls: false, outside: 0 });
  await page.screenshot({ path: 'docs/product/steam.png' });

  await page.getByTestId('steam-stop').click();
  await expect.poll(() => gateway.calls('PUT', '/api/v1/machine/state/idle').length).toBe(1);
  gateway.state = 'idle';
  await expect(page.getByTestId('steam-start')).toBeEnabled();
  // The finished graph stays until the next steam.
  await expect(page.getByTestId('steam-state')).toContainText('last steam');
  expect(Number(await page.getByTestId('shot-graph').getAttribute('data-points'))).toBeGreaterThanOrEqual(72);
  expect(errors).toEqual([]);
});
