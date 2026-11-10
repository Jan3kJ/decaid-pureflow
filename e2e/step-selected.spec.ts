import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway } from './mock-gateway';

// The cards tab lights the open step on its graph, like the flow editor's selected phase; the
// script tab's preview and the picker's light nothing.

const BASE = blooming.find((entry) => entry.title === 'Blooming Espresso') as Profile;
const MINE: Profile = {
  ...structuredClone(BASE),
  title: 'My three',
  steps: [
    { ...structuredClone(BASE.steps[0]), seconds: 10 },
    { ...structuredClone(BASE.steps[1]), seconds: 20 },
    { ...structuredClone(BASE.steps[2]), seconds: 30 },
  ],
};

async function open(page: Page, editor = true) {
  const gateway = await mockGateway(page);
  gateway.profiles.push({
    id: 'profile:mine',
    profile: structuredClone(MINE),
    metadataHash: 'm',
    compoundHash: 'c',
    parentId: null,
    visibility: 'visible',
    isDefault: false,
    createdAt: '2026-10-16T04:00:00Z',
    updatedAt: '2026-10-16T04:00:00Z',
    metadata: null,
  });
  gateway.workflow.profile = structuredClone(MINE);
  await page.goto('/');
  if (!editor) return;
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('step-cards')).toBeVisible();
}

const card = (page: Page, index: number) => page.getByTestId(`step-card-${index}`);
const selected = (page: Page) => page.getByTestId('step-preview').getByTestId('step-selected');

/** The step's span on the axis in CSS pixels, read from the drawn borders and the axis, not from the rect. */
async function expected(page: Page, from: number, to: number) {
  return page.getByTestId('step-preview').evaluate(
    (preview, [a, b]) => {
      const svg = preview.querySelector('[data-testid="shot-graph"]')!;
      const seconds = Number(svg.getAttribute('data-seconds'));
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const box = svg.getBoundingClientRect();
      const left = 2.8 * rem;
      const right = box.width - 1.2 * rem;
      const x = (time: number) => box.left + left + (time / seconds) * (right - left);
      return { left: x(a), right: x(b) };
    },
    [from, to],
  );
}

async function range(page: Page) {
  const box = (await selected(page).boundingBox())!;
  return { left: box.x, right: box.x + box.width };
}

async function expectStep(page: Page, from: number, to: number) {
  const want = await expected(page, from, to);
  await expect
    .poll(async () => {
      const got = await range(page);
      return Math.max(Math.abs(got.left - want.left), Math.abs(got.right - want.right));
    })
    .toBeLessThanOrEqual(2);
}

test('the cards tab lights the open step on the graph and follows it', async ({ page }) => {
  await open(page);
  await expect(selected(page)).toHaveCount(1);
  await expectStep(page, 0, 10);

  await card(page, 1).click();
  await expectStep(page, 10, 30);

  // A tap on the graph in the third step's range (30 s to 60 s of 60 s).
  const plot = await page.getByTestId('step-preview').getByTestId('shot-graph').boundingBox();
  const want = await expected(page, 30, 60);
  await page.mouse.click((want.left + want.right) / 2, plot!.y + plot!.height / 2);
  await expect(card(page, 2)).toHaveAttribute('data-open', 'true');
  await expectStep(page, 30, 60);

  // A step edited longer widens the light.
  await page.getByTestId('chip-2-seconds').locator('[data-step="plus"]').click();
  const seconds = Number(await page.getByTestId('step-preview').getAttribute('data-seconds'));
  expect(seconds).toBeGreaterThan(60);
  const last = seconds;
  await expectStep(page, 30, last);

  // The open step cut to no time has no span: nothing is lit.
  await page.getByTestId('chip-edit-2-seconds').click();
  await page.getByTestId('numpad-key-0').click();
  await page.getByTestId('numpad-confirm').click();
  await expect(selected(page)).toHaveCount(0);
  await card(page, 0).click();
  await expectStep(page, 0, 10);
});

test('the second step open: the screenshot', async ({ page }) => {
  await open(page);
  await card(page, 1).click();
  await expectStep(page, 10, 30);
  await page.screenshot({ path: 'docs/product/step-selected.png' });
});

test('the script tab lights nothing', async ({ page }) => {
  await open(page);
  await expect(selected(page)).toHaveCount(1);
  await page.getByTestId('tab-script').click();
  await expect(page.getByTestId('step-preview')).toBeVisible();
  await expect(page.getByTestId('step-selected')).toHaveCount(0);
});

test('the picker lights nothing', async ({ page }) => {
  await open(page, false);
  await page.getByTestId('open-profiles').click();
  await page.getByTestId('profile-item').filter({ hasText: 'My three' }).first().click();
  await expect(page.getByTestId('profile-preview').getByTestId('step-preview')).toBeVisible();
  await expect(page.getByTestId('step-selected')).toHaveCount(0);
});
