import { expect, test, type Page } from '@playwright/test';
import { mockGateway, shotEvents } from './mock-gateway';
import { toPage } from './touch';

// No strip above home's graph; the step that runs is printed in the state line, after the scale's
// weight. The column's time says 'time, finished' after a shot.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const box = async (page: Page, testid: string) => (await page.getByTestId(testid).boundingBox())!;

/** The share of the replay up to and with the first frame of profile step `frame` in which water moves. */
function shareAt(frame: number): number {
  const events = shotEvents();
  const index = events.findIndex(
    (event) =>
      event.machine?.state.state === 'espresso' &&
      event.machine.profileFrame === frame &&
      event.machine.state.substate !== 'preparingForShot',
  );
  return (index + 1) / events.length;
}

test('no strip on home; while a shot runs the state line ends with the step’s name, which follows the machine’s frame', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  gateway.putOnScale(0);
  const steps = gateway.workflow.profile.steps;
  steps[1] = { ...steps[1], name: 'Preinfusion' };
  steps[2] = { ...steps[2], name: 'Extraction' };
  steps[5] = { ...steps[5], name: '' };
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  // The graph starts right under the header's row: no strip between them.
  await expect(page.getByTestId('shot-caption')).toHaveCount(0);
  await expect(page.getByTestId('state-step')).toHaveCount(0);
  const header = (await page.getByTestId('screen-home').locator('header.page-header').boundingBox())!;
  const graph = await box(page, 'empty-graph');
  expect(graph.y - (header.y + header.height)).toBeLessThan(0.6 * 16 + 2);

  // The machine heats: no step yet.
  await gateway.replay(page, 0, shareAt(0) - 0.01);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'running');
  await expect(page.getByTestId('state-step')).toHaveCount(0);
  await expect(page.getByTestId('shot-timer-label')).toHaveText('time');

  // The steps by the machine's frame number: their names, 'Step 6' for one without.
  await gateway.replay(page, shareAt(0) - 0.01, shareAt(1));
  await expect(page.getByTestId('state-step')).toHaveText('Preinfusion');
  await gateway.replay(page, shareAt(1), shareAt(2));
  await expect(page.getByTestId('state-step')).toHaveText('Extraction');
  await expect(page.getByTestId('status-title')).toHaveText('Pouring');
  // After the scale's weight, in the state line's value size and the state word's colour.
  const step = await box(page, 'state-step');
  const weight = await box(page, 'state-scale');
  expect(step.x).toBeGreaterThan(weight.x + weight.width);
  expect(Math.abs(step.y + step.height - (weight.y + weight.height))).toBeLessThan(3);
  const style = (testid: string) =>
    page.getByTestId(testid).evaluate((element) => {
      const { fontSize, color } = getComputedStyle(element);
      return { fontSize, color };
    });
  expect((await style('state-step')).fontSize).toBe((await style('state-scale')).fontSize);
  expect((await style('state-step')).color).toBe((await style('status-title')).color);
  await expect(page.getByTestId('shot-caption')).toHaveCount(0);
  await page.screenshot({ path: 'docs/product/home-step.png' });

  await gateway.replay(page, shareAt(2), shareAt(5));
  await expect(page.getByTestId('state-step')).toHaveText('Step 6');

  // The shot ends: the step goes, the column says 'time, finished', the state line Idle.
  await gateway.replay(page, shareAt(5), 1);
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');
  await expect(page.getByTestId('state-step')).toHaveCount(0);
  await expect(page.getByTestId('shot-timer-label')).toHaveText('time, finished');
  await expect(page.getByTestId('shot-caption')).toHaveCount(0);
  expect(parseFloat((await page.getByTestId('shot-timer').textContent())!)).toBeGreaterThan(25);
  expect(parseFloat((await page.getByTestId('shot-weight').textContent())!)).toBeGreaterThan(0);
  // The right column starts at the page's top.
  expect(Math.abs((await box(page, 'shot-column')).y - header.y)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('hot water, flush and steam print no step', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  for (const kind of ['hotWater', 'flush'] as const) {
    gateway.waterFor(kind, 4, 4);
    await expect(page.getByTestId('water-view')).toBeVisible();
    await expect(page.getByTestId('state-step')).toHaveCount(0);
    gateway.waterEnded();
    await expect(page.getByTestId('status-title')).toHaveText('Idle');
  }

  await toPage(page, 'steam');
  gateway.steamFor(6);
  await expect(page.getByTestId('status-title')).toHaveText('Steam');
  await expect(page.getByTestId('state-step')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the profile’s name on the column’s button is one line, cut with an ellipsis', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.workflow.profile = {
    ...gateway.workflow.profile,
    title: 'A very long profile name that never fits in the right column of home',
  };
  await page.goto('/');
  const name = page.getByTestId('profile-name');
  await expect(name).toContainText('A very long');
  const shown = await name.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      overflow: style.textOverflow,
      wrap: style.whiteSpace,
      cut: element.scrollWidth > element.clientWidth,
      oneLine: element.getBoundingClientRect().height < 2 * parseFloat(style.fontSize),
    };
  });
  expect(shown).toEqual({ overflow: 'ellipsis', wrap: 'nowrap', cut: true, oneLine: true });
  expect(errors).toEqual([]);
});
