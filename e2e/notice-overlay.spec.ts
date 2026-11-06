import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway } from './mock-gateway';

// The editors' message is an overlay over the top of the graph (the A-Flow editor) or of the curve
// preview (the step editor): it takes no room, goes after 10 s, a failure too, and a tap closes it.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const notice = (page: Page) => page.getByTestId('editor-notice');
const boxOf = async (page: Page, id: string) => (await page.getByTestId(id).boundingBox())!;

async function openAFlow(page: Page) {
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
}

test('the A-Flow editor: the graph is as high with a message as without, a tap closes it, it goes after 10 s', async ({ page }) => {
  (await mockGateway(page)).withDefaults('light');
  await openAFlow(page);
  await expect(notice(page)).toHaveCount(0);
  const without = await boxOf(page, 'graph');

  await page.getByTestId('save').click();
  await expect(notice(page)).toBeVisible();
  expect(await boxOf(page, 'graph')).toEqual(without);
  // Over the top of the graph, inside its frame; the full text is the title.
  const line = await boxOf(page, 'editor-notice');
  expect(line.y).toBeGreaterThanOrEqual(without.y);
  expect(line.y + line.height).toBeLessThan(without.y + without.height / 2);
  await expect(notice(page)).toHaveAttribute('title', (await notice(page).textContent())!.trim());
  await expect(page.getByTestId('editor-status')).toHaveAttribute('role', 'status');

  // Only the message's box takes a tap: the container around it lets the graph below have it.
  const container = await boxOf(page, 'editor-status');
  const passes = await page.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest('[data-testid="editor-status"]'), {
    x: container.x + 2,
    y: line.y + line.height / 2,
  });
  expect(passes).toBe(true);

  await page.clock.fastForward(9_000);
  await expect(notice(page)).toBeVisible();
  await page.clock.fastForward(1_500);
  await expect(notice(page)).toHaveCount(0);
  expect(await boxOf(page, 'graph')).toEqual(without);

  await page.getByTestId('save').click();
  await expect(notice(page)).toBeVisible();
  await notice(page).click();
  await expect(notice(page)).toHaveCount(0);
  expect(await boxOf(page, 'graph')).toEqual(without);
});

test('a failure goes after 10 s too', async ({ page }) => {
  await mockGateway(page, { gateway: false });
  await openAFlow(page);
  await expect(notice(page)).toContainText('Decaid did not answer');
  await page.clock.fastForward(10_500);
  await expect(notice(page)).toHaveCount(0);
  // The browser reports each refused request; those are the test's own doing.
  errors.splice(0, errors.length, ...errors.filter((error) => !error.includes('ERR_CONNECTION_REFUSED')));
});

test("the step editor's message is an overlay over its curve preview as well", async ({ page }) => {
  const mine: Profile = {
    ...structuredClone(blooming.find((entry) => entry.title === 'Blooming Espresso') as Profile),
    title: 'My blooming',
  };
  const gateway = await mockGateway(page);
  gateway.profiles.push({
    id: 'profile:mine',
    profile: structuredClone(mine),
    metadataHash: 'm',
    compoundHash: 'c',
    parentId: null,
    visibility: 'visible',
    isDefault: false,
    createdAt: '2026-10-16T04:00:00Z',
    updatedAt: '2026-10-16T04:00:00Z',
    metadata: { source: 'other-app' },
  });
  gateway.workflow.profile = structuredClone(mine);
  await page.clock.install();
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('step-cards')).toBeVisible();
  const without = await boxOf(page, 'step-preview');
  const cards = await boxOf(page, 'step-cards');

  await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill('Slow start');
  await page.getByTestId('save-confirm').click();
  await expect(notice(page)).toBeVisible();
  expect(await boxOf(page, 'step-preview')).toEqual(without);
  expect(await boxOf(page, 'step-cards')).toEqual(cards);
  const line = await boxOf(page, 'editor-notice');
  expect(line.y).toBeGreaterThanOrEqual(without.y);
  expect(line.y + line.height).toBeLessThanOrEqual(without.y + without.height);

  await page.clock.fastForward(10_500);
  await expect(notice(page)).toHaveCount(0);
  expect(await boxOf(page, 'step-preview')).toEqual(without);
});
