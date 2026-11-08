import { expect, test } from '@playwright/test';
import type { Profile } from '../src/api';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway } from './mock-gateway';

// The editor in glass: a chip on the graph glows in its quantity's colour once opened, the open
// step card has the glowing edge and the closed ones are plain glass, the fields and buttons have
// no fill. It writes test-results/editor-glass-*.png for the commit.

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

test('the graph editor: an opened chip glows in its quantity colour; the footer toggles are glass lines', async ({ page }) => {
  const gateway = (await mockGateway(page)).withDefaults('light');
  void gateway;
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();

  const chip = page.getByTestId('chip-graph-stopWeight');
  const before = await chip.evaluate((node) => getComputedStyle(node).boxShadow);
  expect(before).toBe('none');
  await chip.locator('.body').click();
  const lit = await chip.evaluate((node) => {
    const style = getComputedStyle(node);
    return { shadow: style.boxShadow, background: style.backgroundColor };
  });
  expect(lit.shadow).not.toBe('none');
  expect(lit.background).toBe('rgba(0, 0, 0, 0)');
  await page.screenshot({ path: 'test-results/editor-glass-chip.png' });

  const toggle = await page.getByTestId('toggle-second-fill').evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, width: style.borderTopWidth };
  });
  expect(toggle.background).toBe('rgba(0, 0, 0, 0)');
  expect(toggle.width).toBe('1px');
});

test('the step editor: the open card has the lit edge, a closed one the plain glass edge', async ({ page }) => {
  const mine: Profile = {
    ...structuredClone(blooming.find((entry) => entry.title === 'Blooming Espresso') as Profile),
    title: 'My blooming',
  };
  const gateway = await mockGateway(page);
  gateway.workflow.profile = structuredClone(mine);
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('step-card-0')).toHaveAttribute('data-open', 'true');

  const open = await page.getByTestId('step-card-0').evaluate((node) => {
    const style = getComputedStyle(node);
    return { shadow: style.boxShadow, image: style.backgroundImage };
  });
  const closed = await page.getByTestId('step-card-1').evaluate((node) => {
    const style = getComputedStyle(node);
    return { shadow: style.boxShadow, image: style.backgroundImage };
  });
  expect(open.shadow).not.toBe('none');
  expect(closed.shadow).toBe('none');
  expect(open.image).toContain('gradient');
  expect(closed.image).toContain('gradient');
  await page.screenshot({ path: 'test-results/editor-glass-steps.png' });
});
