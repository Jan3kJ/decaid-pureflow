<script lang="ts">
  // Types a value on screen: no system keyboard is needed.
  interface Props {
    label: string;
    unit: string;
    min: number;
    max: number;
    /** false for a value in whole numbers: the decimal key is off */
    decimals: boolean;
    /** the places after the point a decimal value takes; 1 unless a setting needs 2 (a flow multiplier of 0.05) */
    places?: number;
    /** the value before typing, shown until the first key */
    current: string;
    onconfirm: (value: number) => void;
    oncancel: () => void;
  }

  let { label, unit, min, max, decimals, places = 1, current, onconfirm, oncancel }: Props = $props();

  const MAX_LENGTH = 5;
  let typed = $state('');

  /** a range below 0 (the steam page's adjust amounts): the sign key takes the decimal key's place */
  const signed = $derived(min < 0 && !decimals);
  const digits = $derived(typed.replace('-', ''));
  const value = $derived(digits === '' || digits === '.' ? null : Number(typed));
  const inRange = $derived(value !== null && value >= min && value <= max);

  function key(k: string) {
    if (k === '.') {
      if (!decimals || typed.includes('.')) return;
      typed = typed === '' ? '0.' : typed + '.';
      return;
    }
    // One decimal is the finest step of a value, two of a few settings.
    if (typed.includes('.') && typed.split('.')[1].length >= places) return;
    if (digits.length >= MAX_LENGTH) return;
    typed = digits === '0' ? typed.replace('0', k) : typed + k;
  }

  function sign() {
    if (signed) typed = typed.startsWith('-') ? typed.slice(1) : `-${typed}`;
  }

  function confirm() {
    if (value !== null && inRange) onconfirm(value);
  }

  // A keyboard works too where there is one (development on a PC).
  function keydown(event: KeyboardEvent) {
    if (/^[0-9]$/.test(event.key)) key(event.key);
    else if (event.key === '.' || event.key === ',') key('.');
    else if (event.key === '-') sign();
    else if (event.key === 'Backspace') typed = typed.slice(0, -1);
    else if (event.key === 'Enter') confirm();
    else if (event.key === 'Escape') oncancel();
    else return;
    event.preventDefault();
  }
</script>

<svelte:window onkeydown={keydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" data-no-swipe data-testid="numpad-backdrop" onclick={(e) => e.target === e.currentTarget && oncancel()}>
  <div class="pad" role="dialog" aria-modal="true" aria-label="type {label}" data-testid="numpad">
    <div class="head">
      <span class="label">{label}</span>
      <button class="close" aria-label="cancel" data-testid="numpad-cancel" onclick={oncancel}>×</button>
    </div>
    <div class="display" class:placeholder={typed === ''} class:bad={typed !== '' && !inRange}>
      <span data-testid="numpad-display">{typed === '' ? current : typed}</span>
      <span class="unit">{unit}</span>
    </div>
    <div class="range" class:bad={typed !== '' && !inRange} data-testid="numpad-range">
      {min} to {max}
      {unit}
    </div>
    <div class="keys">
      {#each ['7', '8', '9', '4', '5', '6', '1', '2', '3'] as k (k)}
        <button data-testid="numpad-key-{k}" onclick={() => key(k)}>{k}</button>
      {/each}
      {#if signed}
        <button aria-label="change the sign" data-testid="numpad-key-sign" onclick={sign}>±</button>
      {:else}
        <button data-testid="numpad-key-dot" disabled={!decimals} onclick={() => key('.')}>.</button>
      {/if}
      <button data-testid="numpad-key-0" onclick={() => key('0')}>0</button>
      <button aria-label="delete the last digit" data-testid="numpad-back" onclick={() => (typed = typed.slice(0, -1))}>⌫</button>
      <button class="clear" data-testid="numpad-clear" onclick={() => (typed = '')}>clear</button>
      <button class="confirm primary" data-testid="numpad-confirm" disabled={!inRange} onclick={confirm}>set</button>
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
    width: 21rem;
    max-height: 96%;
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

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .label {
    font-size: var(--text-body);
    color: var(--dim);
  }

  .display {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 0.5rem;
    min-height: 3.6rem;
    padding: 0 0.9rem;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    font-size: var(--text-large);
    font-weight: 600;
    line-height: 3.6rem;
    font-variant-numeric: tabular-nums;
  }

  .display.placeholder {
    color: var(--dim);
  }

  .display.bad {
    border-color: var(--temperature);
  }

  .unit {
    font-size: var(--text-body);
    font-weight: 400;
    color: var(--dim);
  }

  .range {
    text-align: right;
    font-size: var(--text-label);
    color: var(--dim);
  }

  .range.bad {
    color: var(--temperature);
  }

  .keys {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.5rem;
  }

  button {
    grid-column: span 2;
    min-height: 4.2rem;
    font: inherit;
    font-size: var(--text-title);
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    touch-action: manipulation;
    user-select: none;
  }

  button:active:not(:disabled) {
    background: var(--line);
  }

  button:disabled {
    opacity: 0.35;
  }

  .close {
    min-height: 3rem;
    width: 3rem;
    background: none;
    border: 0;
    color: var(--dim);
  }

  .clear,
  .confirm {
    grid-column: span 3;
    font-size: var(--text-body);
  }

  .confirm {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
    font-weight: 600;
  }
</style>
