import { describe, expect, it } from 'vitest';
import { DEFAULT_MACHINE_LIMITS, DEFAULT_PROFILES } from '../aflow';
import { buildCurve, type Curve, type PhaseId } from './curve';
import {
  durationFields,
  flowPath,
  laneLefts,
  mainTicks,
  offGroups,
  plotBox,
  plotProjection,
  polylinePoints,
  popupAt,
  secondsPerPixel,
  sharedMax,
  valuePerPixel,
} from './plot';

const rem = 16;
const box = plotBox(1000, 500, rem);
const temperature = { min: 80, max: 100 };

describe("the editor graph's plot", () => {
  it('puts the temperature band on top, a gap for the chips, pressure and flow below', () => {
    expect(box.left).toBe(2.8 * rem);
    expect(box.right).toBe(1000 - 1.2 * rem);
    expect(box.plotW).toBe(box.right - box.left);
    expect(box.top).toBe(1.8 * rem);
    expect(box.bottom).toBe(500 - 3.4 * rem);
    expect(box.tempBottom).toBe(box.top + box.tempH);
    expect(box.mainTop - box.tempBottom).toBeCloseTo(3.4 * rem);
    expect(box.gapMiddle).toBeCloseTo((box.tempBottom + box.mainTop) / 2);
    expect(box.mainH).toBeCloseTo(box.bottom - box.mainTop);
  });

  it('keeps a usable box on an empty graph', () => {
    const empty = plotBox(0, 0, rem);
    expect(empty.plotW).toBe(1);
    expect(empty.tempH).toBeGreaterThan(0);
    expect(empty.mainH).toBe(1);
  });

  it('shares one scale for pressure and flow, up to the maxima or a value above them', () => {
    const curve = { pressure: [{ x: 0, y: 4 }], flow: [[{ x: 0, y: 2 }]] };
    expect(sharedMax({ maxPressure: 10, maxFlow: 8 }, curve)).toBe(10);
    expect(sharedMax({ maxPressure: 10, maxFlow: 8 }, { ...curve, flow: [[{ x: 0, y: 12 }]] })).toBe(12);
    expect(mainTicks(10)).toEqual([0, 3, 6, 9]);
    expect(mainTicks(12)).toEqual([0, 3, 6, 9, 12]);
  });

  it('projects graph units across the plot and each line into its band', () => {
    const projection = plotProjection(box, temperature, 10);
    expect(projection.x(0)).toBe(box.left);
    expect(projection.x(100)).toBeCloseTo(box.right);
    expect(projection.y('pressure', 0)).toBe(box.bottom);
    expect(projection.y('flow', 10)).toBeCloseTo(box.mainTop);
    expect(projection.y('temperature', 80)).toBe(box.tempBottom);
    expect(projection.y('temperature', 100)).toBeCloseTo(box.top);
    expect(valuePerPixel('pressure', box, temperature, 10)).toBeCloseTo(10 / box.mainH);
    expect(valuePerPixel('temperature', box, temperature, 10)).toBeCloseTo(20 / box.tempH);
    expect(secondsPerPixel(2, { plotW: 400 })).toBe(0.5);
  });

  it('draws the lines, the flow with one subpath per stretch', () => {
    const projection = { x: (units: number) => units * 2, y: (_line: string, value: number) => 100 - value };
    expect(
      polylinePoints(
        [
          { x: 1, y: 2 },
          { x: 3, y: 4.25 },
        ],
        'pressure',
        projection,
      ),
    ).toBe('2.0,98.0 6.0,95.8');
    const path = flowPath(
      [
        [
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
        [{ x: 2, y: 0 }],
      ],
      projection,
    );
    expect(path).toBe('M0.0 99.0 L2.0 99.0 M4.0 100.0');
  });

  it("names each border's duration by the phase on its left", () => {
    const curve = buildCurve(DEFAULT_PROFILES[1].params, DEFAULT_MACHINE_LIMITS, 'detail');
    const durations = durationFields(curve);
    for (const border of curve.borders) expect(durations[border.phase]).toBe(border.field);
  });

  it('groups the phases that are off by where they collapsed', () => {
    const at = (id: PhaseId, x: number) => ({ id, x0: x, x1: x });
    const curve: Pick<Curve, 'off' | 'phases'> = {
      off: ['infuse', 'secondFill', 'pressurize'],
      phases: [at('fill', 0), at('infuse', 10), at('secondFill', 10), at('pressurize', 30), at('flow', 30)],
    };
    expect(offGroups(curve)).toEqual([
      [10, ['infuse', 'secondFill']],
      [30, ['pressurize']],
    ]);
    expect(offGroups({ off: [], phases: curve.phases })).toEqual([]);
  });

  it('puts the turn-on buttons at their border in the name row, clear of names and of each other', () => {
    // Free row: centred on the border.
    expect(laneLefts([{ x: 500, width: 100 }], [], 50, 950, 8)).toEqual([450]);
    // Pinned inside the plot's width.
    expect(laneLefts([{ x: 60, width: 100 }], [], 50, 950, 8)).toEqual([50]);
    expect(laneLefts([{ x: 940, width: 100 }], [], 50, 950, 8)).toEqual([850]);
    // Over a neighbour's name: the nearest free spot along the row.
    expect(laneLefts([{ x: 500, width: 100 }], [{ from: 520, to: 600 }], 50, 950, 8)).toEqual([412]);
    expect(laneLefts([{ x: 500, width: 100 }], [{ from: 400, to: 480 }], 50, 950, 8)).toEqual([488]);
    // Two groups close together: the second keeps clear of the first.
    const [a, b] = laneLefts(
      [
        { x: 300, width: 120 },
        { x: 330, width: 140 },
      ],
      [],
      50,
      950,
      8,
    );
    expect(a).toBe(240);
    expect(b).toBeGreaterThanOrEqual(a + 120 + 8);
    // No spot clear of the names: still clear of the other group.
    const tight = laneLefts(
      [
        { x: 100, width: 80 },
        { x: 120, width: 80 },
      ],
      [{ from: 0, to: 300 }],
      0,
      300,
      8,
    );
    expect(tight[1] - tight[0]).toBeGreaterThanOrEqual(88);
  });

  it('never lets two turn-on buttons overlap', () => {
    for (let x1 = 0; x1 <= 600; x1 += 37) {
      for (let x2 = x1; x2 <= 600; x2 += 41) {
        const groups = [
          { x: x1, width: 130 },
          { x: x2, width: 110 },
        ];
        const names = [
          { from: x1 - 60, to: x1 - 20 },
          { from: (x1 + x2) / 2 - 20, to: (x1 + x2) / 2 + 20 },
          { from: x2 + 30, to: x2 + 70 },
        ];
        const [a, b] = laneLefts(groups, names, 40, 590, 8);
        expect(a + 130 <= b || b + 110 <= a).toBe(true);
        for (const [left, width] of [
          [a, 130],
          [b, 110],
        ]) {
          expect(left).toBeGreaterThanOrEqual(40);
          expect(left + width).toBeLessThanOrEqual(590);
        }
      }
    }
  });

  it('keeps the pop-up on the graph and above the finger', () => {
    expect(popupAt(500, 300, 1000, rem)).toEqual({ left: 500, top: 300 - 4.2 * rem });
    expect(popupAt(0, 0, 1000, rem)).toEqual({ left: 7 * rem, top: 0.2 * rem });
    expect(popupAt(1000, 300, 1000, rem).left).toBe(1000 - 7 * rem);
  });
});
