<script lang="ts">
  import {
    DEFAULT_MACHINE_LIMITS,
    TEMPERATURE_MAX,
    TEMPERATURE_MIN,
    resolveParams,
    type AFlowParams,
    type NumberField,
  } from '../aflow';
  import {
    GRAPH_WIDTH,
    PHASE_LABEL,
    buildCurve,
    hitTest,
    type EditField,
    type LineId,
    type PhaseId,
    type Point,
    type Projection,
  } from './curve';
  import { FIELD_LABEL, FIELD_STEP, formatValue, snap } from './fields';
  import ValueChip from './ValueChip.svelte';

  interface Props {
    params: AFlowParams;
    mode: 'simple' | 'detail';
    selected: PhaseId;
    /** a line or a border was dragged to a new value */
    ondrag: (field: NumberField, value: number) => void;
    /** a chip on the graph set one value */
    onedit: (field: EditField, value: number) => void;
    onselect: (phase: PhaseId) => void;
  }

  let { params, mode, selected, ondrag, onedit, onselect }: Props = $props();

  const limits = DEFAULT_MACHINE_LIMITS;
  /** Pressure and flow share one scale: 1 bar is as high as 1 ml/s. */
  const yMax = Math.max(limits.maxPressure, limits.maxFlow);
  const mainTicks = [0, 3, 6, 9, 12].filter((v) => v <= yMax);
  const temperatureTicks = [80, 100];

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

  const resolved = $derived(resolveParams(params));
  const curve = $derived(buildCurve(params, limits));
  // The pause's border is dragged in detail mode only (founder, 2026-10-12).
  const draggable = $derived({
    levels: curve.levels,
    borders: curve.borders.filter((b) => mode === 'detail' || !b.detailOnly),
  });

  // The plot in pixels: a band for the temperature on top, a gap that holds the weight chips,
  // and the band of pressure and flow.
  const box = $derived.by(() => {
    const left = 2.8 * rem;
    const right = Math.max(left + 1, width - 1.2 * rem);
    const top = 1.8 * rem;
    const bottom = Math.max(top + 3, height - 3.4 * rem);
    const gap = 3.4 * rem;
    const tempH = Math.max(1, Math.min(bottom - top - gap, Math.max((bottom - top - gap) * 0.22, 3.2 * rem)));
    const mainTop = top + tempH + gap;
    return {
      left,
      right,
      top,
      bottom,
      plotW: right - left,
      tempBottom: top + tempH,
      tempH,
      gapMiddle: top + tempH + gap / 2,
      mainTop,
      mainH: Math.max(1, bottom - mainTop),
    };
  });

  const projection: Projection = $derived({
    x: (units) => box.left + (units / GRAPH_WIDTH) * box.plotW,
    y: (line, value) =>
      line === 'temperature'
        ? box.tempBottom -
          ((value - TEMPERATURE_MIN) / (TEMPERATURE_MAX - TEMPERATURE_MIN)) * box.tempH
        : box.bottom - (value / yMax) * box.mainH,
  });

  function polyline(points: Point[], line: LineId): string {
    return points
      .map((pt) => `${projection.x(pt.x).toFixed(1)},${projection.y(line, pt.y).toFixed(1)}`)
      .join(' ');
  }

  function valuePerPixel(line: LineId): number {
    return line === 'temperature'
      ? (TEMPERATURE_MAX - TEMPERATURE_MIN) / box.tempH
      : yMax / box.mainH;
  }

  interface Drag {
    /** the value the drag changes */
    field: NumberField;
    /** the value under the finger, which the pop-up shows */
    shown: EditField;
    /** a level line, or null for a border */
    line: LineId | null;
    pointer: number;
    startX: number;
    startY: number;
    startValue: number;
    /** seconds per pixel to the right, as it was when the drag of a border began */
    secondsPerPixel: number;
    x: number;
    y: number;
  }

  let drag = $state<Drag | null>(null);

  function local(event: PointerEvent): { x: number; y: number } {
    const rect = svg!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function down(event: PointerEvent) {
    if (!svg) return;
    const { x, y } = local(event);
    // A finger covers about 9 mm: reach that far around a line, a little less around a border.
    const hit = hitTest(draggable, x, y, projection, 1.8 * rem, 1.4 * rem);
    if (mode === 'detail') {
      const units = ((x - box.left) / box.plotW) * GRAPH_WIDTH;
      const phase = hit
        ? hit.kind === 'level'
          ? hit.level.phase
          : hit.border.phase
        : curve.phases.find((c) => units >= c.x0 && units <= c.x1)?.id;
      if (phase) onselect(phase);
    }
    if (!hit) return;
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    const field = hit.kind === 'level' ? hit.level.drags : hit.border.field;
    drag = {
      field,
      shown: hit.kind === 'level' ? hit.level.field : hit.border.field,
      line: hit.kind === 'level' ? hit.level.line : null,
      pointer: event.pointerId,
      startX: x,
      startY: y,
      startValue: params[field],
      secondsPerPixel:
        hit.kind === 'border' ? hit.border.secondsPerUnit / (box.plotW / GRAPH_WIDTH) : 0,
      x,
      y,
    };
  }

  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { x, y } = local(event);
    drag.x = x;
    drag.y = y;
    const value = drag.line
      ? drag.startValue + (drag.startY - y) * valuePerPixel(drag.line)
      : drag.startValue + (x - drag.startX) * drag.secondsPerPixel;
    const next = snap(drag.field, value, limits);
    if (next !== params[drag.field]) ondrag(drag.field, next);
  }

  function up(event: PointerEvent) {
    if (drag && event.pointerId === drag.pointer) drag = null;
  }

  const durationOf = $derived(
    Object.fromEntries(curve.borders.map((b) => [b.phase, b.field])) as Partial<
      Record<PhaseId, NumberField>
    >,
  );

  // The flow line has a gap (the infuse phase): one path, one stretch per subpath.
  const flowPath = $derived(
    curve.flow
      .map(
        (stretch) =>
          'M' +
          stretch
            .map((pt) => `${projection.x(pt.x).toFixed(1)} ${projection.y('flow', pt.y).toFixed(1)}`)
            .join(' L'),
      )
      .join(' '),
  );

  const infuseEnd = $derived(curve.phases.find((c) => c.id === 'infuse')!.x1);

  // The pop-up stays on the graph and above the finger.
  const popup = $derived(
    drag && {
      left: Math.min(Math.max(drag.x, 7 * rem), width - 7 * rem),
      top: Math.max(drag.y - 4.2 * rem, 0.2 * rem),
    },
  );

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
    {#each curve.phases as phase (phase.id)}
      {@const x0 = projection.x(phase.x0)}
      {@const x1 = projection.x(phase.x1)}
      {@const duration = durationOf[phase.id]}
      <rect
        class="column"
        class:selected={mode === 'detail' && phase.id === selected}
        data-testid="column-{phase.id}"
        x={x0}
        y={box.top - 0.6 * rem}
        width={x1 - x0}
        height={Math.max(0, height - box.top)}
        rx={0.5 * rem}
      />
      <text class="phase" x={(x0 + x1) / 2} y={box.bottom + 1.35 * rem}>
        {PHASE_LABEL[phase.id]}
      </text>
      {#if duration}
        <text
          class="duration"
          class:active={drag?.field === duration}
          data-testid="value-{duration}"
          x={(x0 + x1) / 2}
          y={box.bottom + 2.65 * rem}
        >
          {phase.id === 'secondFill' ? 'pause ' : ''}{formatValue(duration, params[duration])}
        </text>
      {/if}
    {/each}

    {#each mainTicks as tick (tick)}
      {@const y = projection.y('pressure', tick)}
      <line class="grid" x1={box.left} x2={box.right} y1={y} y2={y} />
      <text class="tick" x={box.left - 0.5 * rem} y={y + 0.3 * rem}>{tick}</text>
    {/each}
    {#each temperatureTicks as tick (tick)}
      {@const y = projection.y('temperature', tick)}
      <line class="grid" x1={box.left} x2={box.right} y1={y} y2={y} />
      <text class="tick" x={box.left - 0.5 * rem} y={y + 0.3 * rem}>{tick}</text>
    {/each}

    {#each curve.phases.slice(1) as phase (phase.id)}
      {@const x = projection.x(phase.x0)}
      <line class="border" x1={x} x2={x} y1={box.top} y2={box.bottom} />
    {/each}
    {#if curve.pauseX !== undefined}
      {@const x = projection.x(curve.pauseX)}
      <line class="border inner" x1={x} x2={x} y1={box.mainTop} y2={box.bottom} />
    {/if}

    <polyline class="line temperature" points={polyline(curve.temperature, 'temperature')} />
    {#if curve.pressureLimit}
      <polyline
        class="line pressure limit"
        data-testid="line-pressure-limit"
        points={polyline(curve.pressureLimit, 'pressure')}
      />
    {/if}
    <polyline
      class="line pressure"
      data-testid="line-pressure"
      points={polyline(curve.pressure, 'pressure')}
    />
    <path class="line flow" data-testid="line-flow" d={flowPath} />

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
      {#if level.label !== 'none'}
        <text
          class="value {level.line}"
          class:start={level.label === 'start'}
          class:held={drag?.shown === level.field}
          data-testid="value-{level.field}"
          x={level.label === 'start' ? x1 + 0.5 * rem : (x1 + x2) / 2}
          y={level.label === 'start' ? y1 - 0.9 * rem : (y1 + y2) / 2 - 0.6 * rem}
        >
          {formatValue(level.field, resolved[level.field])}
        </text>
      {/if}
    {/each}

    {#if drag && !drag.line}
      {@const x = projection.x(curve.borders.find((b) => b.field === drag?.field)?.x ?? 0)}
      <line class="border active" x1={x} x2={x} y1={box.top} y2={box.bottom} />
    {/if}
  </svg>

  <div class="on-graph" style:left="{projection.x(infuseEnd)}px" style:top="{box.gapMiddle}px">
    <ValueChip
      compact
      label="infuse to"
      value={formatValue('infuseWeight', params.infuseWeight)}
      testid="graph-infuseWeight"
      onstep={(d) => step('infuseWeight', d)}
    />
  </div>
  <div class="on-graph end" style:left="{box.right}px" style:top="{box.gapMiddle}px">
    <ValueChip
      compact
      label="stop at"
      value={formatValue('stopWeight', params.stopWeight)}
      testid="graph-stopWeight"
      onstep={(d) => step('stopWeight', d)}
    />
  </div>

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

  .phase,
  .duration,
  .value {
    text-anchor: middle;
  }

  /* The start flow is the value at the left edge of its line. */
  .value.start {
    text-anchor: start;
  }

  .phase {
    fill: var(--fg);
    font-size: 0.9rem;
  }

  .duration.active {
    fill: var(--fg);
    font-weight: 600;
  }

  .tick {
    text-anchor: end;
    font-size: 0.75rem;
  }

  .grid {
    stroke: var(--line);
    stroke-width: 1;
    opacity: 0.55;
  }

  .border {
    stroke: var(--dim);
    stroke-width: 1.5;
    stroke-dasharray: 2 6;
    stroke-linecap: round;
  }

  .border.inner {
    opacity: 0.5;
  }

  .border.active {
    stroke: var(--fg);
    stroke-width: 3;
    stroke-dasharray: none;
  }

  .column {
    fill: none;
  }

  .column.selected {
    fill: var(--raised);
    stroke: var(--line);
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

  .on-graph {
    position: absolute;
    transform: translate(-50%, -50%);
  }

  .on-graph.end {
    transform: translate(-100%, -50%);
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
