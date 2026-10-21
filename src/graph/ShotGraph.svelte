<script lang="ts">
  // A graph of measured values over time, fed with plain arrays: the live shot, steam and the
  // history. The colours and the drawing are the editor's (spec 3.2): blue is flow, green is
  // pressure, red is temperature in its own band on top; yellow is the weight flow in g/s
  // (founder, 2026-10-14), on the scale of flow and pressure, and only while there is a scale.
  // The profile's targets are thin dashed lines in the colour and on the scale of their
  // quantity. Every scale names its unit in its colour. As the step editor's preview (`preview`)
  // it draws a profile's targets alone, as solid lines, with its steps' borders, and each step's
  // limit as a thin dotted line in its quantity's colour, muted.
  import { fixedScale, inBand, shotScale, temperatureBand, timeAxis, type TemperatureBand } from './axis';

  interface Props {
    /** s, one entry per sample; every other array is as long */
    t: number[];
    /** bar */
    pressure?: number[];
    /** ml/s */
    flow?: number[];
    /** g/s, the scale's weight flow; null is a gap */
    weightFlow?: (number | null)[];
    /** °C */
    temperature?: number[];
    /** bar; null is a gap: the step does not control the pressure */
    targetPressure?: (number | null)[];
    /** ml/s; null is a gap */
    targetFlow?: (number | null)[];
    /** °C; null is a gap */
    targetTemperature?: (number | null)[];
    /** a finished or stored shot: the time axis ends at the last sample, so the shot fills the width */
    fit?: boolean;
    /** a running graph's time axis is at least this long, and grows in steps of ten seconds */
    minSeconds?: number;
    /**
     * a fixed top of the scale of pressure and flow (steam's 4, the preview's); without it the
     * shot's scale, 10 or 12 by the values (`shotScale`)
     */
    yMax?: number;
    /** °C, a temperature band that does not follow the values (the steam page's 140 to 170) */
    temperatureScale?: TemperatureBand;
    /** the legend under the graph: the curves, and what dashed means (the setting `showGraphLegend`) */
    legend?: boolean;
    label?: string;
    /** the targets are the curves: solid lines, no measured values (the step editor's preview) */
    preview?: boolean;
    /** bar, the steps' pressure limits, drawn in the preview; null is a step without one */
    pressureLimit?: (number | null)[];
    /** ml/s, the steps' flow limits, drawn in the preview; null is a step without one */
    flowLimit?: (number | null)[];
    /** s, dashed lines across the plot: where a step starts */
    borders?: number[];
    /** no ticks, units or times: the picker's small preview of a profile (spec 3.8) */
    bare?: boolean;
  }

  let {
    t,
    pressure,
    flow,
    weightFlow,
    temperature,
    targetPressure,
    targetFlow,
    targetTemperature,
    fit = false,
    minSeconds = 30,
    yMax,
    temperatureScale,
    legend = false,
    label = 'shot graph',
    preview = false,
    pressureLimit,
    flowLimit,
    borders = [],
    bare = false,
  }: Props = $props();

  /**
   * Pressure, flow and weight flow share one scale, as in the editor: 1 bar is as high as
   * 1 ml/s and 1 g/s. A shot's weight flow stays under about 5 g/s, under the flow it follows.
   * Only what is drawn counts: the weight flow only with a scale, the targets only with their curve.
   */
  const scale = $derived(
    yMax !== undefined
      ? fixedScale(yMax)
      : shotScale([pressure, flow, weightFlow, pressure ? targetPressure : undefined, flow ? targetFlow : undefined]),
  );
  const top = $derived(scale.max);
  const mainTicks = $derived(scale.ticks);

  let width = $state(0);
  let height = $state(0);
  let rem = $state(16);

  $effect(() => {
    // The root font size follows the viewport (app.css): read it again when the size changes.
    void width;
    void height;
    rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  });

  const axis = $derived(timeAxis(t.at(-1) ?? 0, fit, minSeconds));
  const seconds = $derived(axis.seconds);

  const drawn = (values: readonly (number | null)[] | undefined) => (values ?? []).filter((value): value is number => value !== null);
  // Without a scale there is no weight flow: nothing yellow is drawn.
  const hasWeightFlow = $derived(drawn(weightFlow).length > 0);
  const hasTargets = $derived([targetPressure, targetFlow, targetTemperature].some((values) => drawn(values).length > 0));

  // The temperature band covers 80 to 100 °C and opens for a colder or hotter group or target.
  const temperatureRange = $derived(temperatureBand([...(temperature ?? []), ...drawn(targetTemperature)], temperatureScale));

  // The plot in pixels: a band for the temperature on top, a gap, and the main band. Over
  // each band is a line for its units.
  const box = $derived.by(() => {
    const left = bare ? 0.4 * rem : 2.8 * rem;
    const right = Math.max(left + 1, width - (bare ? 0.4 : 1.2) * rem);
    const top = bare ? 0.4 * rem : 1.5 * rem;
    const bottom = Math.max(top + 3, height - (bare ? 0.4 : 2) * rem);
    const gap = temperature ? 1.5 * rem : 0;
    const tempH = temperature ? Math.max(1, Math.min(bottom - top - gap, Math.max((bottom - top) * 0.18, 2.6 * rem))) : 0;
    const mainTop = top + tempH + gap;
    return { left, right, top, bottom, tempBottom: top + tempH, tempH, mainTop, mainH: Math.max(1, bottom - mainTop) };
  });

  const x = (time: number) => box.left + (time / seconds) * (box.right - box.left);
  const yMain = (value: number) => box.bottom - (Math.min(Math.max(value, 0), top) / top) * box.mainH;
  const yTemperature = (value: number) =>
    box.tempBottom -
    ((inBand(value, temperatureRange) - temperatureRange.min) / (temperatureRange.max - temperatureRange.min)) * box.tempH;

  /** One path; a null starts a new stretch. */
  function path(values: readonly (number | null)[] | undefined, y: (value: number) => number): string {
    let d = '';
    let pen = false;
    (values ?? []).forEach((value, i) => {
      if (value === null || i >= t.length) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(t[i]).toFixed(1)} ${y(value).toFixed(1)}`;
      pen = true;
    });
    return d;
  }
</script>

<div class="graph">
  <div class="plot" bind:clientWidth={width} bind:clientHeight={height}>
    <svg
      {width}
      {height}
      role="img"
      aria-label={label}
      data-testid="shot-graph"
      data-points={t.length}
      data-seconds={seconds}
      data-scale={top}
    >
      {#each mainTicks as tick (tick)}
        <line class="grid" x1={box.left} x2={box.right} y1={yMain(tick)} y2={yMain(tick)} />
        {#if !bare}<text class="tick" x={box.left - 0.5 * rem} y={yMain(tick) + 0.3 * rem}>{tick}</text>{/if}
      {/each}
      {#if !bare}
        <text class="unit" data-testid="shot-unit-main" x={box.left} y={box.mainTop - 0.5 * rem}>
          {#if pressure}<tspan class="pressure">bar</tspan>{/if}
          {#if flow}<tspan class="flow" dx={pressure ? 0.3 * rem : 0}>ml/s</tspan>{/if}
          {#if hasWeightFlow}
            <tspan dx={0.3 * rem}>·</tspan>
            <tspan class="weight" data-testid="shot-unit-weight-flow" dx={0.3 * rem}>g/s</tspan>
          {/if}
        </text>
        {#if temperature}
          {#each [temperatureRange.min, temperatureRange.max] as tick (tick)}
            <line class="grid" x1={box.left} x2={box.right} y1={yTemperature(tick)} y2={yTemperature(tick)} />
            <text
              class="tick temperature"
              data-testid="shot-tick-temperature"
              x={box.left - 0.5 * rem}
              y={yTemperature(tick) + 0.3 * rem}>{tick}</text
            >
          {/each}
          <text class="unit temperature" data-testid="shot-unit-temperature" x={box.left} y={box.top - 0.5 * rem}>°C</text>
        {/if}
        {#each axis.ticks as tick (tick)}
          <text class="time" x={x(tick)} y={box.bottom + 1.4 * rem}>{tick}{tick === 0 ? ' s' : ''}</text>
        {/each}
      {/if}

      {#each borders as border, i (i)}
        <line class="border" data-testid="shot-border" x1={x(border)} x2={x(border)} y1={box.top} y2={box.bottom} />
      {/each}

      <!-- The targets lie under the curves, each on the scale of its quantity. -->
      {#if temperature && targetTemperature}
        <path
          class="target temperature"
          class:solid={preview}
          data-testid="shot-target-temperature"
          d={path(targetTemperature, yTemperature)}
        />
      {/if}
      {#if preview && drawn(pressureLimit).length > 0}
        <path class="limit pressure" data-testid="shot-limit-pressure" d={path(pressureLimit, yMain)} />
      {/if}
      {#if preview && drawn(flowLimit).length > 0}
        <path class="limit flow" data-testid="shot-limit-flow" d={path(flowLimit, yMain)} />
      {/if}
      {#if pressure && targetPressure}
        <path class="target pressure" class:solid={preview} data-testid="shot-target-pressure" d={path(targetPressure, yMain)} />
      {/if}
      {#if flow && targetFlow}
        <path class="target flow" class:solid={preview} data-testid="shot-target-flow" d={path(targetFlow, yMain)} />
      {/if}

      {#if temperature}
        <path class="line temperature" data-testid="shot-line-temperature" d={path(temperature, yTemperature)} />
      {/if}
      {#if hasWeightFlow}
        <path class="line weight" data-testid="shot-line-weight-flow" d={path(weightFlow, yMain)} />
      {/if}
      {#if pressure}
        <path class="line pressure" data-testid="shot-line-pressure" d={path(pressure, yMain)} />
      {/if}
      {#if flow}
        <path class="line flow" data-testid="shot-line-flow" d={path(flow, yMain)} />
      {/if}
    </svg>
  </div>
  {#if legend}
    <ul class="legend" data-testid="shot-legend">
      {#if flow}<li><i class="flow"></i>flow</li>{/if}
      {#if pressure}<li><i class="pressure"></i>pressure</li>{/if}
      {#if temperature}<li><i class="temperature"></i>temperature</li>{/if}
      {#if hasWeightFlow}<li><i class="weight"></i>weight flow (g/s)</li>{/if}
      {#if hasTargets}<li data-testid="shot-legend-target"><i class="dashed"></i>dashed: the profile's target</li>{/if}
    </ul>
  {/if}
</div>

<style>
  .graph {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .plot {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  svg {
    position: absolute;
    inset: 0;
    display: block;
    user-select: none;
    -webkit-user-select: none;
  }

  text {
    fill: var(--dim);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }

  .tick {
    text-anchor: end;
  }

  .time {
    text-anchor: middle;
  }

  .unit {
    font-weight: 600;
  }

  .grid {
    stroke: var(--line);
    stroke-width: 1;
    opacity: 0.55;
  }

  .line,
  .target {
    fill: none;
    stroke-linejoin: round;
  }

  /* Skin > Display's line width is a factor on every curve's stroke (src/display.ts). */
  .line {
    stroke-width: calc(0.2rem * var(--line-width, 1));
    stroke-linecap: round;
  }

  .target {
    stroke-width: calc(0.09rem * var(--line-width, 1));
    stroke-dasharray: 0.4rem 0.3rem;
    opacity: 0.85;
  }

  .target.solid {
    stroke-width: calc(0.2rem * var(--line-width, 1));
    stroke-dasharray: none;
    stroke-linecap: round;
    opacity: 1;
  }

  /* A limit, not a target: dotted, thinner, muted. */
  .limit {
    fill: none;
    stroke-width: calc(0.13rem * var(--line-width, 1));
    stroke-dasharray: 0.01rem 0.32rem;
    stroke-linecap: round;
    opacity: 0.55;
  }

  .border {
    stroke: var(--dim);
    stroke-width: 1;
    stroke-dasharray: 0.5rem 0.35rem;
    opacity: 0.6;
  }

  .flow {
    stroke: var(--flow);
  }
  .pressure {
    stroke: var(--pressure);
  }
  .temperature {
    stroke: var(--temperature);
  }
  .weight {
    stroke: var(--weight);
  }

  text.temperature,
  tspan {
    stroke: none;
  }
  tspan.flow {
    fill: var(--flow);
  }
  tspan.pressure {
    fill: var(--pressure);
  }
  text.temperature {
    fill: var(--temperature);
  }
  tspan.weight {
    fill: var(--weight);
  }

  /* Under the graph at the bottom left, starting where the plot starts. */
  .legend {
    flex: none;
    margin: 0;
    padding: 0 1.2rem 0.6rem 2.8rem;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 1.4rem;
    color: var(--dim);
    font-size: 0.85rem;
    line-height: 1.3;
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
  }

  .legend i {
    width: 1.6rem;
    height: 0;
    border-top: 0.2rem solid var(--dim);
    border-radius: 0.1rem;
  }

  .legend i.flow {
    border-color: var(--flow);
  }
  .legend i.pressure {
    border-color: var(--pressure);
  }
  .legend i.temperature {
    border-color: var(--temperature);
  }
  .legend i.weight {
    border-color: var(--weight);
  }
  .legend i.dashed {
    border-top: 0.1rem dashed var(--fg);
  }
</style>
