#!/usr/bin/env node
// Fits the shot model (src/steps/predict.ts) to a Decaid export and checks it on profiles the
// fit did not see.
//
//   node scripts/shot-model-fit.mjs <export .zip, its folder, or its shots.json>
//
// Writes src/steps/puck.ts (the constants), src/steps/fixtures/shots-model.json (ten held-out
// shots, one sample per 0.5 s, the measurements and the steps only) and three plots
// docs/product/shot-model-<n>.svg, and prints the check. The export stays out of the
// repository: nothing of its beans, notes or names is written.
//
// A shot recorded by the de1app and imported carries a `profileFrame` that only follows the
// steps' seconds, not their exits, so the samples are aligned to the frames by the targets the
// machine was given (`targetFlow` or `targetPressure`, the other -1): a step starts where the
// target changes to the next step's pump and value.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

// The skin's modules import each other without the '.ts' Node needs.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.\.?\//.test(specifier) && !/\.\w+$/.test(specifier) && context.parentURL?.endsWith('.ts')) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
const { predictShot } = await import('../src/steps/predict.ts');
const { stepCurve } = await import('../src/steps/curve.ts');
const { shotErrors, addSums, means, lengthFits, checkShots, modelAt, QUANTITIES } = await import('../src/steps/shot-check.ts');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = 20261025;
const THIN = 0.5;
const PER_PROFILE = 6;
const FIXTURE_SHOTS = 10;
const AFLOW_STEPS = [
  'Pre Fill',
  'Fill',
  'Infuse',
  '2nd Fill',
  'Pause',
  'Pressure Up',
  'Pressure Decline',
  'Flow Start',
  'Flow Extraction',
];

// ---- reading the export

function readShots(path) {
  if (!path || !existsSync(path)) {
    console.error('usage: node scripts/shot-model-fit.mjs <Decaid export .zip, its folder, or its shots.json>');
    process.exit(2);
  }
  if (statSync(path).isDirectory()) return JSON.parse(readFileSync(join(path, 'shots.json'), 'utf8'));
  if (path.endsWith('.json')) return JSON.parse(readFileSync(path, 'utf8'));
  const files = unzipSync(readFileSync(path), { filter: (file) => file.name.endsWith('shots.json') });
  const entry = Object.values(files)[0];
  if (!entry) throw new Error(`no shots.json in ${path}`);
  return JSON.parse(new TextDecoder().decode(entry));
}

/** A seeded random number generator (mulberry32), so the split and the picks repeat. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, next) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---- aligning a shot's samples to the machine's frames

/** The pump and target the machine was given in a sample, or null before the first frame. */
function machineTarget(machine) {
  if (machine.targetFlow >= 0 && machine.targetPressure < 0) return { pump: 'flow', value: machine.targetFlow };
  if (machine.targetPressure >= 0 && machine.targetFlow < 0) return { pump: 'pressure', value: machine.targetPressure };
  return null;
}

/**
 * How far a sample's target is from what a step asks for: 0 fits, 1 does not. A smooth step's
 * target moves until it reaches the goal, so one that stands still short of it fits a little
 * worse (0.3): a ramp from 3 bar would otherwise take the samples of the 3 bar step before it.
 */
function misfit(target, before, step, previousGoal) {
  if (!target) return 0;
  if (target.pump !== (step.pump === 'pressure' ? 'pressure' : 'flow')) return 1;
  const goal = Number(step.pump === 'pressure' ? step.pressure : step.flow);
  const tolerance = 0.3 + 0.05 * goal;
  if (step.transition === 'smooth') {
    const high = Math.max(goal, previousGoal, Number(step.limiter?.value ?? 0), Number(step.exit?.value ?? 0));
    if (target.value > high + tolerance) return 1;
    const moving = before?.pump === target.pump && Math.abs(before.value - target.value) > 0.01;
    return moving || Math.abs(target.value - goal) <= tolerance ? 0 : 0.3;
  }
  return Math.abs(target.value - goal) <= tolerance ? 0 : 1;
}

/**
 * The profile step each sample belongs to (its index in the profile), by dynamic programming:
 * the steps follow each other in order, one may be passed at once (an exit that holds at its
 * start), and the samples whose target does not fit their step are counted.
 */
function align(targets, profile) {
  const drawn = [...profile.steps.entries()].filter(([, step]) => Number(step.seconds) > 0);
  const k = drawn.length;
  if (!k) return null;
  const skip = 0.2;
  const goals = drawn.map(([, step]) => Number(step.pump === 'pressure' ? step.pressure : step.flow));
  const cost = (i, s) => misfit(targets[i], targets[i - 1], drawn[s][1], s > 0 ? goals[s - 1] : 0);
  let row = drawn.map((_, s) => cost(0, s) + skip * s);
  const back = [row.map(() => -1)];
  for (let i = 1; i < targets.length; i += 1) {
    const next = [];
    const from = [];
    let best = Infinity;
    let bestAt = -1;
    for (let s = 0; s < k; s += 1) {
      // the best earlier step to come from, with what passing the steps between costs
      let value = row[s];
      let at = s;
      if (bestAt >= 0 && best + skip * (s - bestAt - 1) < value) {
        value = best + skip * (s - bestAt - 1);
        at = bestAt;
      }
      next.push(value + cost(i, s));
      from.push(at);
      if (row[s] - skip * s < best - skip * bestAt || bestAt < 0) {
        best = row[s];
        bestAt = s;
      }
    }
    row = next;
    back.push(from);
  }
  let s = row.indexOf(Math.min(...row));
  let misfits = 0;
  const labels = new Array(targets.length);
  for (let i = targets.length - 1; i >= 0; i -= 1) {
    labels[i] = drawn[s][0];
    if (cost(i, s) >= 1) misfits += 1;
    if (i > 0) s = back[i][s];
  }
  return { labels, misfitShare: misfits / targets.length };
}

// ---- the shots the model is fitted to and checked on

function prepare(record) {
  const profile = record.workflow?.profile;
  const samples = record.measurements ?? [];
  if (!profile?.steps?.length || (profile.beverage_type ?? 'espresso') !== 'espresso') return null;
  if (/^cleaning/i.test(profile.title ?? '') || samples.length < 40) return null;
  const stopWeight = Number(profile.target_weight ?? 0);
  if (!(stopWeight > 0)) return null;
  // shots the de1app recorded: the target not driven is -1
  if (!samples.some((sample) => machineTarget(sample.machine))) return null;
  const start = Date.parse(samples[0].machine.timestamp);
  const times = samples.map((sample) => (Date.parse(sample.machine.timestamp) - start) / 1000);
  const seconds = times[times.length - 1];
  if (!(seconds >= 10 && seconds <= 120)) return null;
  const weights = samples.map((sample) => Number(sample.scale?.weight ?? 0));
  const last = weights[weights.length - 1];
  // stopped by the weight, with a scale: not stopped by hand or run without a cup on the scale
  if (last < 0.8 * stopWeight || last > 1.2 * stopWeight) return null;
  const picked = [];
  for (let i = 0, grid = 0; i < samples.length; i += 1) {
    if (times[i] + 1e-6 < grid) continue;
    picked.push(i);
    grid = Math.floor(times[i] / THIN + 1e-6) * THIN + THIN;
  }
  if (picked[picked.length - 1] !== samples.length - 1) picked.push(samples.length - 1);
  const alignment = align(
    picked.map((i) => machineTarget(samples[i].machine)),
    profile,
  );
  // the stored profile is not the one the machine ran
  if (!alignment || alignment.misfitShare > 0.1) return null;
  const round = (value) => Math.round(value * 100) / 100;
  const t = picked.map((i) => round(times[i]));
  return {
    title: profile.title,
    labels: alignment.labels,
    // the moment each step after the first starts in the shot, by its index in the profile
    starts: alignment.labels.flatMap((label, i) => (i > 0 && label !== alignment.labels[i - 1] ? [[label, t[i]]] : [])),
    shot: {
      profile: { title: profile.title, steps: profile.steps, target_weight: stopWeight },
      t,
      flow: picked.map((i) => round(samples[i].machine.flow)),
      pressure: picked.map((i) => round(samples[i].machine.pressure)),
      temperature: picked.map((i) => round(samples[i].machine.groupTemperature)),
      weight: picked.map((i) => round(weights[i])),
    },
  };
}

// ---- the fit

/** s, the scale of a step's start and the shot's end in the loss: 2 s late weighs as one sample 1 ml/s off, four times */
const TIME_SCALE = 2;
const TIME_WEIGHT = 4;

/**
 * Squared errors of the model against the shots: flow, pressure and weight, with the moments
 * the steps start (from the alignment) and the length; or the temperature alone.
 */
function loss(shots, puck, part) {
  let sum = 0;
  let count = 0;
  for (const { shot, starts } of shots) {
    const model = predictShot(shot.profile, puck);
    if (part !== 'temperature') {
      for (const [index, start] of starts) {
        const modelled = model.steps.find((span) => span.index >= index)?.start ?? model.seconds;
        sum += TIME_WEIGHT * ((modelled - start) / TIME_SCALE) ** 2;
      }
      sum += TIME_WEIGHT * ((model.seconds - shot.t[shot.t.length - 1]) / TIME_SCALE) ** 2;
    }
    for (const [i, time] of shot.t.entries()) {
      if (part === 'temperature') {
        sum += (modelAt(model, 'temperature', time) - shot.temperature[i]) ** 2;
      } else {
        sum += (modelAt(model, 'flow', time) - shot.flow[i]) ** 2;
        sum += (modelAt(model, 'pressure', time) - shot.pressure[i]) ** 2;
        sum += ((modelAt(model, 'weight', time) - shot.weight[i]) / 4) ** 2;
      }
      count += 1;
    }
  }
  return sum / count;
}

/** A plain Nelder-Mead search for the least of `f`, from `start`. */
function nelderMead(f, start, { scale = 0.3, iterations = 400 } = {}) {
  const n = start.length;
  let simplex = [start, ...start.map((_, i) => start.map((x, j) => (i === j ? x + scale : x)))].map((x) => ({
    x,
    y: f(x),
  }));
  const combine = (a, b, w) => a.map((value, i) => value + w * (b[i] - value));
  for (let it = 0; it < iterations; it += 1) {
    simplex.sort((a, b) => a.y - b.y);
    const best = simplex[0];
    const worst = simplex[n];
    if (Math.abs(worst.y - best.y) < 1e-6 * (1 + Math.abs(best.y))) break;
    const centre = start.map((_, i) => simplex.slice(0, n).reduce((sum, p) => sum + p.x[i], 0) / n);
    const reflected = combine(centre, worst.x, -1);
    const yr = f(reflected);
    if (yr < best.y) {
      const expanded = combine(centre, worst.x, -2);
      const ye = f(expanded);
      simplex[n] = ye < yr ? { x: expanded, y: ye } : { x: reflected, y: yr };
    } else if (yr < simplex[n - 1].y) {
      simplex[n] = { x: reflected, y: yr };
    } else {
      const contracted = combine(centre, worst.x, yr < worst.y ? -0.5 : 0.5);
      const yc = f(contracted);
      if (yc < Math.min(yr, worst.y)) simplex[n] = { x: contracted, y: yc };
      else simplex = simplex.map((p, i) => (i === 0 ? p : { x: combine(best.x, p.x, 0.5), y: f(combine(best.x, p.x, 0.5)) }));
    }
  }
  simplex.sort((a, b) => a.y - b.y);
  return simplex[0];
}

const HYDRAULIC = ['r0', 'r1', 'v0', 'headspace', 'flowLag', 'pressureLag', 'kept'];

function fit(train) {
  let puck = {
    r0: 0.3,
    r1: 4,
    v0: 20,
    headspace: 25,
    flowLag: 0.8,
    pressureLag: 0.8,
    kept: 30,
    temperatureOffset: -2,
    temperatureLag: 3,
  };
  const toPuck = (x) => ({ ...puck, ...Object.fromEntries(HYDRAULIC.map((key, i) => [key, Math.exp(x[i])])) });
  let best = { x: HYDRAULIC.map((key) => Math.log(puck[key])), y: Infinity };
  // two restarts from where the last search ended: Nelder-Mead stalls in a shrunken simplex
  for (let round = 0; round < 3; round += 1) {
    best = nelderMead((x) => loss(train, toPuck(x), 'hydraulic'), best.x, { scale: round ? 0.15 : 0.4 });
    console.log(`  hydraulic search ${round + 1}: loss ${best.y.toFixed(3)}`);
  }
  puck = toPuck(best.x);
  const toTemperature = (x) => ({ ...puck, temperatureOffset: x[0], temperatureLag: Math.exp(x[1]) });
  let temperature = { x: [puck.temperatureOffset, Math.log(puck.temperatureLag)], y: Infinity };
  for (let round = 0; round < 2; round += 1) {
    temperature = nelderMead((x) => loss(train, toTemperature(x), 'temperature'), temperature.x, { scale: 0.5 });
    console.log(`  temperature search ${round + 1}: loss ${temperature.y.toFixed(3)}`);
  }
  return toTemperature(temperature.x);
}

// ---- the report

const kindOf = (profile, index) => {
  const step = profile.steps[index];
  const aflow = profile.steps.every((s) => AFLOW_STEPS.includes(s.name));
  return aflow ? step.name : `${step.pump === 'pressure' ? 'pressure' : 'flow'} step, other profiles`;
};

function report(name, set, puck) {
  const result = checkShots(
    set.map(({ shot }) => shot),
    puck,
  );
  const lines = [`${name}: ${result.shots} shots of ${new Set(set.map((s) => s.title)).size} profiles`];
  for (const quantity of QUANTITIES) {
    const { model, target } = result.mae[quantity];
    lines.push(
      `  ${quantity.padEnd(12)} model ${model.toFixed(2)}, targets ${target.toFixed(2)}, ${(100 * (1 - model / target)).toFixed(1)} % below${result.passes[quantity] ? '' : '  (fails)'}`,
    );
  }
  const off = set.map(({ shot }) => predictShot(shot.profile, puck).seconds / shot.t[shot.t.length - 1] - 1).sort((a, b) => a - b);
  const quantile = (q) => `${(100 * off[Math.floor(q * (off.length - 1))]).toFixed(0)} %`;
  lines.push(
    `  length within 20 %: ${result.lengthWithin} of ${result.shots} (${((100 * result.lengthWithin) / result.shots).toFixed(0)} %)${result.passes.length ? '' : '  (fails)'}; model against real: median ${quantile(0.5)}, quartiles ${quantile(0.25)} and ${quantile(0.75)}`,
  );
  console.log(lines.join('\n'));
  return result;
}

function reportByKind(set, puck) {
  const totals = new Map();
  const lengths = { aflow: [0, 0], other: [0, 0] };
  for (const { shot, labels } of set) {
    const result = shotErrors(shot, puck, (i) => kindOf(shot.profile, labels[i]));
    for (const [kind, sums] of result.byKind) {
      if (!totals.has(kind)) totals.set(kind, structuredClone(emptyTotals));
      addSums(totals.get(kind), sums);
    }
    const group = shot.profile.steps.every((s) => AFLOW_STEPS.includes(s.name)) ? 'aflow' : 'other';
    lengths[group][0] += lengthFits(result) ? 1 : 0;
    lengths[group][1] += 1;
  }
  const order = [...AFLOW_STEPS, 'flow step, other profiles', 'pressure step, other profiles'];
  console.log('\nper step kind on the held-out shots (mean absolute error, model / targets; samples)');
  console.log('| step | flow, ml/s | pressure, bar | temperature, °C |');
  console.log('|---|---|---|---|');
  for (const kind of order.filter((k) => totals.has(k))) {
    const mean = means(totals.get(kind));
    const cell = (q) =>
      totals.get(kind)[q].count ? `${mean[q].model.toFixed(2)} / ${mean[q].target.toFixed(2)} (${totals.get(kind)[q].count})` : '–';
    console.log(`| ${kind} | ${cell('flow')} | ${cell('pressure')} | ${cell('temperature')} |`);
  }
  console.log(
    `\nlength within 20 %: A-Flow ${lengths.aflow[0]} of ${lengths.aflow[1]}, other profiles ${lengths.other[0]} of ${lengths.other[1]}`,
  );
}
const emptyTotals = Object.fromEntries(QUANTITIES.map((q) => [q, { model: 0, target: 0, count: 0 }]));

// ---- the plots

const COLOURS = { flow: '#4da3ff', pressure: '#3fcf8e', temperature: '#ff6b6b' };

function plot(shot, puck, caption) {
  const model = predictShot(shot.profile, puck);
  const curve = stepCurve(shot.profile);
  const width = 960;
  const height = 600;
  const left = 56;
  const right = 20;
  const end = Math.ceil(Math.max(shot.t[shot.t.length - 1], model.seconds) / 5) * 5;
  const x = (time) => left + ((width - left - right) * time) / end;
  const top = { y0: 60, y1: 380, min: 0, max: 12 };
  const temps = [...shot.temperature, ...model.temperature, ...curve.temperature];
  const bottom = {
    y0: 420,
    y1: 560,
    min: Math.floor(Math.min(...temps) - 1),
    max: Math.ceil(Math.max(...temps) + 1),
  };
  const y = (panel, value) =>
    panel.y1 - ((panel.y1 - panel.y0) * (Math.min(panel.max, Math.max(panel.min, value)) - panel.min)) / (panel.max - panel.min);
  const path = (times, values, panel) =>
    times
      .map((time, i) => (values[i] === null ? null : `${x(time).toFixed(1)},${y(panel, values[i]).toFixed(1)}`))
      .reduce((d, point, i, all) => (point === null ? d : `${d}${i && all[i - 1] !== null ? 'L' : 'M'}${point}`), '');
  const parts = [];
  for (const [quantity, panel] of [
    ['flow', top],
    ['pressure', top],
    ['temperature', bottom],
  ]) {
    const colour = COLOURS[quantity];
    parts.push(
      `<path d="${path(curve.t, curve[quantity], panel)}" stroke="${colour}" stroke-width="1.5" stroke-dasharray="2 4" fill="none"/>`,
      `<path d="${path(shot.t, shot[quantity], panel)}" stroke="${colour}" stroke-width="1.5" stroke-opacity="0.55" fill="none"/>`,
      `<path d="${path(model.t, model[quantity], panel)}" stroke="${colour}" stroke-width="3" fill="none"/>`,
    );
  }
  const grid = [];
  for (let time = 0; time <= end; time += 5) {
    grid.push(`<line x1="${x(time)}" y1="${top.y0}" x2="${x(time)}" y2="${bottom.y1}" stroke="#2a2e33"/>`);
    grid.push(`<text x="${x(time)}" y="${bottom.y1 + 18}" text-anchor="middle">${time}</text>`);
  }
  for (let value = 0; value <= top.max; value += 2) {
    grid.push(`<line x1="${left}" y1="${y(top, value)}" x2="${width - right}" y2="${y(top, value)}" stroke="#2a2e33"/>`);
    grid.push(`<text x="${left - 8}" y="${y(top, value) + 4}" text-anchor="end">${value}</text>`);
  }
  for (const value of [bottom.min, bottom.max]) {
    grid.push(`<text x="${left - 8}" y="${y(bottom, value) + 4}" text-anchor="end">${value}</text>`);
  }
  for (const span of model.steps.slice(1)) {
    grid.push(
      `<line x1="${x(span.start)}" y1="${top.y0}" x2="${x(span.start)}" y2="${bottom.y1}" stroke="#9aa3ad" stroke-dasharray="6 6" stroke-opacity="0.6"/>`,
    );
  }
  const legend =
    `<text x="${left}" y="28" font-size="16">${caption}</text>` +
    `<text x="${left}" y="50">flow ml/s <tspan fill="${COLOURS.flow}">blue</tspan>, pressure bar <tspan fill="${COLOURS.pressure}">green</tspan>, temperature °C <tspan fill="${COLOURS.temperature}">red</tspan>: thick the model, thin the real shot, dotted the targets; dashed the model's step starts</text>` +
    `<text x="${width - right}" y="${bottom.y1 + 36}" text-anchor="end">s</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif" font-size="12" fill="#9aa3ad">
<rect width="${width}" height="${height}" fill="#111315"/>
${grid.join('\n')}
${parts.join('\n')}
${legend}
</svg>
`;
}

// ---- the run

const began = Date.now();
const records = readShots(process.argv[2]);
const prepared = records.map(prepare).filter(Boolean);
console.log(`${records.length} shots in the export, ${prepared.length} usable (stopped by weight, aligned to the profile)`);

const next = random(SEED);
const titles = shuffled([...new Set(prepared.map((p) => p.title))].sort(), next);
const heldTitles = new Set(titles.slice(0, Math.ceil(titles.length / 3)));
const byTitle = new Map();
for (const p of prepared) byTitle.set(p.title, [...(byTitle.get(p.title) ?? []), p]);
const pick = (title) => shuffled(byTitle.get(title), next).slice(0, PER_PROFILE);
const train = titles.filter((t) => !heldTitles.has(t)).flatMap(pick);
const held = titles.filter((t) => heldTitles.has(t)).flatMap(pick);
console.log(
  `fit on ${train.length} shots of ${titles.length - heldTitles.size} profiles, check on ${held.length} shots of ${heldTitles.size} held-out profiles (at most ${PER_PROFILE} a profile)`,
);

{
  // how far the real shots of one profile spread around their own median length: the best one length a profile can do
  let within = 0;
  let count = 0;
  for (const shots of byTitle.values()) {
    if (shots.length < 5) continue;
    const lengths = shots.map(({ shot }) => shot.t[shot.t.length - 1]).sort((a, b) => a - b);
    const median = lengths[Math.floor(lengths.length / 2)];
    within += lengths.filter((length) => Math.abs(length - median) <= 0.2 * length).length;
    count += lengths.length;
  }
  console.log(
    `the real shots of a profile (5 or more): ${((100 * within) / count).toFixed(0)} % within 20 % of the profile's median length`,
  );
}

const puck = fit(train);
const rounded = Object.fromEntries(Object.entries(puck).map(([key, value]) => [key, Number(value.toPrecision(3))]));
console.log('\nthe puck:', JSON.stringify(rounded));
report('\nfit set', train, rounded);
const check = report('\nheld-out set (the check)', held, rounded);
reportByKind(held, rounded);

writeFileSync(
  join(root, 'src/steps/puck.ts'),
  `// Written by scripts/shot-model-fit.mjs; run it again rather than edit by hand.
import type { Puck } from './predict';

export const PUCK: Puck = {
${Object.entries(rounded)
  .map(([key, value]) => `  ${key}: ${value},`)
  .join('\n')}
};
`,
);

// ten held-out shots of ten profiles, the steps without names of their own
const fixtureTitles = shuffled([...heldTitles].sort(), random(SEED + 1)).slice(0, FIXTURE_SHOTS);
const fixture = fixtureTitles.map((title, n) => {
  const { shot } = shuffled(byTitle.get(title), random(SEED + 2 + n))[0];
  const aflow = shot.profile.steps.every((s) => AFLOW_STEPS.includes(s.name));
  return {
    ...shot,
    profile: {
      title: `held-out shot ${n + 1} (${aflow ? 'A-Flow' : 'other profile'})`,
      target_weight: shot.profile.target_weight,
      steps: shot.profile.steps.map((step, i) => ({ ...step, name: aflow ? step.name : `step ${i + 1}` })),
    },
  };
});
mkdirSync(join(root, 'src/steps/fixtures'), { recursive: true });
writeFileSync(join(root, 'src/steps/fixtures/shots-model.json'), `${JSON.stringify(fixture)}\n`);
const fixtureCheck = checkShots(fixture, rounded);
console.log(
  `\nfixture (${fixture.length} shots): flow ${fixtureCheck.mae.flow.model.toFixed(2)} / ${fixtureCheck.mae.flow.target.toFixed(2)}, pressure ${fixtureCheck.mae.pressure.model.toFixed(2)} / ${fixtureCheck.mae.pressure.target.toFixed(2)}, temperature ${fixtureCheck.mae.temperature.model.toFixed(2)} / ${fixtureCheck.mae.temperature.target.toFixed(2)}, lengths ${fixtureCheck.lengthWithin} of ${fixture.length}`,
);

for (const [n, shot] of fixture.slice(0, 3).entries()) {
  const model = predictShot(shot.profile, rounded);
  const kind = shot.profile.title.replace(/^held-out shot \d+ \((.*)\)$/, '$1');
  const caption = `Held-out shot ${n + 1}, ${kind}: real ${shot.t[shot.t.length - 1].toFixed(0)} s, model ${model.seconds.toFixed(0)} s, stop weight ${shot.profile.target_weight} g`;
  writeFileSync(join(root, `docs/product/shot-model-${n + 1}.svg`), plot(shot, rounded, caption));
}
if (process.argv.includes('--shots')) {
  // per held-out shot: the length and the moments the steps start, real against model
  for (const { shot, labels } of held) {
    const model = predictShot(shot.profile, rounded);
    const real = labels.flatMap((label, i) => (i === 0 || label !== labels[i - 1] ? [`${label}@${shot.t[i]}`] : []));
    const modelled = model.steps.map((span) => `${span.index}@${span.start.toFixed(1)}`);
    console.log(
      `${shot.t[shot.t.length - 1].toFixed(0)} s / ${model.seconds.toFixed(0)} s  real ${real.join(' ')}  model ${modelled.join(' ')}`,
    );
  }
}
const passed = Object.values(check.passes).every(Boolean);
console.log(`\n${passed ? 'the check passes' : 'the check fails'} (${((Date.now() - began) / 1000).toFixed(0)} s)`);
