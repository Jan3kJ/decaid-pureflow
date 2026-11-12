import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway } from './mock-gateway';

// The script tab's graph picks a step like the cards tab's: a tap selects it, scrolls the list
// to centre it, lights it in the list and on the graph, and the cards tab shows it open.

const BASE = blooming.find((entry) => entry.title === 'Blooming Espresso') as Profile;
const MINE: Profile = {
  ...structuredClone(BASE),
  title: 'My ten',
  steps: Array.from({ length: 10 }, (_, index) => ({
    ...structuredClone(BASE.steps[index % BASE.steps.length]),
    name: `Step ${index + 1}`,
    seconds: 10,
  })),
};

async function open(page: Page) {
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
  await page.getByTestId('open-editor').click();
  await page.getByTestId('tab-script').click();
  await expect(page.getByTestId('script-step-9')).toBeAttached();
}

const step = (page: Page, index: number) => page.getByTestId(`script-step-${index}`);
const list = (page: Page) => page.getByTestId('script-steps');

/** A tap in the graph at the middle of step `index` (every step is a tenth of the axis). */
async function tapStep(page: Page, index: number) {
  const plot = (await page.getByTestId('step-preview').getByTestId('shot-graph').boundingBox())!;
  const rect = await page.getByTestId('step-preview').evaluate((preview, n) => {
    const svg = preview.querySelector('[data-testid="shot-graph"]')!;
    const grid = svg.querySelector('line.grid')!;
    const left = Number(grid.getAttribute('x1'));
    const right = Number(grid.getAttribute('x2'));
    const box = svg.getBoundingClientRect();
    return { from: box.left + left + ((right - left) * n) / 10, to: box.left + left + ((right - left) * (n + 1)) / 10 };
  }, index);
  await page.mouse.click((rect.from + rect.to) / 2, plot.y + plot.height / 2);
  return rect;
}

test('a tap on the sixth step scrolls it to the middle of the list and selects it', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('step-selected')).toHaveCount(0);
  for (let n = 0; n < 10; n++) await expect(step(page, n)).toHaveAttribute('aria-current', 'false');
  const before = await list(page).evaluate((el) => el.scrollTop);

  const span = await tapStep(page, 5);
  await expect(step(page, 5)).toHaveAttribute('aria-current', 'true');
  await expect(step(page, 4)).toHaveAttribute('aria-current', 'false');
  await expect
    .poll(async () => {
      const box = (await list(page).boundingBox())!;
      const at = (await step(page, 5).boundingBox())!;
      return Math.abs(at.y + at.height / 2 - (box.y + box.height / 2));
    })
    .toBeLessThanOrEqual(8);
  expect(await list(page).evaluate((el) => el.scrollTop)).not.toBe(before);

  const rect = (await page.getByTestId('step-selected').boundingBox())!;
  expect(Math.abs(rect.x - span.from)).toBeLessThanOrEqual(2);
  expect(Math.abs(rect.x + rect.width - span.to)).toBeLessThanOrEqual(2);

  await page.screenshot({ path: 'docs/product/script-step-scroll.png' });

  await page.getByTestId('tab-cards').click();
  await expect(page.getByTestId('step-card-5')).toHaveAttribute('data-open', 'true');
});

test('the first step stays at the top, fully visible; a chip selects its step; the cards tab selects back', async ({ page }) => {
  await open(page);
  await tapStep(page, 0);
  await expect(step(page, 0)).toHaveAttribute('aria-current', 'true');
  await page.waitForTimeout(500);
  expect(await list(page).evaluate((el) => el.scrollTop)).toBe(0);
  const box = (await list(page).boundingBox())!;
  const at = (await step(page, 0).boundingBox())!;
  expect(at.y).toBeGreaterThanOrEqual(box.y);
  expect(at.y + at.height).toBeLessThanOrEqual(box.y + box.height);

  await page.getByTestId('script-chip-3-pump').click();
  await expect(step(page, 3)).toHaveAttribute('aria-current', 'true');
  await expect(step(page, 0)).toHaveAttribute('aria-current', 'false');

  await page.getByTestId('tab-cards').click();
  await page.getByTestId('step-card-7').click();
  await page.getByTestId('tab-script').click();
  await expect(step(page, 7)).toHaveAttribute('aria-current', 'true');
});
