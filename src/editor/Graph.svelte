<script lang="ts">
  import { DEFAULT_MACHINE_LIMITS, resolveParams, type AFlowParams, type MachineLimits } from '../aflow';
  import { PHASE_TIME, REENABLE_SECONDS, buildCurve, hitTest, temperatureAxis, type EditField, type PhaseId } from './curve';
  import { dragged, startDrag, startWeightDrag, type Drag } from './drag';
  import { FIELD_LABEL, FIELD_STEP, formatValue, snap } from './fields';
  import GraphChips from './GraphChips.svelte';
  import GraphGrid from './GraphGrid.svelte';
  import {
    flowPath,
    mainTicks,
    plotBox,
    plotProjection,
    polylinePoints,
    popupAt,
    secondsPerPixel,
    sharedMax,
    valuePerPixel,
  } from './plot';
  import { graphUnits, phaseAt } from './selection';

  interface Props {
    params: AFlowParams;
    /** the machine's maxima, the maximum flow from the settings */
    limits?: MachineLimits;
    mode: 'simple' | 'detail';
    selected: PhaseId;
    /** a line or a border was dragged to a new value */
    ondrag: (field: EditField, value: number) => void;
    /** a chip on the graph set one value */
    onedit: (field: EditField, value: number) => void;
    onselect: (phase: PhaseId) => void;
  }

  let { params, limits = DEFAULT_MACHINE_LIMITS, mode, selected, ondrag, onedit, onselect }: Props = $props();

  const resolved = $derived(resolveParams(params));
  const curve = $derived(buildCurve(params, limits, mode));
  const yMax = $derived(sharedMax(limits, curve));

  let width = $state(0);
  let height = $state(0);
  let rem = $state(16);
  let svg: SVGSVGElement | undefined = $state();

  $effect(() => {
    // The root font size follows the viewport (app.css): read it again when the size changes.
    void width;
    void height;
    rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  });

  // 80 to 100 °C, wider while a temperature is outside. It follows a drag as it goes: the line
  // stays in its lane, the finger may leave it.
  const temperature = $derived(temperatureAxis(curve.temperature.map((pt) => pt.y)));
  // The pause's border is dragged in detail mode only.
  const draggable = $derived({
    levels: curve.levels,
    borders: curve.borders.filter((b) => !b.off && (mode === 'detail' || !b.detailOnly)),
  });
  const box = $derived(plotBox(width, height, rem));
  const projection = $derived(plotProjection(box, temperature, yMax));

  let drag = $state<Drag | null>(null);

  function local(event: PointerEvent): { x: number; y: number; pointer: number } {
    const rect = svg!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, pointer: event.pointerId };
  }

  function down(event: PointerEvent) {
    if (!svg) return;
    const finger = local(event);
    // A finger covers about 9 mm: reach that far around a line, a little less around a border.
    const hit = hitTest(draggable, finger.x, finger.y, projection, 1.8 * rem, 1.4 * rem);
    if (mode === 'detail') {
      const phase = phaseAt(hit, curve, graphUnits(finger.x, box.left, box.plotW));
      if (phase) onselect(phase);
    }
    if (!hit) return;
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    drag = startDrag(hit, finger, resolved, {
      seconds: (border) => secondsPerPixel(border.secondsPerUnit, box),
      value: (line) => valuePerPixel(line, box, temperature, yMax),
    });
  }

  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { x, y } = local(event);
    drag.x = x;
    drag.y = y;
    const next = snap(drag.field, dragged(drag, x, y), limits);
    if (next !== params[drag.field]) ondrag(drag.field, next);
  }

  // The infuse-to chip is dragged left or right: the weight moves with the finger as the
  // infuse's border would, through the weight's estimate (curve.ts).
  function weightDrag(dx: number, event: PointerEvent) {
    const border = curve.borders.find((b) => b.phase === 'infuse')!;
    if (!drag) {
      if (mode === 'detail') onselect('infuse');
      drag = startWeightDrag(border, local(event), dx, resolved.infuseWeight, secondsPerPixel(border.secondsPerUnit, box));
    }
    move(event);
  }

  function weightDrop() {
    drag = null;
  }

  function up(event: PointerEvent) {
    if (drag && event.pointerId === drag.pointer) drag = null;
  }

  function reenable(phase: PhaseId) {
    onedit(PHASE_TIME[phase]!, REENABLE_SECONDS);
    if (mode === 'detail') onselect(phase);
  }

  const popup = $derived(drag && popupAt(drag.x, drag.y, width, rem));

  function step(field: EditField, direction: 1 | -1) {
    onedit(field, snap(field, resolved[field] + direction * FIELD_STEP[field], limits));
  }
</script>

<div class="graph" bind:clientWidth={width} bind:clientHeight={height}>
  <svg
    bind:this={svg}
    {width}
    {height}
    class:dragging={drag !== null}
    role="application"
    aria-label="A-Flow profile curve"
    data-testid="graph"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  >
    <GraphGrid
      {curve}
      {params}
      {box}
      {projection}
      {height}
      {rem}
      {mode}
      {selected}
      mainTicks={mainTicks(yMax)}
      temperatureTicks={[temperature.min, temperature.max]}
      dragging={drag?.field}
    />

    <polyline class="line temperature" points={polylinePoints(curve.temperature, 'temperature', projection)} />
    {#if curve.pressureLimit}
      <polyline
        class="line pressure limit"
        data-testid="line-pressure-limit"
        points={polylinePoints(curve.pressureLimit, 'pressure', projection)}
      />
    {/if}
    <polyline class="line pressure" data-testid="line-pressure" points={polylinePoints(curve.pressure, 'pressure', projection)} />
    <path class="line flow" data-testid="line-flow" d={flowPath(curve.flow, projection)} />

    <!-- The stretches that can be dragged. They are not drawn until one is held. -->
    {#each curve.levels as level (level.field)}
      {@const x1 = projection.x(level.from.x)}
      {@const x2 = projection.x(level.to.x)}
      {@const y1 = projection.y(level.line, level.from.y)}
      {@const y2 = projection.y(level.line, level.to.y)}
      <line
        class="level {level.line}"
        class:active={drag?.line && drag.field === level.drags}
        data-field={level.field}
        {x1}
        {x2}
        {y1}
        {y2}
      />
      <!-- A phase that is off has no width, and its values are not written. -->
      {#if level.label !== 'none' && level.to.x > level.from.x}
        <text
          class="value {level.line}"
          class:start={level.label === 'start'}
          class:end={level.label === 'end'}
          class:held={drag?.shown === level.field}
          data-testid="value-{level.field}"
          x={level.label === 'start' ? x1 + 0.5 * rem : level.label === 'end' ? x2 - 0.5 * rem : (x1 + x2) / 2}
          y={level.label === 'start' ? y1 - 0.9 * rem : level.label === 'end' ? y2 - 0.9 * rem : (y1 + y2) / 2 - 0.6 * rem}
        >
          {formatValue(level.field, resolved[level.field])}
        </text>
      {/if}
    {/each}

    {#if drag?.border}
      {@const x = projection.x(curve.borders.find((b) => b.phase === drag?.border?.phase)?.x ?? 0)}
      <line class="border active" x1={x} x2={x} y1={box.top} y2={box.bottom} />
    {/if}
  </svg>

  <GraphChips
    {curve}
    {params}
    {box}
    {projection}
    onstep={step}
    onweightdrag={weightDrag}
    onweightdrop={weightDrop}
    onreenable={reenable}
  />

  {#if drag && popup}
    <div class="popup" data-testid="popup" style:left="{popup.left}px" style:top="{popup.top}px">
      <span>{FIELD_LABEL[drag.shown]}</span>
      <strong>{formatValue(drag.shown, resolved[drag.shown])}</strong>
    </div>
  {/if}
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
    /* The graph takes the touch itself: no scrolling, no zoom, no text selection. */
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }

  text {
    fill: var(--dim);
    font-size: 0.85rem;
    pointer-events: none;
    font-variant-numeric: tabular-nums;
  }

  .value {
    text-anchor: middle;
  }

  /* The start flow is the value at the left edge of its line, the end flow at the right. */
  .value.start {
    text-anchor: start;
  }
  .value.end {
    text-anchor: end;
  }

  /* The border that is dragged; the others are drawn under the lines (GraphGrid). */
  .border.active {
    stroke: var(--fg);
    stroke-width: 3;
    stroke-linecap: round;
  }

  .line {
    fill: none;
    stroke-width: 0.24rem;
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

  /* The pour's pressure limiter, where it is not the target pressure. */
  .line.limit {
    stroke-width: 0.12rem;
    stroke-dasharray: 0.5rem 0.5rem;
    opacity: 0.7;
  }

  .level {
    stroke-width: 0.6rem;
    stroke-linecap: round;
    opacity: 0;
  }

  .level.active {
    opacity: 0.55;
  }

  text.value {
    stroke: none;
    font-size: 0.85rem;
    font-weight: 600;
  }
  /* The pop-up shows the value while its line is held. */
  text.value.held {
    opacity: 0;
  }
  text.value.flow {
    fill: var(--flow);
  }
  text.value.pressure {
    fill: var(--pressure);
  }
  text.value.temperature {
    fill: var(--temperature);
  }

  .popup {
    position: absolute;
    transform: translateX(-50%);
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
    padding: 0.5rem 0.9rem;
    background: var(--fg);
    color: var(--bg);
    border-radius: 0.7rem;
    font-size: 0.9rem;
    white-space: nowrap;
    pointer-events: none;
  }

  .popup strong {
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
  }
</style>
