<script lang="ts">
  // Picks a date on screen, in the number pad's dialog: a month grid, weeks from Monday. The
  // value is an ISO date (`YYYY-MM-DD`) or '' for none; a date after today is allowed.
  import { addMonths, monthGrid, monthOf, MONTH_NAMES, todayIso, WEEKDAYS, type Month } from './calendar';

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
  const shownKey = $derived(`${shown.year}-${String(shown.month).padStart(2, '0')}`);

  const step = (direction: number) => (shown = addMonths(shown, direction * (byYear ? 12 : 1)));

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') oncancel();
    else if (event.key === 'ArrowLeft' || event.key === 'PageUp') step(-1);
    else if (event.key === 'ArrowRight' || event.key === 'PageDown') step(1);
    else return;
    event.preventDefault();
  }
</script>

<svelte:window onkeydown={keydown} />

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
    <div class="grid" role="group" aria-label="{MONTH_NAMES[shown.month - 1]} {shown.year}">
      {#each WEEKDAYS as weekday (weekday)}<span class="weekday">{weekday}</span>{/each}
      {#each weeks as week, w (w)}
        {#each week as day, d (d)}
          {#if day}
            <button
              class="day"
              class:today={day === today}
              class:chosen={day === value}
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
    font-size: 1.05rem;
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
    font-size: 1.7rem;
    background: none;
    border: 0;
    color: var(--dim);
  }

  .arrow {
    width: 3.5rem;
    font-size: 1.9rem;
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

  .grid {
    display: grid;
    grid-template-columns: repeat(7, 3.5rem);
    gap: 0.4rem;
  }

  .weekday {
    text-align: center;
    font-size: var(--text-label);
    color: var(--dim);
  }

  .day {
    width: 3.5rem;
    height: 3.5rem;
    padding: 0;
    font-variant-numeric: tabular-nums;
  }

  .day.today {
    border: 2px solid var(--fg);
  }

  .day.chosen {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
    font-weight: 600;
  }

  .actions {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin-top: 0.3rem;
  }

  .actions button {
    font-size: 1.25rem;
  }
</style>
