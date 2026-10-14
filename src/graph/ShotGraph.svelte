<script lang="ts">
  // A graph of measured values over time, fed with plain arrays: the live shot, steam and the
  // history. The colours and the drawing are the editor's (spec 3.2): blue is flow, green is
  // pressure, red is temperature in its own band on top; weight has the scale on the right,
  // and only while there is a weight to draw. The profile's targets are thin dashed lines in
  // the colour and on the scale of their quantity. Every scale names its unit in its colour.
  import { timeAxis } from './axis';

  interface Props {
    /** s, one entry per sample; every other array is as long */
    t: number[];
    /** bar */
    pressure?: number[];
    /** ml/s */
    flow?: number[];
    /** g; null is a gap */
    weight?: (number | null)[];
    /** °C */
    temperature?: number[];
    /** bar; null is a gap: the step does not control the pressure */
    targetPressure?: (number | null)[];
    /** ml/s; null is a gap */
    targetFlow?: (number | null)[];
    /** °C; null is a gap */
    targetTemperature?: (number | null)[];
    /** g; drawn as a dashed line on the weight's scale, with a weight curve only */
    targetWeight?: number | null;
    /** a finished or stored shot: the time axis ends at the last sample, so the shot fills the width */
    fit?: boolean;
    /** a running graph's time axis is at least this long, and grows in steps of ten seconds */
    minSeconds?: number;
    /** the top of the scale of pressure and flow; steam stays far under a shot's 12 */
    yMax?: number;
    /** the legend under the graph: the curves, and what dashed means (the setting `showGraphLegend`) */
    legend?: boolean;
    label?: string;
  }

  let {
    t,
    pressure,
    flow,
    weight,
    temperature,
    targetPressure,
    targetFlow,
    targetTemperature,
    targetWeight = null,
    fit = false,
    minSeconds = 30,
    yMax = 12,
    legend = false,
    label = 'shot graph',
  }: Props = $props();

  /** Pressure and flow share one scale, as in the editor: 1 bar is as high as 1 ml/s. */
  const mainTicks = $derived([0, 1, 2, 3, 4].map((tick) => (tick * yMax) / 4));

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

  const drawn = (values: readonly (number | null)[] | undefined) =>
    (values ?? []).filter((value): value is number => value !== null);
  const weights = $derived(drawn(weight));
  // Without a weight (no scale) there is no weight scale and no target on it.
  const hasWeight = $derived(weights.length > 0);
  const hasTargets = $derived(
    [targetPressure, targetFlow, targetTemperature].some((values) => drawn(values).length > 0) ||
      (hasWeight && !!targetWeight),
  );
  const weightMax = $derived(
    Math.max(40, Math.ceil((Math.max(targetWeight ?? 0, ...weights) * 1.1) / 10) * 10),
  );
  const weightTicks = $derived([0, weightMax / 2, weightMax]);

  // The temperature band covers 80 to 100 °C and opens for a colder or hotter group or target.
  const temperatureRange = $derived.by(() => {
    const values = [...(temperature ?? []), ...drawn(targetTemperature)];
    const low = values.length ? Math.min(...values) : 80;
    const high = values.length ? Math.max(...values) : 100;
    return { min: Math.min(80, Math.floor(low / 10) * 10), max: Math.max(100, Math.ceil(high / 10) * 10) };
  });

  // The plot in pixels: a band for the temperature on top, a gap, and the main band. Over
  // each band is a line for its units.
  const box = $derived.by(() => {
    const left = 2.8 * rem;
    const right = Math.max(left + 1, width - (hasWeight ? 3 : 1.2) * rem);
    const top = 1.5 * rem;
    const bottom = Math.max(top + 3, height - 2 * rem);
    const gap = temperature ? 1.5 * rem : 0;
    const tempH = temperature ? Math.max(1, Math.min(bottom - top - gap, Math.max((bottom - top) * 0.18, 2.6 * rem))) : 0;
    const mainTop = top + tempH + gap;
    return { left, right, top, bottom, tempBottom: top + tempH, tempH, mainTop, mainH: Math.max(1, bottom - mainTop) };
  });

  const x = (time: number) => box.left + (time / seconds) * (box.right - box.left);
  const yMain = (value: number) => box.bottom - (Math.min(Math.max(value, 0), yMax) / yMax) * box.mainH;
  const yWeight = (value: number) => box.bottom - (Math.min(Math.max(value, 0), weightMax) / weightMax) * box.mainH;
  const yTemperature = (value: number) =>
    box.tempBottom -
    ((value - temperatureRange.min) / (temperatureRange.max - temperatureRange.min)) * box.tempH;

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
    >
      {#each mainTicks as tick (tick)}
        <line class="grid" x1={box.left} x2={box.right} y1={yMain(tick)} y2={yMain(tick)} />
        <text class="tick" x={box.left - 0.5 * rem} y={yMain(tick) + 0.3 * rem}>{tick}</text>
      {/each}
      <text class="unit" data-testid="shot-unit-main" x={box.left} y={box.mainTop - 0.5 * rem}>
        {#if pressure}<tspan class="pressure">bar</tspan>{/if}
        {#if flow}<tspan class="flow" dx={pressure ? 0.3 * rem : 0}>ml/s</tspan>{/if}
      </text>
      {#if temperature}
        {#each [temperatureRange.min, temperatureRange.max] as tick (tick)}
          <line class="grid" x1={box.left} x2={box.right} y1={yTemperature(tick)} y2={yTemperature(tick)} />
          <text class="tick temperature" x={box.left - 0.5 * rem} y={yTemperature(tick) + 0.3 * rem}>{tick}</text>
        {/each}
        <text class="unit temperature" data-testid="shot-unit-temperature" x={box.left} y={box.top - 0.5 * rem}>°C</text>
      {/if}
      {#if hasWeight}
        {#each weightTicks as tick (tick)}
          <text class="tick weight" data-testid="shot-weight-tick" x={box.right + 0.5 * rem} y={yWeight(tick) + 0.3 * rem}>
            {tick}{#if tick === weightMax}<tspan class="unit" data-testid="shot-unit-weight" dx={0.25 * rem}>g</tspan>{/if}
          </text>
        {/each}
      {/if}
      {#each axis.ticks as tick (tick)}
        <text class="time" x={x(tick)} y={box.bottom + 1.4 * rem}>{tick}{tick === 0 ? ' s' : ''}</text>
      {/each}

      <!-- The targets lie under the curves, each on the scale of its quantity. -->
      {#if hasWeight && targetWeight}
        <line
          class="target weight"
          data-testid="shot-target-weight"
          x1={box.left}
          x2={box.right}
          y1={yWeight(targetWeight)}
          y2={yWeight(targetWeight)}
        />
      {/if}
      {#if temperature && targetTemperature}
        <path class="target temperature" data-testid="shot-target-temperature" d={path(targetTemperature, yTemperature)} />
      {/if}
      {#if pressure && targetPressure}
        <path class="target pressure" data-testid="shot-target-pressure" d={path(targetPressure, yMain)} />
      {/if}
      {#if flow && targetFlow}
        <path class="target flow" data-testid="shot-target-flow" d={path(targetFlow, yMain)} />
      {/if}

      {#if temperature}
        <path class="line temperature" data-testid="shot-line-temperature" d={path(temperature, yTemperature)} />
      {/if}
      {#if hasWeight}
        <path class="line weight" data-testid="shot-line-weight" d={path(weight, yWeight)} />
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
      {#if hasWeight}<li><i class="weight"></i>weight</li>{/if}
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

  .tick.weight {
    text-anchor: start;
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

  .line {
    stroke-width: 0.2rem;
    stroke-linecap: round;
  }

  .target {
    stroke-width: 0.09rem;
    stroke-dasharray: 0.4rem 0.3rem;
    opacity: 0.85;
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
  text.weight,
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
  text.weight {
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
