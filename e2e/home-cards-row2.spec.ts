import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// Home's right column starts in the graph's row: the profile card's top edge is the graph
// frame's top edge, running and finished, and the title 'Home' is in the first row's right cell.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const box = async (page: Page, testid: string) => (await page.getByTestId(testid).boundingBox())!;

test('the profile card and the graph frame share a top edge with a long name and the pencil, running and finished; one h1 Home', async ({
  page,
}) => {
  const gateway = await mockGateway(page);
  gateway.workflow.profile = {
    ...gateway.workflow.profile,
    title: 'A-Flow 3.0 by a very long family name / a very long profile name that never fits into the column',
  };
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  await expect(page.getByTestId('open-editor')).toBeVisible();

  const tops = async () => {
    const profile = (await page.getByTestId('shot-column').locator('.profile').boundingBox())!;
    const frame = (await page.locator('[data-testid="home-shot"] [data-main-frame]').first().boundingBox())!;
    return { profile: profile.y, frame: frame.y };
  };
  const level = async () => {
    const { profile, frame } = await tops();
    expect(Math.abs(profile - frame)).toBeLessThanOrEqual(1);
  };
  await level();

  const title = page.getByRole('heading', { name: 'Home', level: 1 });
  await expect(title).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  // The title is in the first row's right cell: right of the header, above the column, same top as the graph's row above it.
  const own = (await title.boundingBox())!;
  const column = await box(page, 'shot-column');
  expect(own.x).toBeGreaterThanOrEqual(column.x - 1);
  expect(own.y + own.height).toBeLessThanOrEqual(column.y);

  await gateway.replay(page, 0, 0.6);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'running');
  await level();
  await page.screenshot({ path: 'docs/product/home-cards-row2-running.png' });

  await gateway.replay(page, 0.6, 1);
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');
  await expect(page.getByTestId('shot-phases')).toBeVisible();
  await level();
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toHaveCount(1);
  await page.screenshot({ path: 'docs/product/home-cards-row2-finished.png' });
  expect(errors).toEqual([]);
});
