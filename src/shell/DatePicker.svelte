<script lang="ts">
  // Picks a date on screen, in the number pad's dialog: a month grid, weeks from Monday. The
  // value is an ISO date (`YYYY-MM-DD`) or '' for none; a date after today is allowed. A vertical
  // drag on the day grid scrolls through the months, as the wheel does (spec 3.14 item 12).
  import {
    addMonths,
    DRAG_SLOP,
    followDrag,
    monthGrid,
    monthOf,
    MONTH_NAMES,
    snapDrag,
    todayIso,
    wheelMonths,
    WEEKDAYS,
    WHEEL_STEP,
    type Month,
  } from './calendar';

  interface Props {
    label: string;
    /** the date before picking, '' for none */
    value: string;
    /** a date, or '' after 'clear' */
    onpick: (value: string) => void;
    oncancel: () => void;
  }

  let { label, value, onpick, oncancel }: Props = $props();

  const today = todayIso();
  // The dialog opens on the chosen date's month, else on today's.
  const opening = () => monthOf(value) ?? monthOf(today)!;
  let shown: Month = $state(opening());
  /** after a tap on the year the arrows step by year, until the next tap on it */
  let byYear = $state(false);
  const weeks = $derived(monthGrid(shown));
  const before = $derived(monthGrid(addMonths(shown, -1)));
  const after = $derived(monthGrid(addMonths(shown, 1)));
  const shownKey = $derived(`${shown.year}-${String(shown.month).padStart(2, '0')}`);

  const step = (direction: number) => (shown = addMonths(shown, direction * (byYear ? 12 : 1)));

  // The drag: the months above and below sit beside the shown one in a strip that follows the
  // finger by `offset` pixels; the shown month moves as the finger passes half of the next.
  let viewport: HTMLDivElement | undefined = $state();
  let strip: HTMLDivElement | undefined = $state();
  let offset = $state(0);
  let drag: { id: number; startY: number; base: number; moving: boolean; samples: { t: number; y: number }[] } | null = null;
  /** a drag just ended: the click it may leave on a day is no tap */
  let dragged = false;
  /** the wheel's travel not yet a month */
  let travel = 0;

  /** one month's height in the strip, in pixels */
  const monthHeight = () => (strip?.getBoundingClientRect().height ?? 0) / 3;

  function pointerdown(event: PointerEvent) {
    if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    dragged = false;
    strip?.getAnimations().forEach((animation) => animation.finish());
    drag = {
      id: event.pointerId,
      startY: event.clientY,
      base: offset,
      moving: false,
      samples: [{ t: event.timeStamp, y: event.clientY }],
    };
  }

  function pointermove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = event.clientY - drag.startY;
    if (!drag.moving) {
      if (Math.abs(moved) <= DRAG_SLOP) return;
      drag.moving = true;
      viewport?.setPointerCapture(event.pointerId);
    }
    drag.samples = [...drag.samples.filter((sample) => sample.t >= event.timeStamp - 100), { t: event.timeStamp, y: event.clientY }];
    const followed = followDrag(drag.base + moved, monthHeight());
    if (followed.months) {
      shown = addMonths(shown, followed.months);
      drag.base = followed.offset - moved;
    }
    offset = followed.offset;
  }

  function pointerup(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    const { moving, samples } = drag;
    drag = null;
    if (!moving) return;
    dragged = true;
    // The speed over the last tenth of a second: none after the finger rested.
    const recent = [...samples, { t: event.timeStamp, y: event.clientY }].filter((sample) => sample.t >= event.timeStamp - 100);
    const span = recent.length > 1 ? recent.at(-1)!.t - recent[0].t : 0;
    const velocity = event.type === 'pointerup' && span > 0 ? (recent.at(-1)!.y - recent[0].y) / span : 0;
    const height = monthHeight();
    const snapped = snapDrag(offset, height, velocity);
    shown = addMonths(shown, snapped.months);
    settle(Math.max(-height, Math.min(height, snapped.offset)));
  }

  /** slides the strip from `from` pixels to rest */
  function settle(from: number) {
    offset = 0;
    if (!from || !strip) return;
    const at = (px: number) => `translateY(calc(-100% / 3 + ${px}px))`;
    strip.animate([{ transform: at(from) }, { transform: at(0) }], { duration: 220, easing: 'ease-out' });
  }

  function clickcapture(event: MouseEvent) {
    if (!dragged) return;
    dragged = false;
    event.stopPropagation();
    event.preventDefault();
  }

  // The wheel is taken before the dialog scrolls with it, so it is not passive.
  $effect(() => {
    const target = viewport;
    if (!target) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      // A line is taken as 40 pixels, a page as a month.
      const delta = event.deltaY * [1, 40, WHEEL_STEP][event.deltaMode];
      const turned = wheelMonths(travel, delta);
      travel = turned.travel;
      if (turned.months) shown = addMonths(shown, turned.months);
    };
    target.addEventListener('wheel', wheel, { passive: false });
    return () => target.removeEventListener('wheel', wheel);
  });

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') oncancel();
    else if (event.key === 'ArrowLeft' || event.key === 'PageUp') step(-1);
    else if (event.key === 'ArrowRight' || event.key === 'PageDown') step(1);
    else return;
    event.preventDefault();
  }
</script>

<svelte:window onkeydown={keydown} />

<!-- a month beside the shown one, seen only while the grid is dragged -->
{#snippet ghost(grid: (string | null)[][])}
  <div class="grid" aria-hidden="true">
    {#each grid as week, w (w)}
      {#each week as day, d (d)}
        <span class:day class:today={day === today} class:chosen={day && day === value}>{day ? Number(day.slice(8)) : ''}</span>
      {/each}
    {/each}
  </div>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" data-no-swipe data-testid="datepicker-backdrop" onclick={(e) => e.target === e.currentTarget && oncancel()}>
  <div class="pad" role="dialog" aria-modal="true" aria-label="pick {label}" data-testid="datepicker">
    <div class="head">
      <span class="label">{label}</span>
      <button class="close" aria-label="cancel" data-testid="datepicker-close" onclick={oncancel}>×</button>
    </div>
    <div class="nav">
      <button
        class="arrow"
        aria-label={byYear ? 'previous year' : 'previous month'}
        data-testid="datepicker-prev"
        onclick={() => step(-1)}>‹</button
      >
      <div class="title" data-testid="datepicker-month" data-month={shownKey}>
        <button class="part" class:on={!byYear} data-testid="datepicker-month-name" onclick={() => (byYear = false)}>
          {MONTH_NAMES[shown.month - 1]}
        </button>
        <button class="part" class:on={byYear} aria-pressed={byYear} data-testid="datepicker-year" onclick={() => (byYear = !byYear)}>
          {shown.year}
        </button>
      </div>
      <button class="arrow" aria-label={byYear ? 'next year' : 'next month'} data-testid="datepicker-next" onclick={() => step(1)}
        >›</button
      >
    </div>
    <div class="weekdays">
      {#each WEEKDAYS as weekday (weekday)}<span class="weekday">{weekday}</span>{/each}
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="viewport"
      data-testid="datepicker-grid"
      bind:this={viewport}
      onpointerdown={pointerdown}
      onpointermove={pointermove}
      onpointerup={pointerup}
      onpointercancel={pointerup}
      onclickcapture={clickcapture}
    >
      <div class="strip" bind:this={strip} style:--offset="{offset}px">
        {@render ghost(before)}
        <div class="grid" role="group" aria-label="{MONTH_NAMES[shown.month - 1]} {shown.year}">
          {#each weeks as week, w (w)}
            {#each week as day, d (d)}
              {#if day}
                <button
                  class="day select-fill"
                  class:today={day === today}
                  aria-pressed={day === value}
                  data-testid="datepicker-day-{day}"
                  onclick={() => onpick(day)}>{Number(day.slice(8))}</button
                >
              {:else}
                <span></span>
              {/if}
            {/each}
          {/each}
        </div>
        {@render ghost(after)}
      </div>
    </div>
    <div class="actions">
      <button data-testid="datepicker-today" onclick={() => onpick(today)}>today</button>
      <button data-testid="datepicker-clear" onclick={() => onpick('')}>clear</button>
      <button data-testid="datepicker-cancel" onclick={oncancel}>cancel</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 55%);
  }

  .pad {
    max-height: 96%;
    overflow-y: auto;
    box-sizing: border-box;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 1.2rem;
    box-shadow: 0 0.6rem 2.4rem rgb(0 0 0 / 70%);
  }

  .head,
  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .label {
    font-size: var(--text-body);
    color: var(--dim);
  }

  button {
    min-height: 3.5rem;
    font: inherit;
    font-size: var(--text-value);
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    touch-action: manipulation;
    user-select: none;
  }

  button:active {
    background: var(--line);
  }

  .close {
    min-height: 3rem;
    width: 3rem;
    font-size: var(--text-title);
    background: none;
    border: 0;
    color: var(--dim);
  }

  .arrow {
    width: 3.5rem;
    font-size: var(--text-title);
  }

  .title {
    display: flex;
    gap: 0.3rem;
  }

  .part {
    padding: 0 0.7rem;
    font-weight: 600;
    background: none;
    border-color: transparent;
  }

  /* the part the arrows step */
  .part.on {
    border-color: var(--line);
  }

  .weekdays,
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 3.5rem);
    gap: 0.4rem;
  }

  /* Six weeks of room for every month, so the dialog keeps its height and a drag slides by one
     month's height; the strip holds the month before, the shown one and the one after. */
  .viewport {
    --month: calc(6 * 3.5rem + 6 * 0.4rem);
    /* a pixel short of the month, so no rounding shows the edge of the next one's first row */
    height: calc(var(--month) - 1px);
    overflow: hidden;
    touch-action: none;
  }

  .strip {
    transform: translateY(calc(-100% / 3 + var(--offset)));
  }

  .grid {
    height: var(--month);
    box-sizing: border-box;
    padding-bottom: 0.4rem;
    grid-template-rows: repeat(6, 3.5rem);
    align-content: start;
  }

  .weekday {
    text-align: center;
    font-size: var(--text-label);
    color: var(--dim);
  }

  .day {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    font-size: var(--text-value);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    width: 3.5rem;
    height: 3.5rem;
    padding: 0;
    font-variant-numeric: tabular-nums;
  }

  .day.today {
    border: 2px solid var(--fg);
  }

  .actions {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin-top: 0.3rem;
  }

  .actions button {
    font-size: var(--text-body);
  }
</style>
