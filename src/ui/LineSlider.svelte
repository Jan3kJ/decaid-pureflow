<script lang="ts">
  import { draggedValue, fractionOf, keyedValue, labelLeft, steppedValue, tapOutcome, TAP_SLOP } from './line-slider';

  // A value as a thin line in its colour, bright from the start to the value, with the number and
  // unit above it at the value's place and no caption. A tap lights it; a sideways drag of any line
  // moves the value from where it was (never a jump) and writes it once when let go; a second tap
  // on the number of the lit line opens the pad. While something runs, `live` draws a brighter line
  // to the live value with its number under the end.
  interface Props {
    /** the accessible name, which is no caption */
    label: string;
    unit: string;
    min: number;
    max: number;
    step: number;
    /** null while the value is not known: the line is off */
    value: number | null;
    /** the number as it is written, in the value's decimals */
    shown: string;
    tone: 'flow' | 'temperature' | 'time' | 'weight';
    lit: boolean;
    disabled?: boolean;
    /** the live value to draw, with its text */
    live?: { value: number; text: string } | null;
    /** the line's test id, and the number's */
    testid: string;
    numberTestid: string;
    /** a touch on the line: light it */
    onlight: () => void;
    /** the value while a drag moves it */
    onmove: (value: number) => void;
    /** the value to write: the drag let go, or a key */
    onrelease: (value: number) => void;
    /** the second tap on the lit number */
    onpad: () => void;
  }

  let {
    label,
    unit,
    min,
    max,
    step,
    value,
    shown,
    tone,
    lit,
    disabled = false,
    live = null,
    testid,
    numberTestid,
    onlight,
    onmove,
    onrelease,
    onpad,
  }: Props = $props();

  const off = $derived(disabled || value === null);
  const fraction = $derived(fractionOf(value ?? min, min, max));
  let lineWidth = $state(0);
  let numberWidth = $state(0);
  const left = $derived(labelLeft(fraction, lineWidth, numberWidth));

  let touch: { id: number; x: number; from: number; lit: boolean; onNumber: boolean; moved: boolean; value: number } | null = null;

  function down(event: PointerEvent) {
    if (off || event.button > 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const onNumber = !!(event.target as Element).closest('.value');
    touch = { id: event.pointerId, x: event.clientX, from: value ?? min, lit, onNumber, moved: false, value: value ?? min };
    onlight();
  }

  function move(event: PointerEvent) {
    if (!touch || event.pointerId !== touch.id) return;
    const distance = event.clientX - touch.x;
    if (!touch.moved && Math.abs(distance) < TAP_SLOP) return;
    touch.moved = true;
    touch.value = draggedValue(touch.from, distance, lineWidth, min, max, step);
    onmove(touch.value);
  }

  function up(event: PointerEvent) {
    if (!touch || event.pointerId !== touch.id) return;
    const done = touch;
    touch = null;
    if (done.moved) onrelease(done.value);
    else if (tapOutcome(done.lit, done.onNumber) === 'pad') onpad();
  }

  function key(event: KeyboardEvent) {
    if (off) return;
    const next = keyedValue(event.key, steppedValue(value ?? min, min, max, step), min, max, step);
    if (next === null) return;
    event.preventDefault();
    onlight();
    onmove(next);
    onrelease(next);
  }

  const liveFraction = $derived(live ? fractionOf(live.value, min, max) : 0);
</script>

<div
  class="slider slider-tone"
  data-tone={tone}
  data-lit={lit}
  class:lit
  class:off
  class:running={live !== null}
  role="slider"
  tabindex={off ? -1 : 0}
  aria-label={label}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={value ?? undefined}
  aria-valuetext="{shown} {unit}"
  aria-disabled={off}
  data-testid={testid}
  style:--p={fraction}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={() => (touch = null)}
  onkeydown={key}
>
  <div class="track" bind:clientWidth={lineWidth}>
    <div class="rest"></div>
    <div class="fill"></div>
    {#if live}
      <div class="live" data-testid="{testid}-live" style:width="{liveFraction * 100}%"></div>
      <div class="live-value" data-testid="{numberTestid}-live" style:left="{liveFraction * 100}%">{live.text}</div>
    {/if}
  </div>
  <span class="value" data-testid={numberTestid} bind:clientWidth={numberWidth} style:left="{left}px"><b>{shown}</b><i>{unit}</i></span
  >
</div>

<style>
  .slider {
    flex: 1;
    min-height: 0;
    position: relative;
    touch-action: none;
    cursor: ew-resize;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    outline: none;
  }

  .off {
    cursor: default;
  }

  .track {
    position: absolute;
    left: 0;
    right: 0;
    top: 66%;
    height: 0;
  }

  .rest {
    position: absolute;
    left: 0;
    right: 0;
    top: -0.5px;
    height: 1px;
    background: var(--line-rest);
  }

  .fill {
    position: absolute;
    left: 0;
    top: -1px;
    height: 2px;
    width: calc(var(--p) * 100%);
    border-radius: var(--radius-line);
    background: var(--line-fill);
    transition:
      height 0.2s,
      top 0.2s,
      box-shadow 0.25s;
  }

  .running .fill {
    opacity: 0.35;
  }

  .live {
    position: absolute;
    left: 0;
    top: -2px;
    height: 4px;
    border-radius: var(--radius-line);
    background: var(--tone);
    box-shadow: var(--shadow-live);
  }

  .live-value {
    position: absolute;
    top: 1rem;
    transform: translateX(-50%);
    color: var(--tone);
    font-size: var(--text-label);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .value {
    position: absolute;
    bottom: calc(34% + 0.8rem);
    isolation: isolate;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    transition: text-shadow 0.25s;
  }

  /* the halo behind the number and unit of the lit line */
  .value::before {
    content: '';
    position: absolute;
    inset: -2.2rem -3rem;
    z-index: var(--layer-under);
    background: var(--halo);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
  }

  b {
    color: var(--tone);
    font-size: var(--text-large);
    font-weight: 300;
    letter-spacing: 0.01em;
  }

  i {
    margin-left: 0.25em;
    color: var(--dim);
    font-size: var(--text-body);
    font-style: normal;
    font-weight: 300;
  }

  .off b {
    color: var(--dim);
  }

  .lit .fill {
    top: -1.5px;
    height: 3px;
    box-shadow: var(--shadow-line);
  }

  .lit .value::before {
    opacity: 1;
  }

  .lit b {
    text-shadow: var(--shadow-glow-number);
  }

  .slider:focus-visible .rest {
    height: 2px;
    top: -1px;
  }
</style>
