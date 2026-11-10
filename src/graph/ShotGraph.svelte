<script lang="ts">
  // A graph of measured values over time, fed with plain arrays: the live shot, steam and the
  // history. The colours and the drawing are the editor's: blue is flow, green is
  // pressure, red is temperature in its own band on top; yellow is the weight flow in g/s,
  // on the scale of flow and pressure, and only while there is a scale.
  // The profile's targets are thin dashed lines in the colour and on the scale of their
  // quantity. The units are named in the legend only. As the step editor's preview (`preview`)
  // it draws a profile's targets alone, as solid lines, with its steps' borders, and each step's
  // limit as a thin dotted line in its quantity's colour, muted. As the picker's estimate
  // (`estimate`) the curves are a modelled shot, the targets thin dotted lines under them, the
  // limits as in the preview.
  import CurveFade from './CurveFade.svelte';
  import { fixedScale, inBand, legendLabel, shotScale, temperatureBand, timeAxis, type TemperatureBand } from './axis';

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
    /** the curves are a modelled shot (the picker): the targets dotted, the limits drawn as in the preview */
    estimate?: boolean;
    /** bar, the steps' pressure limits, drawn in the preview; null is a step without one */
    pressureLimit?: (number | null)[];
    /** ml/s, the steps' flow limits, drawn in the preview; null is a step without one */
    flowLimit?: (number | null)[];
    /** s, dashed lines across the plot: where a step starts */
    borders?: number[];
    /** no ticks, units or times: the picker's small preview of a profile */
    bare?: boolean;
    /** s, a tap on the plot at this time on its axis (the step editor's cards tab); without it the graph takes no tap */
    ontap?: (seconds: number) => void;
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
    estimate = false,
    pressureLimit,
    flowLimit,
    borders = [],
    bare = false,
    ontap,
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

  // The plot in pixels: a band for the temperature on top, a gap, and the main band. The gap and
  // the top leave room for the tick numbers only.
  const box = $derived.by(() => {
    const left = bare ? 0.4 * rem : 2.8 * rem;
    const right = Math.max(left + 1, width - (bare ? 0.4 : 1.2) * rem);
    const top = bare ? 0.4 * rem : 0.6 * rem;
    const bottom = Math.max(top + 3, height - (bare ? 0.4 : 2) * rem);
    const gap = temperature ? 1 * rem : 0;
    const tempH = temperature ? Math.max(1, Math.min(bottom - top - gap, Math.max((bottom - top) * 0.18, 2.6 * rem))) : 0;
    const mainTop = top + tempH + gap;
    return { left, right, top, bottom, tempBottom: top + tempH, tempH, mainTop, mainH: Math.max(1, bottom - mainTop) };
  });

  const x = (time: number) => box.left + (time / seconds) * (box.right - box.left);
  const yMain = (value: number) => box.bottom - (Math.min(Math.max(value, 0), top) / top) * box.mainH;
  const yTemperature = (value: number) =>
    box.tempBottom -
    ((inBand(value, temperatureRange) - temperatureRange.min) / (temperatureRange.max - temperatureRange.min)) * box.tempH;

  const uid = $props.id();
  const fadeId = `fade-${uid}`;

  let plot: HTMLDivElement | undefined = $state();

  // A tap is a shortcut for the finger, so it listens on the plot without making it a control.
  $effect(() => {
    if (!plot || !ontap) return;
    const target = plot;
    const tap = ontap;
    const listener = (event: MouseEvent) => {
      const left = event.clientX - target.getBoundingClientRect().left;
      tap(((left - box.left) / (box.right - box.left)) * seconds);
    };
    target.addEventListener('click', listener);
    return () => target.removeEventListener('click', listener);
  });

  /** Widest and faintest first, so that the narrow ones lie over the wide. */
  const glowSteps = ['outer', 'wide', 'mid', 'inner'];

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

{#snippet curve(quantity: string, testid: string, d: string)}
  <!-- The glow is four strokes, each wider and fainter than the one over it, so that no step shows: strokes
       cost little, a blur filter costs a pass over the plot on every live update. -->
  {#each glowSteps as step (step)}
    <path class="glow {step} {quantity}" pathLength="1" style:stroke="url(#{fadeId}-{quantity})" {d} />
  {/each}
  <path class="line {quantity}" pathLength="1" style:stroke="url(#{fadeId}-{quantity})" data-testid={testid} {d} />
{/snippet}

<div class="graph">
  <div class="plot" bind:this={plot} bind:clientWidth={width} bind:clientHeight={height}>
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
          class:dotted={estimate}
          data-testid="shot-target-temperature"
          d={path(targetTemperature, yTemperature)}
        />
      {/if}
      {#if (preview || estimate) && drawn(pressureLimit).length > 0}
        <path class="limit pressure" data-testid="shot-limit-pressure" d={path(pressureLimit, yMain)} />
      {/if}
      {#if (preview || estimate) && drawn(flowLimit).length > 0}
        <path class="limit flow" data-testid="shot-limit-flow" d={path(flowLimit, yMain)} />
      {/if}
      {#if pressure && targetPressure}
        <path
          class="target pressure"
          class:solid={preview}
          class:dotted={estimate}
          data-testid="shot-target-pressure"
          d={path(targetPressure, yMain)}
        />
      {/if}
      {#if flow && targetFlow}
        <path
          class="target flow"
          class:solid={preview}
          class:dotted={estimate}
          data-testid="shot-target-flow"
          d={path(targetFlow, yMain)}
        />
      {/if}

      <CurveFade id={fadeId} left={box.left} right={box.right} />
      {#if temperature}
        {@render curve('temperature', 'shot-line-temperature', path(temperature, yTemperature))}
      {/if}
      {#if hasWeightFlow}
        {@render curve('weight', 'shot-line-weight-flow', path(weightFlow, yMain))}
      {/if}
      {#if pressure}
        {@render curve('pressure', 'shot-line-pressure', path(pressure, yMain))}
      {/if}
      {#if flow}
        {@render curve('flow', 'shot-line-flow', path(flow, yMain))}
      {/if}
    </svg>
  </div>
  {#if legend}
    <ul class="legend" data-testid="shot-legend">
      {#if flow}<li><i class="flow"></i>{legendLabel('flow', 'flow')}</li>{/if}
      {#if pressure}<li><i class="pressure"></i>{legendLabel('pressure', 'pressure')}</li>{/if}
      {#if temperature}<li><i class="temperature"></i>{legendLabel('temperature', 'temperature')}</li>{/if}
      {#if hasWeightFlow}<li><i class="weight"></i>{legendLabel('weight flow', 'weight')}</li>{/if}
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

  /*
   * The graph's own size, inside its SVG: ticks and units fit the drawing, not a text role
   * (scripts/font-sizes.mjs lets this rule through).
   */
  text {
    fill: var(--dim);
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
  }

  .tick {
    text-anchor: end;
  }

  .time {
    text-anchor: middle;
  }

  .grid {
    stroke: var(--grid);
    stroke-width: 1;
  }

  .line,
  .glow,
  .target {
    fill: none;
    stroke-linejoin: round;
  }

  /* Skin > Display's line width is a factor on every curve's stroke (src/display.ts). */
  .line {
    stroke-width: calc(0.2rem * var(--curve-thin) * var(--line-width, 1));
    stroke-linecap: round;
  }

  /* The glow: the line's path under it, in four strokes that fade toward the outside; at the line they add up to
     about 0.12. It is no part of the drawn curve (no hit, no test id). */
  .glow {
    stroke-linecap: round;
    pointer-events: none;
  }

  .glow.outer {
    stroke-width: calc(1.2rem * var(--curve-thin) * var(--line-width, 1));
    opacity: 0.02;
  }

  .glow.wide {
    stroke-width: calc(0.8rem * var(--curve-thin) * var(--line-width, 1));
    opacity: 0.03;
  }

  .glow.mid {
    stroke-width: calc(0.5rem * var(--curve-thin) * var(--line-width, 1));
    opacity: 0.03;
  }

  .glow.inner {
    stroke-width: calc(0.3rem * var(--curve-thin) * var(--line-width, 1));
    opacity: 0.04;
  }

  /* A curve draws in once, when the graph opens; a live update moves the path, the animation does not restart. */
  .line,
  .glow {
    animation: draw-in 0.4s ease-out;
  }

  @keyframes draw-in {
    from {
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
    }
    to {
      stroke-dasharray: 1;
      stroke-dashoffset: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .line,
    .glow {
      animation: none;
    }
  }

  .target {
    stroke-width: calc(0.07rem * var(--curve-thin) * var(--line-width, 1));
    stroke-dasharray: calc(0.4rem * var(--curve-thin)) calc(0.3rem * var(--curve-thin));
    opacity: 0.85;
  }

  .target.solid {
    stroke-width: calc(0.2rem * var(--curve-thin) * var(--line-width, 1));
    stroke-dasharray: none;
    stroke-linecap: round;
    opacity: 1;
  }

  /* The estimate's targets: thin dots under the model's curves. */
  .target.dotted {
    stroke-width: calc(0.12rem * var(--curve-thin) * var(--line-width, 1));
    stroke-dasharray: calc(0.01rem * var(--curve-thin)) calc(0.22rem * var(--curve-thin));
    stroke-linecap: round;
  }

  /* A limit, not a target: dotted, thinner, muted. */
  .limit {
    fill: none;
    stroke-width: calc(0.13rem * var(--curve-thin) * var(--line-width, 1));
    stroke-dasharray: calc(0.01rem * var(--curve-thin)) calc(0.32rem * var(--curve-thin));
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

  text.temperature {
    stroke: none;
    fill: var(--temperature);
  }

  /* Under the graph at the bottom left, starting where the plot starts. */
  .legend {
    flex: none;
    margin: 0;
    padding: 0 1.2rem 0.6rem 2.8rem;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    color: var(--dim);
    font-size: var(--text-label);
    line-height: 1.3;
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    white-space: nowrap;
  }

  .legend i {
    width: 1.6rem;
    height: 0;
    border-top: 0.2rem solid var(--dim);
    border-radius: var(--radius-pill);
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
