import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// Every measured curve and its glow, on home, steam and in the flow editor, is stroked in its quantity's plain colour
// from the first point: no gradient, so no fade at the left end of the time axis.

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

const QUANTITIES = ['flow', 'pressure', 'temperature', 'weight'];

/** Reads the stroke of every curve line and glow path under `scope`: the attribute, the style and the computed colour. */
async function strokes(scope: Locator) {
  return scope.locator('path.line, polyline.line, path.glow, polyline.glow').evaluateAll((elements, quantities) => {
    const probe = document.createElement('div');
    document.body.append(probe);
    const colour = (name: string) => {
      probe.style.color = `var(--${name})`;
      return getComputedStyle(probe).color;
    };
    const read = elements.map((element) => {
      const quantity = quantities.find((name) => element.classList.contains(name));
      return {
        quantity,
        attribute: element.getAttribute('stroke'),
        inline: (element as SVGElement).style.stroke,
        computed: getComputedStyle(element).stroke,
        expected: quantity ? colour(quantity) : null,
      };
    });
    probe.remove();
    return read;
  }, QUANTITIES);
}

async function expectPlain(scope: Locator, atLeast: number) {
  const read = await strokes(scope);
  expect(read.length).toBeGreaterThanOrEqual(atLeast);
  for (const stroke of read) {
    expect(stroke.quantity).toBeTruthy();
    expect(stroke.attribute ?? '').not.toContain('url(');
    expect(stroke.inline).not.toContain('url(');
    expect(stroke.computed).not.toContain('url(');
    expect(stroke.computed).toBe(stroke.expected);
  }
}

const noFadeGradient = (page: Page) => expect(page.locator('linearGradient[id*="fade"]')).toHaveCount(0);

test('home with a finished shot strokes its curves and glow in plain colours', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  await gateway.replay(page, 0, 1);
  const last = page.getByTestId('last-shot');
  await expect(last).toBeVisible();
  await expectPlain(last, 8);
  await noFadeGradient(page);
  // The left end of the shot, zoomed.
  const plot = (await last.getByTestId('shot-graph').boundingBox())!;
  await page.screenshot({
    path: 'test-results/graph-no-fade-left.png',
    clip: { x: plot.x, y: plot.y, width: plot.width / 4, height: plot.height },
  });
});

test('steam strokes its curves and glow in plain colours', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  await toPage(page, 'steam');
  gateway.steamReplay(0);
  await expect(page.getByTestId('steam-state')).toContainText('last steam');
  await expectPlain(page.getByTestId('screen-steam'), 2);
  await noFadeGradient(page);
});

test('the flow editor strokes its curves in plain colours', async ({ page }) => {
  (await mockGateway(page)).withDefaults('light');
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  const graph = page.getByTestId('graph');
  await expect(graph).toBeVisible();
  await expectPlain(graph, 3);
  await noFadeGradient(page);
});
