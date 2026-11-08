import { expect, test, type Page } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';

// The clean with detergent against the mocked gateway: the three steps, a run stopped at the
// machine, the earlier profile back at the end, on cancel and after a reload, and a machine without
// the profile. The same up to the run against the running gateway: e2e-rig/detergent-clean.spec.ts.

const TITLE = 'Cleaning/Forward Flush x5';
const LAST_STEP = 8;

const errors: string[] = [];
let gateway: MockGateway;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
  gateway.workflow.context = { ...gateway.workflow.context, targetYield: 36, targetDoseWeight: 18 };
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const caption = (page: Page) => page.getByTestId('maintenance-caption-detergent');
const machineRequests = () => gateway.calls('PUT', /^\/api\/v1\/machine\/state\//).map((call) => call.path.split('/').pop());

async function openMaintenance(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-clean').click();
  await expect(page.getByTestId('settings-content')).toHaveAttribute('data-category', 'maintenance');
}

/** Maintenance opened, the card started, the profile loaded. */
async function startCard(page: Page) {
  await openMaintenance(page);
  await page.getByTestId('maintenance-start-detergent').click();
  await expect(page.getByTestId('settings-confirm')).toContainText(
    'Empty the drip tray first. Put a blind basket with 1 teaspoon of detergent',
  );
  await page.getByTestId('settings-confirm-ok').click();
  await expect(caption(page)).toHaveText(`${TITLE} is loaded: start it at the machine.`);
}

function expectEarlierBack(title: string) {
  expect(gateway.workflow.profile.title).toBe(title);
  expect(gateway.workflow.context).toMatchObject({ targetYield: 36, targetDoseWeight: 18 });
}

test("Maintenance lists 'Clean with detergent' before 'Clean'", async ({ page }) => {
  gateway.withDetergentProfile();
  await openMaintenance(page);
  const sections = await page.locator('[data-testid^="settings-section-"]').evaluateAll((all) => all.map((one) => one.dataset.testid));
  expect(sections.indexOf('settings-section-detergentclean')).toBe(sections.indexOf('settings-section-machinecleaning') - 1);
  await page.screenshot({ path: 'docs/product/detergent-clean.png' });
});

test('the three steps: the run at the machine, one flush of 10 s, the cycle; then the earlier profile is back', async ({ page }) => {
  gateway.withDetergentProfile();
  const earlier = gateway.workflow.profile.title;
  await startCard(page);

  // The first step loads the profile, without a stop at a weight, and starts nothing.
  expect(gateway.workflow.profile.title).toBe(TITLE);
  expect(gateway.workflow.context).toMatchObject({ targetYield: 0, targetDoseWeight: 18 });
  expect(machineRequests()).toEqual([]);
  await page.screenshot({ path: 'docs/product/detergent-clean-run.png' });

  // The run started at the machine: the card stays and names the profile's steps.
  gateway.runAtStep(0);
  await expect(caption(page)).toHaveText('Pressure rise 1');
  gateway.runAtStep(1);
  await expect(caption(page)).toHaveText('Pause 1');
  await expect(page.getByTestId('maintenance-detergent')).toBeVisible();
  gateway.runAtStep(LAST_STEP);
  await expect(caption(page)).toHaveText('Pressure rise 5');
  expect(machineRequests()).toEqual([]);

  gateway.waterEnded();
  await expect(caption(page)).toHaveText('Take the portafilter out and flush for 10 s.');
  await page.screenshot({ path: 'docs/product/detergent-clean-flush.png' });

  // The flush: the skin asks for it and, as the machine's time is longer, ends it at 10 s.
  await page.getByTestId('detergent-flush').click();
  await expect.poll(machineRequests).toEqual(['flush']);
  gateway.waterFor('flush', 11, 6);
  await expect.poll(machineRequests).toEqual(['flush', 'idle']);
  gateway.waterEnded();
  await expect(caption(page)).toHaveText("Last step: the machine's cleaning cycle.");

  // The machine's cleaning cycle, asked for as 'Clean' asks.
  await page.getByTestId('detergent-cycle').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('blind basket');
  await page.getByTestId('settings-confirm-ok').click();
  await expect.poll(machineRequests).toEqual(['flush', 'idle', 'cleaning']);
  expect(gateway.workflow.profile.title).toBe(TITLE);
  // A frame while the request is in flight is not read: each is sent until the card shows it.
  const steps = [
    ['cleaningStart', 'Starting'],
    ['cleaningGroup', 'Filling'],
    ['cleanSoaking', 'Soak'],
    ['cleaningGroup', 'Flush'],
  ];
  for (const [substate, shown] of steps) {
    gateway.substate = substate;
    await expect
      .poll(async () => {
        gateway.heatTo({});
        return caption(page).textContent();
      })
      .toBe(shown);
  }
  gateway.substate = null;
  gateway.waterEnded();
  await expect(caption(page)).toHaveText('Ready');

  await expect.poll(() => gateway.workflow.profile.title).toBe(earlier);
  expectEarlierBack(earlier);
  await expect(page.getByTestId('maintenance-start-detergent')).toBeVisible();
});

test('a run stopped at the machine puts the card back at its step, and cancel brings the earlier profile back', async ({ page }) => {
  gateway.withDetergentProfile();
  const earlier = gateway.workflow.profile.title;
  await startCard(page);

  gateway.runAtStep(3);
  await expect(caption(page)).toHaveText('Pause 2');
  gateway.waterEnded();
  await expect(caption(page)).toHaveText(`Stopped at the machine. ${TITLE} is loaded: start it at the machine.`);
  await expect(page.getByTestId('detergent-flush')).toHaveCount(0);
  expect(gateway.workflow.profile.title).toBe(TITLE);

  await page.getByTestId('maintenance-cancel-detergent').click();
  await expect(page.getByTestId('maintenance-start-detergent')).toBeVisible({ timeout: 10_000 });
  await expect(caption(page)).toHaveCount(0);
  expectEarlierBack(earlier);
  // Nothing ran, so nothing was asked of the machine.
  expect(machineRequests()).toEqual([]);
});

test('cancel during the run stops it first', async ({ page }) => {
  gateway.withDetergentProfile();
  const earlier = gateway.workflow.profile.title;
  await startCard(page);
  gateway.runAtStep(1);
  await expect(caption(page)).toHaveText('Pause 1');
  await page.getByTestId('maintenance-cancel-detergent').click();
  await expect.poll(machineRequests).toEqual(['idle']);
  // Decaid decides on a record by the profile a few seconds after the run: it is still the cleaning one.
  await page.waitForTimeout(1000);
  expect(gateway.workflow.profile.title).toBe(TITLE);
  await expect.poll(() => gateway.workflow.profile.title, { timeout: 10_000 }).toBe(earlier);
  expectEarlierBack(earlier);
  gateway.waterEnded();
});

test('a machine without the profile stops the card and loads nothing', async ({ page }) => {
  await openMaintenance(page);
  await page.getByTestId('maintenance-start-detergent').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('maintenance-message-detergent')).toHaveText('the profile is not on this machine');
  await expect(page.getByTestId('maintenance-start-detergent')).toBeVisible();
  expect(gateway.calls('PUT', '/api/v1/workflow')).toEqual([]);
  expect(machineRequests()).toEqual([]);
});

test('a reload in the middle keeps the step and the earlier profile', async ({ page }) => {
  gateway.withDetergentProfile();
  const earlier = gateway.workflow.profile.title;
  await startCard(page);
  gateway.runAtStep(LAST_STEP);
  await expect(caption(page)).toHaveText('Pressure rise 5');
  gateway.waterEnded();
  await expect(caption(page)).toHaveText('Take the portafilter out and flush for 10 s.');

  await page.reload();
  await expect(caption(page)).toHaveText('Take the portafilter out and flush for 10 s.');
  await page.getByTestId('maintenance-cancel-detergent').click();
  await expect(page.getByTestId('maintenance-start-detergent')).toBeVisible({ timeout: 10_000 });
  expectEarlierBack(earlier);
});

test('unsaved edits on the machine come back as they were, without a warning', async ({ page }) => {
  gateway.withDetergentProfile();
  const edited = { ...gateway.workflow.profile, notes: 'edited on the machine', target_weight: 41 };
  gateway.workflow.profile = edited;
  await startCard(page);
  await expect(page.getByTestId('unsaved-dialog')).toHaveCount(0);
  expect(gateway.workflow.profile.title).toBe(TITLE);

  await page.getByTestId('maintenance-cancel-detergent').click();
  await expect(page.getByTestId('maintenance-start-detergent')).toBeVisible();
  expect(gateway.workflow.profile).toEqual(edited);
});

test('a profile loaded meanwhile is not replaced', async ({ page }) => {
  gateway.withDetergentProfile();
  await startCard(page);
  await page.getByTestId('maintenance-cancel-detergent').waitFor();
  gateway.workflow.profile = gateway.profiles[0].profile;
  const before = gateway.workflow.profile.title;
  await page.getByTestId('maintenance-cancel-detergent').click();
  await expect(page.getByTestId('maintenance-start-detergent')).toBeVisible();
  expect(gateway.workflow.profile.title).toBe(before);
});

test('another profile loaded before the run closes the card and stays', async ({ page }) => {
  gateway.withDetergentProfile();
  await startCard(page);
  // Loaded by another client, or the picker: the next frame finds it out.
  const other = gateway.profiles[0].profile;
  gateway.workflow.profile = other;
  await page.reload();
  await expect(caption(page)).toBeVisible();
  await expect
    .poll(async () => {
      gateway.heatTo({});
      return page.getByTestId('maintenance-start-detergent').count();
    })
    .toBe(1);
  await expect(caption(page)).toHaveCount(0);
  expect(gateway.workflow.profile.title).toBe(other.title);
});

test("'Clean' still sends the cleaning state alone", async ({ page }) => {
  gateway.withDetergentProfile();
  await openMaintenance(page);
  await page.getByTestId('maintenance-start-clean').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect.poll(machineRequests).toEqual(['cleaning']);
  expect(gateway.calls('PUT', '/api/v1/workflow')).toEqual([]);
  await page.getByTestId('maintenance-cancel-clean').click();
  await expect.poll(machineRequests).toEqual(['cleaning', 'idle']);
});

/** The gaps between the circles' edges, and whether a line lies between each two circles. */
async function circleGaps(page: Page, id: string) {
  return page.getByTestId(`maintenance-steps-${id}`).evaluate((list, dotId) => {
    const dots = [...list.querySelectorAll(`[data-testid="maintenance-dot-${dotId}"]`)].map((one) => one.getBoundingClientRect());
    const items = [...list.querySelectorAll('li')];
    const gaps = dots.slice(1).map((dot, i) => dot.left - dots[i].right);
    const lines = items.slice(1).map((item, i) => {
      const style = getComputedStyle(item, '::before');
      return { width: parseFloat(style.width), border: style.borderTopWidth, gap: gaps[i] };
    });
    return { count: dots.length, gaps, lines };
  }, id);
}

test('the circles of both cards stand equally far apart, with a line between each two', async ({ page }) => {
  gateway.withDetergentProfile();
  await startCard(page);
  await page.screenshot({ path: 'docs/product/detergent-clean-steps.png' });
  const detergent = await circleGaps(page, 'detergent');
  expect(detergent.count).toBe(3);
  await page.getByTestId('maintenance-cancel-detergent').click();
  await expect(page.getByTestId('maintenance-start-clean')).toBeVisible();

  await page.getByTestId('maintenance-start-clean').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('maintenance-steps-clean')).toBeVisible();
  await page.screenshot({ path: 'docs/product/clean-steps.png' });
  const clean = await circleGaps(page, 'clean');
  expect(clean.count).toBe(4);

  for (const { gaps, lines } of [detergent, clean]) {
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
    expect(lines).toHaveLength(gaps.length);
    for (const line of lines) {
      expect(line.border).toBe('1px');
      expect(Math.abs(line.width - line.gap)).toBeLessThanOrEqual(1);
    }
  }
});
