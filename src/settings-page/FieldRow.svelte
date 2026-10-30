<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
  src/settings/settings.js (the rows of its settings, settings_ui.md).
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // One setting of the settings page: its name and hint on the left, its value on the right as
  // a value button (the number pad), a row of choices or a switch. The page writes it.
  import NumberPad from '../editor/NumberPad.svelte';
  import { clock, heldNumber, minutesOf, numberText, padMin, shownValue, type Field } from './fields';

  interface Props {
    field: Field;
    /** the value the gateway holds; undefined while it is not read */
    raw: unknown;
    /** the whole object of the field's source, for a read-only value made of several */
    all: Record<string, unknown> | null;
    /** the source was read: a value it lacks is not on this machine */
    read: boolean;
    /** a write of this field is in flight */
    busy: boolean;
    /** why the last write failed */
    error: string | null;
    onwrite: (value: unknown) => void;
  }

  let { field, raw, all, read, busy, error, onwrite }: Props = $props();

  const value = $derived(shownValue(field, raw));
  const known = $derived(value !== undefined && value !== null);
  let typing = $state(false);

  const text = $derived.by(() => {
    if (!known) return '–';
    if (field.kind === 'number' && typeof value === 'number') return numberText(field, value);
    if (field.kind === 'time' && typeof value === 'number') return clock(value);
    return String(value);
  });

  function typed(entered: number) {
    typing = false;
    if (field.kind === 'number') onwrite(heldNumber(field, entered));
    else if (field.kind === 'time') {
      const minutes = minutesOf(entered);
      if (minutes !== null) onwrite(minutes);
    }
  }

  const info = $derived(field.kind === 'info' ? (field.format ? field.format(raw, all ?? {}) : known ? String(raw) : null) : null);
</script>

<div class="row" class:busy data-testid="row-{field.id}">
  <div class="about">
    <strong>{field.label}</strong>
    {#if field.hint}<small>{field.hint}</small>{/if}
    {#if error}<small class="warn" data-testid="setting-error-{field.id}">{error}</small>{/if}
    {#if read && !known && field.kind !== 'info'}<small class="warn">not supported by this machine</small>{/if}
  </div>

  {#if field.kind === 'number' || field.kind === 'time'}
    <button class="value" data-testid="setting-{field.id}" disabled={!known || busy} onclick={() => (typing = true)}>
      <b
        >{text}{#if field.kind === 'number' && field.unit}<i
            >{field.unit}{#if field.note && typeof value === 'number'}, {field.note(value)}{/if}</i
          >{/if}</b
      >
    </button>
  {:else if field.kind === 'choice'}
    <div class="choices" data-testid="setting-{field.id}">
      {#each field.options as option (option.value)}
        <button
          class="chip select-fill"
          aria-pressed={value === option.value}
          disabled={!read || busy}
          data-testid="setting-{field.id}-{option.value}"
          onclick={() => value !== option.value && onwrite(option.value)}>{option.label}</button
        >
      {/each}
    </div>
  {:else if field.kind === 'switch'}
    <button
      class="lever-button"
      role="switch"
      aria-label={field.label}
      aria-checked={value === true}
      disabled={!known || busy}
      data-testid="setting-{field.id}"
      onclick={() => onwrite(value !== true)}><span class="lever"><span></span></span></button
    >
  {:else}
    <span class="info" data-testid="setting-{field.id}">{info ?? '–'}</span>
  {/if}
</div>

{#if typing && field.kind === 'number'}
  <NumberPad
    label={field.label}
    unit={field.unit}
    min={padMin(field)}
    max={field.max}
    decimals={field.places > 0}
    places={field.places}
    current={text}
    onconfirm={typed}
    oncancel={() => (typing = false)}
  />
{:else if typing && field.kind === 'time'}
  <NumberPad
    label="{field.label}, hhmm"
    unit=""
    min={0}
    max={2359}
    decimals={false}
    current={text.replace(':', '')}
    onconfirm={typed}
    oncancel={() => (typing = false)}
  />
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-top: 1px solid var(--line);
  }

  .busy {
    opacity: 0.6;
  }

  .about {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  strong {
    font-size: var(--text-body);
    font-weight: 600;
  }

  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  .warn {
    color: var(--temperature);
  }

  button {
    font: inherit;
    color: var(--fg);
    touch-action: manipulation;
    user-select: none;
  }

  button:disabled {
    opacity: 0.5;
  }

  .value {
    flex: none;
    min-width: 8rem;
    min-height: 3.6rem;
    padding: 0 0.8rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .value b {
    font-size: var(--text-value);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  i {
    margin-left: 0.25em;
    font-style: normal;
    font-size: var(--text-label);
    font-weight: 400;
    color: var(--dim);
  }

  .choices {
    flex: 0 1 auto;
    max-width: 65%;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-1);
  }

  .chip {
    min-height: 3rem;
    padding: 0 0.9rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 1.5rem;
  }

  .info {
    max-width: 60%;
    overflow-wrap: anywhere;
    text-align: right;
    color: var(--dim);
  }

  .lever-button {
    flex: none;
    min-height: 3.6rem;
    padding: 0;
    background: none;
    border: 0;
  }

  .lever {
    display: block;
    width: 4.4rem;
    height: 2.4rem;
    padding: var(--space-1);
    box-sizing: border-box;
    border-radius: 1.2rem;
    background: var(--raised);
    border: 1px solid var(--line);
  }

  .lever span {
    display: block;
    width: 1.8rem;
    height: 100%;
    border-radius: 50%;
    background: var(--dim);
    transition: transform 0.12s;
  }

  [aria-checked='true'] .lever {
    background: var(--pressure);
    border-color: var(--pressure);
  }

  [aria-checked='true'] .lever span {
    background: var(--bg);
    transform: translateX(2rem);
  }
</style>
