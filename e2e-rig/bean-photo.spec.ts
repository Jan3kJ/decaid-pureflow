import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { BeanBatch, CatalogueBean, MachineSnapshot } from '../src/api';

// Acceptance item 54's photo (spec 3.9 item 20) against the rig: a bean added on the beans
// screen with a photo of a printed bag (the live camera answers with `e2e/fixtures/bag.png`)
// keeps the name and roaster typed (the photo is not read, spec 3.17 item 3); the photo is stored in
// the skin's KV namespace under the bean's id and shown when the bean is opened again. Deleted
// in Decaid (the skin only archives), the bean's photo is deleted at the next read of the
// catalogue: the namespace holds what it held before. The test deletes the bean and its bags.
// Without a gateway: e2e/bean-photo.spec.ts.

const GATEWAY = 'http://localhost:8080';
const SKIN = 'http://localhost:24800';
const NAMESPACE = '/api/v1/store/pureflow';
const ROASTER = 'pureflow-rig';
const BAG_URL = `data:image/png;base64,${readFileSync(new URL('../e2e/fixtures/bag.png', import.meta.url)).toString('base64')}`;

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(GATEWAY + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

const beans = () => api<CatalogueBean[]>('GET', '/api/v1/beans?includeArchived=true');
const keys = async () => ((await api<string[] | null>('GET', NAMESPACE)) ?? []).sort();

async function deleteBean(id: string) {
  // Decaid 0.8.8 refuses to delete a bean that still has bags (research.md 29.12).
  const bags = await api<BeanBatch[]>('GET', '/api/v1/bean-batches?includeArchived=true');
  for (const bag of bags.filter((candidate) => candidate.beanId === id)) await api('DELETE', `/api/v1/bean-batches/${bag.id}`);
  await api('DELETE', `/api/v1/beans/${id}`);
}

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('a bean with a photo: the fields as typed, the photo stored in KV and deleted with the bean', async ({ page, context }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const beansBefore = (await beans()).map((bean) => bean.id);
  const keysBefore = await keys();
  const foreign: string[] = [];
  context.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(SKIN) && !url.startsWith(GATEWAY) && !/^(data|blob):/.test(url)) foreign.push(url);
  });
  await page.addInitScript((url) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      const draw = () => context.drawImage(image, 0, 0);
      draw();
      setInterval(draw, 100);
      return canvas.captureStream(10);
    };
  }, BAG_URL);

  let added: CatalogueBean | undefined;
  try {
    await page.goto('/');
    await page.getByTestId('menu').click();
    await page.getByTestId('open-beans').click();
    await expect(page.getByTestId('screen-beans')).toBeVisible();
    await page.getByTestId('beans-add').click();
    // The photo fills no field: the name stays empty, the roaster as typed.
    await page.getByTestId('bean-roaster').fill(ROASTER);
    await page.getByTestId('bean-photo-take').click();
    await page.getByTestId('camera-capture').click();
    await expect(page.getByTestId('bean-photo')).toBeVisible();
    await expect(page.getByTestId('bean-name')).toHaveValue('');
    await expect(page.getByTestId('bean-roaster')).toHaveValue(ROASTER);
    await page.getByTestId('bean-name').fill('Red Brick');
    await page.getByTestId('bean-save').click();
    await expect.poll(async () => (await beans()).filter((bean) => !beansBefore.includes(bean.id)).length).toBe(1);
    added = (await beans()).find((bean) => !beansBefore.includes(bean.id))!;
    expect(added).toMatchObject({ name: 'Red Brick', roaster: ROASTER });

    const key = `bean-photo-${added.id}`;
    await expect.poll(keys).toContain(key);
    const stored = await api<string>('GET', `${NAMESPACE}/${key}`);
    expect(stored).toMatch(/^data:image\/jpeg;base64,/);

    // Opened again, the form shows the photo Decaid holds.
    await page.getByTestId('beans-add').click();
    await page.getByTestId('bean-row').filter({ hasText: ROASTER }).click();
    await expect(page.getByTestId('bean-photo')).toHaveAttribute('src', stored);

    // Deleted in Decaid, the bean's photo goes at the next read of the catalogue.
    await deleteBean(added.id);
    added = undefined;
    await page.reload();
    await expect(page.getByTestId('screen-beans')).toBeVisible();
    await expect.poll(keys, { timeout: 15_000 }).toEqual(keysBefore);
    expect(foreign).toEqual([]);
  } finally {
    if (added) await deleteBean(added.id).catch(() => undefined);
    for (const key of await keys()) {
      if (!keysBefore.includes(key)) await api('DELETE', `${NAMESPACE}/${key}`).catch(() => undefined);
    }
  }
  expect((await beans()).map((bean) => bean.id)).toEqual(beansBefore);
  expect(await keys()).toEqual(keysBefore);
});
