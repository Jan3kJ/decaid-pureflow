import { describe, expect, it } from 'vitest';
import { isScaleSnapshot, type MachineSnapshot, type MachineState, type ScaleFrame } from '../api';
// A simulated shot recorded on the rig (Decaid 0.8.8, A-Flow / default-medium, target 36 g),
// with 34.1 g left on the scale when it started.
import recording from '../../e2e/fixtures/shot.json';
import {
  SETTLE_S,
  TARE_SETTLE_S,
  frameTime,
  recordFrame,
  runningStep,
  settleWeight,
  shotOver,
  shotSeconds,
  shotWeight,
  waterMoves,
  type Shot,
} from './shot';

function frame(state: MachineState, time: string, over: Partial<MachineSnapshot> = {}, substate = 'pouring'): MachineSnapshot {
  return {
    timestamp: `2026-10-13T06:37:${time}`,
    state: { state, substate },
    flow: 2,
    pressure: 9,
    targetFlow: 0,
    targetPressure: 0,
    mixTemperature: 90,
    groupTemperature: 92,
    targetMixTemperature: 93,
    targetGroupTemperature: 93,
    profileFrame: 0,
    steamTemperature: 150,
    ...over,
  };
}

describe('recordFrame', () => {
  it('has no shot while the machine is idle', () => {
    expect(recordFrame(null, frame('idle', '10.000'), 0)).toBeNull();
  });

  it('starts a shot with the first espresso frame, at 0 s', () => {
    const shot = recordFrame(null, frame('espresso', '10.000', { pressure: 0.5, flow: 3 }), 0)!;
    expect(shot.ended).toBe(false);
    expect(shot.series).toEqual({
      t: [0],
      pressure: [0.5],
      flow: [3],
      weight: [null],
      weightFlow: [null],
      temperature: [92],
      targetPressure: [null],
      targetFlow: [null],
      targetTemperature: [93],
    });
  });

  it('adds one point per frame, with the time from the timestamps', () => {
    let shot = recordFrame(null, frame('espresso', '10.000'), 0);
    shot = recordFrame(shot, frame('espresso', '10.500', { pressure: 1 }), 0);
    shot = recordFrame(shot, frame('espresso', '12.250', { pressure: 2, groupTemperature: 93 }), 4.5);
    expect(shot!.series.t).toEqual([0, 0.5, 2.25]);
    expect(shot!.series.pressure).toEqual([9, 1, 2]);
    expect(shot!.series.temperature).toEqual([92, 92, 93]);
    expect(shotSeconds(shot)).toBe(2.25);
  });

  it('does not change the shot it was given', () => {
    const first = recordFrame(null, frame('espresso', '10.000'), 0)!;
    const second = recordFrame(first, frame('espresso', '10.100'), 0)!;
    expect(first.series.t).toEqual([0]);
    expect(second.series.t).toHaveLength(2);
  });

  it('leaves the weight out until the tare has settled', () => {
    let shot = recordFrame(null, frame('espresso', '10.000'), 34.1);
    shot = recordFrame(shot, frame('espresso', '10.400'), 34.1);
    shot = recordFrame(shot, frame('espresso', `${10 + TARE_SETTLE_S}.000`), 0);
    shot = recordFrame(shot, frame('espresso', '15.000'), 3.2);
    expect(shot!.series.weight).toEqual([null, null, 0, 3.2]);
    expect(shotWeight(shot)).toBe(3.2);
  });

  it('records the weight flow of the scale next to the weight, with the same gaps', () => {
    let shot = recordFrame(null, frame('espresso', '10.000'), 34.1, -12);
    shot = recordFrame(shot, frame('espresso', `${10 + TARE_SETTLE_S}.000`), 0, 0);
    shot = recordFrame(shot, frame('espresso', '15.000'), 3.2, 1.8);
    shot = recordFrame(shot, frame('espresso', '16.000'), null, 1.8);
    // The weight flow is drawn, the weight stays the number (founder, 2026-10-14).
    expect(shot!.series.weightFlow).toEqual([null, 0, 1.8, null]);
    expect(shot!.series.weight).toEqual([null, 0, 3.2, null]);
  });

  it('has no weight without a scale', () => {
    let shot = recordFrame(null, frame('espresso', '10.000'), null);
    shot = recordFrame(shot, frame('espresso', '13.000'), null);
    expect(shot!.series.weight).toEqual([null, null]);
    expect(shot!.series.weightFlow).toEqual([null, null]);
    expect(shotWeight(shot)).toBeNull();
  });

  it('ends the shot with the first frame of another state and keeps its graph', () => {
    let shot = recordFrame(null, frame('espresso', '10.000'), 0);
    shot = recordFrame(shot, frame('espresso', '12.000'), 5);
    const ended = recordFrame(shot, frame('idle', '12.100'), 5.2)!;
    expect(ended.ended).toBe(true);
    expect(ended.series).toEqual(shot!.series);
    // Later idle frames change nothing.
    expect(recordFrame(ended, frame('idle', '13.000'), 6)).toBe(ended);
  });

  it('ends the shot at its first frame after the pour: the tail in espresso adds nothing and the timer stands', () => {
    // A real DE1 after the stop (spec 3.8, the founder's screenshot of 2026-10-17): still in
    // espresso, substate pouringDone, the pressure falls and the pump drives the flow to 4 ml/s.
    let shot = recordFrame(null, frame('espresso', '10.000'), 0);
    shot = recordFrame(shot, frame('espresso', '40.000'), 36);
    const ended = recordFrame(shot, frame('espresso', '40.100', { pressure: 0.6, flow: 3 }, 'pouringDone'), 36.1)!;
    expect(ended.ended).toBe(true);
    expect(ended.series).toEqual(shot!.series);
    expect(shotSeconds(ended)).toBe(30);
    let tail = ended;
    for (let s = 41; s <= 45; s += 1) {
      tail = recordFrame(tail, frame('espresso', `${s}.000`, { pressure: 0.5, flow: 4, targetFlow: 4 }, 'pouringDone'), 36.5)!;
      // Neither a point nor a new shot, also when a frame of the tail says pouring again.
      tail = recordFrame(tail, frame('espresso', `${s}.500`, { flow: 4 }, 'pouring'), 36.5)!;
    }
    expect(tail).toBe(ended);
    expect(shotSeconds(tail)).toBe(30);
    // Leaving espresso changes nothing on the graph; the next espresso is a new shot.
    const idle = recordFrame(tail, frame('idle', '46.000'), 36.5)!;
    expect(idle.series).toEqual(shot!.series);
    expect(idle.ended).toBe(true);
    const next = recordFrame(idle, frame('espresso', '50.000', { pressure: 4 }), 0)!;
    expect(next.ended).toBe(false);
    expect(next.series.pressure).toEqual([4]);
  });

  it('knows the frames in which the shot is over', () => {
    expect(shotOver(frame('espresso', '1.000', {}, 'pouring'))).toBe(false);
    expect(shotOver(frame('espresso', '1.000', {}, 'preparingForShot'))).toBe(false);
    expect(shotOver(frame('espresso', '1.000', {}, 'pouringDone'))).toBe(true);
    expect(shotOver(frame('espresso', '1.000', {}, 'ending'))).toBe(true);
    expect(shotOver(frame('idle', '1.000', {}, 'idle'))).toBe(true);
  });

  it('starts no shot in the tail of one it never saw', () => {
    expect(recordFrame(null, frame('espresso', '1.000', {}, 'pouringDone'), 0)).toBeNull();
  });

  it('replaces a finished shot when the next one starts', () => {
    let shot = recordFrame(null, frame('espresso', '10.000'), 0);
    shot = recordFrame(shot, frame('idle', '11.000'), 0);
    shot = recordFrame(shot, frame('espresso', '40.000', { pressure: 4 }), 0);
    expect(shot!.ended).toBe(false);
    expect(shot!.series.t).toEqual([0]);
    expect(shot!.series.pressure).toEqual([4]);
  });

  /** A real DE1 heats in state espresso before water moves: 6 s of `preparingForShot`. */
  function heated(): Shot | null {
    let shot: Shot | null = null;
    for (let s = 10; s < 16; s += 1) {
      const over = { pressure: 0, flow: 0, groupTemperature: 88 + s - 10 };
      shot = recordFrame(shot, frame('espresso', `${s}.000`, over, 'preparingForShot'), 34.1);
    }
    return shot;
  }

  it('draws nothing and runs no timer while the machine heats before the water', () => {
    const shot = heated()!;
    expect(shot.ended).toBe(false);
    expect(shot.startedAt).toBeNull();
    expect(shot.series.t).toEqual([]);
    expect(shotSeconds(shot)).toBe(0);
  });

  it('starts the graph and the timer at the first frame in which water moves', () => {
    let shot = heated();
    shot = recordFrame(shot, frame('espresso', '16.000', { pressure: 0.3, flow: 4 }, 'preinfusion'), 0);
    shot = recordFrame(shot, frame('espresso', '18.500', { pressure: 2, flow: 6 }, 'preinfusion'), 1.5);
    shot = recordFrame(shot, frame('espresso', '25.000', { pressure: 9, flow: 2 }, 'pouring'), 12);
    expect(shot!.series.t).toEqual([0, 2.5, 9]);
    expect(shot!.series.pressure).toEqual([0.3, 2, 9]);
    expect(shotSeconds(shot)).toBe(9);
    // The tare is long settled: it counts from the first espresso frame, not from the water.
    expect(shot!.series.weight).toEqual([0, 1.5, 12]);
  });

  it('keeps every frame once water has moved, also one that says preparingForShot again, until the pour is done', () => {
    let shot = heated();
    shot = recordFrame(shot, frame('espresso', '16.000', {}, 'preinfusion'), 0);
    shot = recordFrame(shot, frame('espresso', '17.000', {}, 'preparingForShot'), 0);
    shot = recordFrame(shot, frame('espresso', '18.000', {}, 'pouring'), 0);
    shot = recordFrame(shot, frame('espresso', '19.000', {}, 'pouringDone'), 0);
    expect(shot!.series.t).toEqual([0, 1, 2]);
    expect(shot!.ended).toBe(true);
  });

  it('ends a shot that never moved water with an empty graph', () => {
    const ended = recordFrame(heated(), frame('idle', '17.000', {}, 'idle'), 0)!;
    expect(ended.ended).toBe(true);
    expect(ended.series.t).toEqual([]);
  });

  it('knows which substates move water', () => {
    expect(waterMoves(frame('espresso', '10.000', {}, 'preparingForShot'))).toBe(false);
    expect(waterMoves(frame('espresso', '10.000', {}, 'idle'))).toBe(false);
    for (const substate of ['preinfusion', 'pouring', 'pouringDone']) {
      expect(waterMoves(frame('espresso', '10.000', {}, substate))).toBe(true);
    }
    expect(waterMoves(frame('steam', '10.000', {}, 'pouring'))).toBe(false);
  });

  it('keeps the targets of the frames, and a target of 0 as a gap', () => {
    let shot = recordFrame(null, frame('espresso', '10.000', { targetFlow: 8, targetPressure: 0, targetGroupTemperature: 93 }), 0);
    shot = recordFrame(shot, frame('espresso', '11.000', { targetFlow: 0, targetPressure: 9, targetGroupTemperature: 92 }), 0);
    shot = recordFrame(shot, frame('espresso', '12.000', { targetFlow: 0, targetPressure: 0, targetGroupTemperature: 0 }), 0);
    expect(shot!.series.targetFlow).toEqual([8, null, null]);
    expect(shot!.series.targetPressure).toEqual([null, 9, null]);
    expect(shot!.series.targetTemperature).toEqual([93, 92, null]);
  });

  it('never draws to the left when a timestamp steps back', () => {
    let shot = recordFrame(null, frame('espresso', '10.000'), 0);
    shot = recordFrame(shot, frame('espresso', '12.000'), 0);
    shot = recordFrame(shot, frame('espresso', '11.000'), 0);
    expect(shot!.series.t).toEqual([0, 2, 2]);
  });
});

describe('the finished shot’s weight (spec 3.14 item 9)', () => {
  const at = (seconds: number) => frameTime(`2026-10-13T06:37:${seconds.toFixed(3).padStart(6, '0')}`);

  /** A shot of 10 s with the scale at 30 g at its end, ended by the idle frame at 20 s. */
  function finished(): Shot {
    let shot = recordFrame(null, frame('espresso', '10.000'), 0);
    shot = recordFrame(shot, frame('espresso', '12.000'), 10);
    shot = recordFrame(shot, frame('espresso', '19.900'), 30);
    return recordFrame(shot, frame('idle', '20.000'), 30)!;
  }

  it('remembers the clock of the frame that ended the shot', () => {
    expect(finished()).toMatchObject({ ended: true, endedAt: at(20) });
    let shot = recordFrame(null, frame('espresso', '10.000'), 0);
    shot = recordFrame(shot, frame('espresso', '12.000'), 10);
    shot = recordFrame(shot, frame('espresso', '13.500', {}, 'pouringDone'), 10);
    shot = recordFrame(shot, frame('idle', '18.000'), 10);
    expect(shot).toMatchObject({ ended: true, endedAt: at(13.5) });
    expect(recordFrame(null, frame('espresso', '10.000'), 0)!.endedAt).toBeNull();
  });

  it(`takes the highest reading up to ${SETTLE_S} s after the end and is fixed after`, () => {
    let shot: Shot | null = finished();
    shot = settleWeight(shot, 18.0, at(23));
    shot = settleWeight(shot, 36.4, at(29));
    expect(shot).toMatchObject({ finalWeight: 36.4 });
    shot = settleWeight(shot, 52.0, at(40));
    shot = settleWeight(shot, 640, at(60));
    expect(shot).toMatchObject({ finalWeight: 36.4, weightFixed: true });
    // Hot water starts and its water is weighed: the shot keeps its weight.
    shot = recordFrame(shot, frame('hotWater', '61.000'), 640);
    shot = settleWeight(shot, 700, at(62));
    expect(shot).toMatchObject({ finalWeight: 36.4, weightFixed: true });
    // A new shot starts from its own readings.
    const next = recordFrame(recordFrame(shot, frame('idle', '62.000'), 0), frame('espresso', '63.000'), 0)!;
    expect(next).toMatchObject({ ended: false, finalWeight: null, endedAt: null });
    expect(next.weightFixed).toBeUndefined();
    expect(settleWeight(next, 12, at(64))).toBe(next);
  });

  it('is fixed at once when hot water, flush or steam starts within the time', () => {
    for (const state of ['hotWater', 'flush', 'steam'] as const) {
      let shot: Shot | null = settleWeight(finished(), 36.4, at(23));
      shot = recordFrame(shot, frame(state, '25.000'), 36.4);
      expect(shot).toMatchObject({ finalWeight: 36.4, weightFixed: true });
      expect(settleWeight(shot, 52, at(27))).toBe(shot);
    }
  });

  it('is fixed by the machine’s clock when the scale’s frames have no time', () => {
    let shot: Shot | null = settleWeight(finished(), 36.4);
    expect(shot).toMatchObject({ finalWeight: 36.4 });
    shot = recordFrame(shot, frame('idle', '34.000'), 36.4);
    expect(shot!.weightFixed).toBeUndefined();
    shot = recordFrame(shot, frame('idle', '36.000'), 36.4);
    expect(settleWeight(shot, 52)).toMatchObject({ finalWeight: 36.4, weightFixed: true });
  });

  it('is the scale’s last reading in the shot when none came after it', () => {
    const shot = recordFrame(finished(), frame('idle', '36.000'), 30);
    expect(shot).toMatchObject({ finalWeight: 30, weightFixed: true });
  });
});

describe('a recorded shot of the rig', () => {
  const events = recording as { at: number; machine?: MachineSnapshot; scale?: ScaleFrame }[];
  let shot: Shot | null = null;
  let weight: number | null = null;
  for (const event of events) {
    if (event.scale && isScaleSnapshot(event.scale)) weight = event.scale.weight;
    if (event.machine) shot = recordFrame(shot, event.machine, weight);
  }
  const series = shot!.series;
  const espresso = events.filter((event) => event.machine?.state.state === 'espresso').map((event) => event.machine!);
  // The fixture has 4.5 s of heating in espresso before the first frame in which water moves.
  const water = espresso.slice(espresso.findIndex((machine) => machine.state.substate !== 'preparingForShot'));

  it('gives one point per espresso frame from the first one with water, and ends', () => {
    expect(shot!.ended).toBe(true);
    expect(espresso.length - water.length).toBeGreaterThan(40);
    expect(series.t).toHaveLength(water.length);
    for (const values of [series.pressure, series.flow, series.weight, series.temperature, series.targetFlow]) {
      expect(values).toHaveLength(water.length);
    }
    expect(series.pressure[0]).toBe(water[0].pressure);
  });

  it('runs about 27 s from the water on, with time never going back', () => {
    expect(shotSeconds(shot)).toBeGreaterThan(25);
    expect(shotSeconds(shot)).toBeLessThan(29);
    expect(series.t.every((t, i) => i === 0 || t >= series.t[i - 1])).toBe(true);
  });

  it('reaches the pressure and the flow of the profile', () => {
    expect(Math.max(...series.pressure)).toBeCloseTo(10, 0);
    expect(Math.max(...series.flow)).toBeCloseTo(8, 0);
  });

  it('has the targets of the profile: flow first, then pressure, the temperature throughout', () => {
    expect(series.targetFlow[0]).toBe(8);
    expect(series.targetPressure[0]).toBeNull();
    expect(Math.max(...series.targetPressure.filter((v): v is number => v !== null))).toBe(10);
    expect(series.targetTemperature.every((v) => v !== null && v >= 93 && v <= 95)).toBe(true);
  });

  it('does not draw the 34 g that stood on the scale before the tare', () => {
    const drawn = series.weight.filter((w): w is number => w !== null);
    expect(drawn[0]).toBe(0);
    // From 0 the weight only rises, up to just under the target of 36 g.
    expect(drawn.every((w, i) => i === 0 || w >= drawn[i - 1])).toBe(true);
    expect(shotWeight(shot)).toBeGreaterThan(32);
    expect(shotWeight(shot)).toBeLessThan(36);
  });
});

describe('runningStep (spec 3.14)', () => {
  const steps = [{ name: 'Preinfusion' }, { name: '' }, { name: 'Extraction' }];
  const running = (startedAt: number | null = 1): Shot => ({
    enteredAt: 0,
    startedAt,
    series: {
      t: [],
      pressure: [],
      flow: [],
      weight: [],
      weightFlow: [],
      temperature: [],
      targetPressure: [],
      targetFlow: [],
      targetTemperature: [],
    },
    samples: [],
    finalWeight: null,
    ended: false,
    endedAt: null,
  });

  it('names the step at the machine’s frame number, as the profile has it', () => {
    expect(runningStep(running(), frame('espresso', '01', { profileFrame: 0 }), steps)).toBe('Preinfusion');
    expect(runningStep(running(), frame('espresso', '01', { profileFrame: 2 }), steps)).toBe('Extraction');
  });

  it('says Step n for a step without a name or beyond the profile', () => {
    expect(runningStep(running(), frame('espresso', '01', { profileFrame: 1 }), steps)).toBe('Step 2');
    expect(runningStep(running(), frame('espresso', '01', { profileFrame: 5 }), steps)).toBe('Step 6');
    expect(runningStep(running(), frame('espresso', '01', { profileFrame: 0 }), undefined)).toBe('Step 1');
  });

  it('is nothing without a running shot, while the machine heats, or outside espresso', () => {
    expect(runningStep(null, frame('espresso', '01'), steps)).toBeNull();
    expect(runningStep({ ...running(), ended: true }, frame('espresso', '01'), steps)).toBeNull();
    expect(runningStep(running(null), frame('espresso', '01'), steps)).toBeNull();
    expect(runningStep(running(), frame('steam', '01'), steps)).toBeNull();
    expect(runningStep(running(), frame('hotWater', '01'), steps)).toBeNull();
    expect(runningStep(running(), null, steps)).toBeNull();
  });
});
