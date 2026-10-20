import { describe, expect, it } from 'vitest';
import type { BeanBatch, CatalogueBean, DecaidClient, Grinder } from '../api';
import {
  addBean,
  batchPatch,
  beanForm,
  beanPatch,
  currentBatch,
  currentBeanContext,
  dateOf,
  grinderForm,
  grinderInput,
  grinderPatch,
  newBag,
  pickContext,
  pickedBean,
  pickedGrinder,
  positionsOf,
  roasters,
  saveBean,
  search,
  selectableBeans,
  stepSetting,
  validBean,
  validGrinder,
} from './catalogue';

const bean = (id: string, name: string, roaster: string, more: Partial<CatalogueBean> = {}): CatalogueBean => ({
  id,
  name,
  roaster,
  decaf: false,
  archived: false,
  createdAt: `2026-10-0${id.slice(-1)}T10:00:00.000`,
  updatedAt: '2026-10-20T10:00:00.000',
  ...more,
});

const batch = (id: string, beanId: string, createdAt: string, more: Partial<BeanBatch> = {}): BeanBatch => ({
  id,
  beanId,
  frozen: false,
  archived: false,
  createdAt,
  updatedAt: createdAt,
  ...more,
});

const grinder = (id: string, model: string, more: Partial<Grinder> = {}): Grinder => ({
  id,
  model,
  archived: false,
  settingType: 'numeric',
  createdAt: '2026-10-01T10:00:00.000',
  updatedAt: '2026-10-01T10:00:00.000',
  ...more,
});

const RED = bean('b1', 'Red Brick', 'Square Mile', { notes: 'chocolate', country: 'Brazil' });
const BAGS = [
  batch('old', 'b1', '2026-10-01T10:00:00.000', { roastDate: '2026-09-20T00:00:00.000' }),
  batch('new', 'b1', '2026-10-10T10:00:00.000', { roastDate: '2026-10-08T00:00:00.000' }),
  batch('done', 'b1', '2026-10-15T10:00:00.000', { archived: true }),
  batch('other', 'b2', '2026-10-16T10:00:00.000'),
];

/** A client that records the catalogue's writes and answers them with ids of its own. */
function fakeClient() {
  const calls: string[] = [];
  const bodies: unknown[] = [];
  let n = 0;
  const answer = <T>(call: string, body: object, value: T): Promise<T> => {
    calls.push(call);
    bodies.push(body);
    return Promise.resolve(value);
  };
  const client = {
    createBean: (body: object) => answer('POST bean', body, { ...bean('b9', '', ''), ...body }),
    updateBean: (id: string, body: object) => answer(`PUT bean ${id}`, body, RED),
    createBatch: (beanId: string, body: object) => answer(`POST batch of ${beanId}`, body, batch(`batch${++n}`, beanId, 'now', body)),
    updateBatch: (id: string, body: object) => answer(`PUT batch ${id}`, body, BAGS[0]),
  } as unknown as DecaidClient;
  return { client, calls, bodies };
}

describe('the catalogue', () => {
  it("a bean's current bag is its newest batch that is not archived", () => {
    expect(currentBatch(BAGS, 'b1')?.id).toBe('new');
    expect(currentBatch(BAGS, 'b2')?.id).toBe('other');
    expect(currentBatch(BAGS, 'b3')).toBeNull();
  });

  it('offers the beans that are not archived', () => {
    expect(selectableBeans([RED, bean('b2', 'Old', 'X', { archived: true })])).toEqual([RED]);
  });

  it("names a bean's batch only when the batch is the bean's", () => {
    expect(currentBeanContext(RED, BAGS[1])).toEqual({ beanBatchId: 'new', coffeeName: 'Red Brick', coffeeRoaster: 'Square Mile' });
    expect(currentBeanContext(RED, BAGS[3])).toBeNull();
    expect(currentBeanContext(null, BAGS[1])).toBeNull();
  });

  it('searches every word without case, and lists the roasters once', () => {
    const beans = [RED, bean('b2', 'Hometown', 'Square Mile'), bean('b3', 'Gesha', 'Tim Wendelboe')];
    expect(search(beans, 'square BRICK', (b) => `${b.roaster} ${b.name}`)).toEqual([RED]);
    expect(search(beans, '  ', (b) => b.name)).toHaveLength(3);
    expect(roasters(beans)).toEqual(['Square Mile', 'Tim Wendelboe']);
  });
});

describe('the bean form', () => {
  it("shows the bean and its bag's roast date as a date", () => {
    expect(beanForm(RED, BAGS[1])).toEqual({ name: 'Red Brick', roaster: 'Square Mile', roastDate: '2026-10-08', notes: 'chocolate' });
    expect(beanForm(null, null)).toEqual({ name: '', roaster: '', roastDate: '', notes: '' });
    expect(dateOf('2026-10-01')).toBe('2026-10-01');
    expect(dateOf(null)).toBe('');
  });

  it('needs a name and a roaster', () => {
    expect(validBean({ name: 'x', roaster: ' ', roastDate: '', notes: '' })).toBe(false);
    expect(validBean({ name: 'x', roaster: 'y', roastDate: '', notes: '' })).toBe(true);
  });

  it("an edit's body holds only what changed; empty notes clear them", () => {
    const form = beanForm(RED, BAGS[1]);
    expect(beanPatch(RED, form)).toEqual({});
    expect(beanPatch(RED, { ...form, name: ' Red Brick 2 ', notes: '' })).toEqual({ name: 'Red Brick 2', notes: null });
    expect(batchPatch(BAGS[1], form)).toBeNull();
    expect(batchPatch(BAGS[1], { ...form, roastDate: '2026-10-09' })).toEqual({ roastDate: '2026-10-09' });
    expect(batchPatch(BAGS[1], { ...form, roastDate: '' })).toEqual({ roastDate: null });
  });

  it('a new bean is two requests: the bean, then its first bag', async () => {
    const { client, calls, bodies } = fakeClient();
    const added = await addBean(client, { name: ' Red Brick ', roaster: 'Square Mile', roastDate: '2026-10-08', notes: '' });
    expect(calls).toEqual(['POST bean', 'POST batch of b9']);
    expect(bodies).toEqual([{ name: 'Red Brick', roaster: 'Square Mile' }, { roastDate: '2026-10-08' }]);
    expect(added.batch.beanId).toBe('b9');
    await addBean(client, { name: 'x', roaster: 'y', roastDate: '', notes: 'n' });
    expect(bodies.slice(2)).toEqual([{ name: 'x', roaster: 'y', notes: 'n' }, {}]);
  });

  it('saves only what changed, and gives a bean without a bag one for a roast date', async () => {
    const { client, calls } = fakeClient();
    await saveBean(client, RED, BAGS[1], beanForm(RED, BAGS[1]));
    expect(calls).toEqual([]);
    await saveBean(client, RED, BAGS[1], { ...beanForm(RED, BAGS[1]), notes: 'cocoa', roastDate: '2026-10-09' });
    expect(calls).toEqual(['PUT bean b1', 'PUT batch new']);
    calls.length = 0;
    await saveBean(client, RED, null, { ...beanForm(RED, null), roastDate: '2026-10-09' });
    expect(calls).toEqual(['POST batch of b1']);
  });

  it('a new bag archives the current one and starts the next', async () => {
    const { client, calls, bodies } = fakeClient();
    await newBag(client, 'b1', BAGS[1]);
    expect(calls).toEqual(['PUT batch new', 'POST batch of b1']);
    expect(bodies).toEqual([{ archived: true }, {}]);
  });
});

describe('the grinder form', () => {
  it('takes a model, a step or named positions', () => {
    const form = grinderForm(null);
    expect(form).toEqual({ model: '', burrs: '', settingType: 'numeric', smallStep: 1, positions: '', notes: '' });
    expect(validGrinder(form)).toBe(false);
    expect(validGrinder({ ...form, model: 'Niche' })).toBe(true);
    expect(validGrinder({ ...form, model: 'Niche', settingType: 'preset', positions: ' , ' })).toBe(false);
    expect(positionsOf('fine, medium,,coarse ')).toEqual(['fine', 'medium', 'coarse']);
    expect(grinderInput({ ...form, model: ' Niche ', smallStep: 0.5 })).toEqual({
      model: 'Niche',
      settingType: 'numeric',
      settingSmallStep: 0.5,
    });
  });

  it("an edit's body holds only what changed", () => {
    const niche = grinder('g1', 'Niche', { burrs: '63 mm conical', settingSmallStep: 0.5, burrSize: 63 });
    const form = grinderForm(niche);
    expect(grinderPatch(niche, form)).toEqual({});
    expect(grinderPatch(niche, { ...form, notes: 'zeroed', smallStep: 1 })).toEqual({ notes: 'zeroed', settingSmallStep: 1 });
    expect(grinderPatch(niche, { ...form, settingType: 'preset', positions: 'a, b' })).toEqual({
      settingType: 'preset',
      settingValues: ['a', 'b'],
    });
  });
});

describe('the pick for the next shot', () => {
  const niche = grinder('g1', 'Niche', { settingSmallStep: 0.5 });

  it('is one patch of the context with the bean, its bag, the grinder and the setting', () => {
    expect(pickContext({ bean: RED, batch: BAGS[1], grinder: niche, setting: '12.5' })).toEqual({
      coffeeName: 'Red Brick',
      coffeeRoaster: 'Square Mile',
      beanBatchId: 'new',
      grinderId: 'g1',
      grinderModel: 'Niche',
      grinderSetting: '12.5',
    });
  });

  it("'no bean' and no grinder are nulls, which clear them", () => {
    expect(pickContext({ bean: null, batch: null, grinder: null, setting: '' })).toEqual({
      coffeeName: null,
      coffeeRoaster: null,
      beanBatchId: null,
      grinderId: null,
      grinderModel: null,
      grinderSetting: null,
    });
  });

  it('names a bean without a bag by name and roaster only', () => {
    expect(pickContext({ bean: RED, batch: null, grinder: null, setting: '5' })).toMatchObject({
      coffeeName: 'Red Brick',
      coffeeRoaster: 'Square Mile',
      beanBatchId: null,
    });
  });

  it('finds the picked bean by its batch, else by name and roaster', () => {
    const beans = [RED, bean('b2', 'Hometown', 'Square Mile')];
    expect(pickedBean(beans, BAGS, { beanBatchId: 'done' })?.id).toBe('b1');
    expect(pickedBean(beans, BAGS, { coffeeName: 'Hometown', coffeeRoaster: 'Square Mile' })?.id).toBe('b2');
    expect(pickedBean(beans, BAGS, { coffeeName: 'Rig Bean A', coffeeRoaster: 'Rig' })).toBeNull();
    expect(pickedBean(beans, BAGS, {})).toBeNull();
  });

  it('finds the grinder by id or model; the only one when none is named', () => {
    const other = grinder('g2', 'EK43');
    expect(pickedGrinder([niche, other], { grinderId: 'g2' })?.id).toBe('g2');
    expect(pickedGrinder([niche, other], { grinderModel: 'Niche' })?.id).toBe('g1');
    expect(pickedGrinder([niche, other], {})).toBeNull();
    expect(pickedGrinder([niche, { ...other, archived: true }], {})?.id).toBe('g1');
    expect(pickedGrinder([niche], { grinderModel: 'Rig Grinder' })).toBeNull();
  });

  it('steps a numeric setting by the small step, not below 0', () => {
    expect(stepSetting(niche, '12', 1)).toBe('12.5');
    expect(stepSetting(niche, '12.5', -1)).toBe('12.0');
    expect(stepSetting(null, '5.2', 1)).toBe('6.2');
    expect(stepSetting(null, null, 1)).toBe('1');
    expect(stepSetting(niche, 'fine', 1)).toBe('0.5');
    expect(stepSetting(niche, '0', -1)).toBe('0.0');
  });

  it('steps through named positions, stopping at both ends', () => {
    const preset = grinder('g3', 'Hand', { settingType: 'preset', settingValues: ['fine', 'medium', 'coarse'] });
    expect(stepSetting(preset, 'fine', 1)).toBe('medium');
    expect(stepSetting(preset, 'coarse', 1)).toBe('coarse');
    expect(stepSetting(preset, 'fine', -1)).toBe('fine');
    expect(stepSetting(preset, '5.2', 1)).toBe('fine');
  });
});
