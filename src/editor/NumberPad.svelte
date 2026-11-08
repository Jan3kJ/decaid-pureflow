<script lang="ts">
  // Types a value on screen: no system keyboard is needed.
  import Dialog from '../ui/Dialog.svelte';

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
    /** the quantity's colour: the number and the keys glow in it, white without */
    tone?: 'flow' | 'pressure' | 'temperature' | 'weight' | 'time';
    onconfirm: (value: number) => void;
    oncancel: () => void;
  }

  let { label, unit, min, max, decimals, places = 1, current, tone, onconfirm, oncancel }: Props = $props();

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

  // A keyboard works too where there is one (development on a PC); Escape is the dialog's.
  function keydown(event: KeyboardEvent) {
    if (/^[0-9]$/.test(event.key)) key(event.key);
    else if (event.key === '.' || event.key === ',') key('.');
    else if (event.key === '-') sign();
    else if (event.key === 'Backspace') typed = typed.slice(0, -1);
    else if (event.key === 'Enter') confirm();
    else return;
    event.preventDefault();
  }
</script>

<svelte:window onkeydown={keydown} />

<Dialog label="type {label}" width="21rem" testid="numpad" backdrop="numpad-backdrop" {oncancel}>
  <div class="pad {tone ?? ''}" style:--glow-rgb={tone ? `var(--${tone}-rgb)` : undefined}>
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
        <button class="pad-key" data-testid="numpad-key-{k}" onclick={() => key(k)}>{k}</button>
      {/each}
      {#if signed}
        <button class="pad-key" aria-label="change the sign" data-testid="numpad-key-sign" onclick={sign}>±</button>
      {:else}
        <button class="pad-key" data-testid="numpad-key-dot" disabled={!decimals} onclick={() => key('.')}>.</button>
      {/if}
      <button class="pad-key" data-testid="numpad-key-0" onclick={() => key('0')}>0</button>
      <button class="pad-key" aria-label="delete the last digit" data-testid="numpad-back" onclick={() => (typed = typed.slice(0, -1))}
        >⌫</button
      >
      <button class="clear pad-key" data-testid="numpad-clear" onclick={() => (typed = '')}>clear</button>
      <button class="confirm primary pad-key" data-testid="numpad-confirm" disabled={!inRange} onclick={confirm}>set</button>
    </div>
  </div>
</Dialog>

<style>
  .pad {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
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
    gap: var(--space-2);
    min-height: var(--control-big);
    padding: 0 0.9rem;
    border-bottom: 1px solid var(--edge);
    border-radius: var(--radius-none);
    font-size: var(--text-big);
    font-weight: 300;

    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }

  .flow .display {
    color: var(--flow);
    text-shadow: var(--shadow-glow-flow);
  }

  .pressure .display {
    color: var(--pressure);
    text-shadow: var(--shadow-glow-pressure);
  }

  .temperature .display {
    color: var(--temperature);
    text-shadow: var(--shadow-glow-temperature);
  }

  .weight .display {
    color: var(--weight);
    text-shadow: var(--shadow-glow-weight);
  }

  .time .display {
    color: var(--time);
    text-shadow: var(--shadow-glow-time);
  }

  .display.placeholder {
    color: var(--dim);
  }

  .display.bad {
    border-bottom-color: var(--temperature);
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
    gap: var(--space-2);
  }

  .keys button {
    grid-column: span 2;
  }

  button:disabled {
    opacity: 0.35;
  }

  .close {
    min-height: var(--control);
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
</style>
