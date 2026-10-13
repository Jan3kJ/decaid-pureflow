<script lang="ts">
  // A graph of measured values over time, fed with plain arrays: the live shot, and later
  // steam and the history. The colours and the drawing are the editor's (spec 3.2): blue is
  // flow, green is pressure, red is temperature in its own band on top; weight has the scale
  // on the right.

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
    /** g; drawn as a dashed line on the weight's scale */
    targetWeight?: number | null;
    /** the time axis is at least this long, and grows in steps of ten seconds */
    minSeconds?: number;
    /** the top of the scale of pressure and flow; steam stays far under a shot's 12 */
    yMax?: number;
    label?: string;
  }

  let {
    t,
    pressure,
    flow,
    weight,
    temperature,
    targetWeight = null,
    minSeconds = 30,
    yMax = 12,
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

  const seconds = $derived(Math.max(minSeconds, Math.ceil((t.at(-1) ?? 0) / 10) * 10));
  const timeTicks = $derived.by(() => {
    const step = seconds <= 60 ? 10 : seconds <= 120 ? 20 : 30;
    const ticks: number[] = [];
    for (let tick = 0; tick <= seconds; tick += step) ticks.push(tick);
    return ticks;
  });

  const weights = $derived((weight ?? []).filter((w): w is number => w !== null));
  const weightMax = $derived(
    Math.max(40, Math.ceil((Math.max(targetWeight ?? 0, ...weights) * 1.1) / 10) * 10),
  );
  const weightTicks = $derived([0, weightMax / 2, weightMax]);

  // The temperature band covers 80 to 100 °C and opens for a colder or hotter group.
  const temperatureRange = $derived.by(() => {
    const values = temperature ?? [];
    const low = values.length ? Math.min(...values) : 80;
    const high = values.length ? Math.max(...values) : 100;
    return { min: Math.min(80, Math.floor(low / 10) * 10), max: Math.max(100, Math.ceil(high / 10) * 10) };
  });

  // The plot in pixels: a band for the temperature on top, a gap, and the main band.
  const box = $derived.by(() => {
    const left = 2.8 * rem;
    const right = Math.max(left + 1, width - (weight ? 3 : 1.2) * rem);
    const top = 1 * rem;
    const bottom = Math.max(top + 3, height - 2 * rem);
    const gap = temperature ? 1.2 * rem : 0;
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

<div class="graph" bind:clientWidth={width} bind:clientHeight={height}>
  <svg {width} {height} role="img" aria-label={label} data-testid="shot-graph" data-points={t.length}>
    {#each mainTicks as tick (tick)}
      <line class="grid" x1={box.left} x2={box.right} y1={yMain(tick)} y2={yMain(tick)} />
      <text class="tick" x={box.left - 0.5 * rem} y={yMain(tick) + 0.3 * rem}>{tick}</text>
    {/each}
    {#if temperature}
      {#each [temperatureRange.min, temperatureRange.max] as tick (tick)}
        <line class="grid" x1={box.left} x2={box.right} y1={yTemperature(tick)} y2={yTemperature(tick)} />
        <text class="tick" x={box.left - 0.5 * rem} y={yTemperature(tick) + 0.3 * rem}>{tick}</text>
      {/each}
    {/if}
    {#if weight}
      {#each weightTicks as tick (tick)}
        <text class="tick weight" x={box.right + 0.5 * rem} y={yWeight(tick) + 0.3 * rem}>{tick}</text>
      {/each}
    {/if}
    {#each timeTicks as tick (tick)}
      <text class="time" x={x(tick)} y={box.bottom + 1.4 * rem}>{tick}{tick === 0 ? ' s' : ''}</text>
    {/each}

    {#if weight && targetWeight}
      <line
        class="target"
        data-testid="shot-target-weight"
        x1={box.left}
        x2={box.right}
        y1={yWeight(targetWeight)}
        y2={yWeight(targetWeight)}
      />
    {/if}

    {#if temperature}
      <path class="line temperature" data-testid="shot-line-temperature" d={path(temperature, yTemperature)} />
    {/if}
    {#if weight}
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

<style>
  .graph {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
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
    fill: var(--weight);
  }

  .time {
    text-anchor: middle;
  }

  .grid {
    stroke: var(--line);
    stroke-width: 1;
    opacity: 0.55;
  }

  .line {
    fill: none;
    stroke-width: 0.2rem;
    stroke-linejoin: round;
    stroke-linecap: round;
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

  .target {
    stroke: var(--weight);
    stroke-width: 0.1rem;
    stroke-dasharray: 0.5rem 0.5rem;
    opacity: 0.7;
  }
</style>
