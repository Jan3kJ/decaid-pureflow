import { expect, test, type Page } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';

// A water volume in the workflow replaces the loaded profile's target volume; only another app
// sets it, so a load asks first, against a mocked gateway.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function withVolume(page: Page, volume: number): Promise<MockGateway> {
  const gateway = await mockGateway(page);
  gateway.workflow.context = { ...gateway.workflow.context, targetWaterVolume: volume };
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  await page.getByTestId('profile-item').filter({ hasText: 'A-Flow / default-dark' }).click();
  await page.getByTestId('load-profile').click();
  return gateway;
}

test('clearing the water volume before a load sets it to null, and the profile then loads', async ({ page }) => {
  const gateway = await withVolume(page, 55);
  await expect(page.getByTestId('volume-value')).toHaveText('55 ml');
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(0);
  await page.getByTestId('volume-clear').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const puts = gateway.calls('PUT', '/api/v1/workflow');
  expect(puts).toHaveLength(2);
  expect(puts[0].body).toEqual({ context: { targetWaterVolume: null } });
  expect(puts[1].body.context).toMatchObject({ targetYield: 36 });
  expect(gateway.workflow.context).not.toHaveProperty('targetWaterVolume');
});

test('keeping the water volume loads the profile and does not ask again for the same value; cancel loads nothing', async ({
  page,
}) => {
  const gateway = await withVolume(page, 0);
  await expect(page.getByTestId('volume-value')).toHaveText('off');
  await page.getByTestId('volume-cancel').click();
  await expect(page.getByTestId('volume-dialog')).toHaveCount(0);
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  expect(gateway.calls('PUT', '/api/v1/workflow')).toHaveLength(0);

  await page.getByTestId('load-profile').click();
  await page.getByTestId('volume-keep').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  const puts = gateway.calls('PUT', '/api/v1/workflow');
  expect(puts).toHaveLength(1);
  expect(puts[0].body.context).toMatchObject({ targetYield: 36 });
  expect(gateway.workflow.context).toMatchObject({ targetWaterVolume: 0 });

  await page.getByTestId('open-profiles').click();
  await page.getByTestId('profile-item').filter({ hasText: 'A-Flow / default-light' }).click();
  await page.getByTestId('load-profile').click();
  await expect(page.getByTestId('screen-home')).toBeVisible();
  await expect(page.getByTestId('volume-dialog')).toHaveCount(0);
});
