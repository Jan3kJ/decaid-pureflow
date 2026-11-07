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
  import Lever from '../ui/Lever.svelte';
  import SettingsRow from './SettingsRow.svelte';
  import NumberPad from '../editor/NumberPad.svelte';
  import { clock, heldNumber, minutesOf, numberText, padMin, shownValue, type Field } from './fields';
  import type { Settings } from '../settings';

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
    /** the skin's settings, for a field's note */
    settings?: Settings;
  }

  let { field, raw, all, read, busy, error, onwrite, settings }: Props = $props();

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

<SettingsRow label={field.label} hint={field.hint} {busy} testid="row-{field.id}">
  {#snippet about()}
    {#if error}<small class="warn" data-testid="setting-error-{field.id}">{error}</small>{/if}
    {#if read && !known && field.kind !== 'info'}<small class="warn">not supported by this machine</small>{/if}
  {/snippet}
  {#if field.kind === 'number' || field.kind === 'time'}
    <button class="value" data-testid="setting-{field.id}" disabled={!known || busy} onclick={() => (typing = true)}>
      <b
        >{text}{#if field.kind === 'number' && field.unit}<i
            >{field.unit}{#if field.note && typeof value === 'number'}, {field.note(value, settings)}{/if}</i
          >{/if}</b
      >
    </button>
  {:else if field.kind === 'choice'}
    <div class="choices" data-testid="setting-{field.id}">
      {#each field.options as option (option.value)}
        <button
          class="chip select-outline"
          aria-pressed={value === option.value}
          disabled={!read || busy}
          data-testid="setting-{field.id}-{option.value}"
          onclick={() => value !== option.value && onwrite(option.value)}>{option.label}</button
        >
      {/each}
    </div>
  {:else if field.kind === 'switch'}
    <Lever
      checked={value === true}
      label={field.label}
      disabled={!known || busy}
      testid="setting-{field.id}"
      onchange={(on: boolean) => onwrite(on)}
    />
  {:else}
    <span class="info" data-testid="setting-{field.id}">{info ?? '–'}</span>
  {/if}
</SettingsRow>

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
  .warn {
    color: var(--temperature);
  }

  button:disabled {
    opacity: 0.5;
  }

  .choices {
    flex: 0 1 auto;
    max-width: 65%;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-1);
  }

  .info {
    max-width: 60%;
    overflow-wrap: anywhere;
    text-align: right;
    color: var(--dim);
  }
</style>
