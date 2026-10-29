<script lang="ts">
  // A grinder's form on the beans screen (research.md 29.6): the model (required), the burrs,
  // the setting as numbers with the step of the pick's − and +, or as named positions, and
  // notes. An edit sends only what changed; archive and restore are the screen's.
  import type { Grinder } from '../api';
  import NumberPad from '../editor/NumberPad.svelte';
  import ValueChip from '../editor/ValueChip.svelte';
  import { grinderForm, validGrinder, type GrinderForm } from './catalogue';

  interface Props {
    /** null: a new grinder */
    grinder: Grinder | null;
    busy: boolean;
    onsave: (form: GrinderForm) => void;
    onarchive: () => void;
    onrestore: () => void;
  }

  let { grinder, busy, onsave, onarchive, onrestore }: Props = $props();

  // The form starts from the grinder it was made for: the screen makes a new one for another grinder.
  const initial = () => grinderForm(grinder);
  let form: GrinderForm = $state(initial());
  const changed = $derived(JSON.stringify(form) !== JSON.stringify(grinderForm(grinder)));
  const valid = $derived(validGrinder(form));
  let typingStep = $state(false);

  // The chip's − and + move the step by a tenth, inside the number pad's range.
  function nudgeStep(direction: 1 | -1) {
    form.smallStep = Math.min(10, Math.max(0.01, Math.round((form.smallStep + direction * 0.1) * 100) / 100));
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (valid && (changed || !grinder)) onsave($state.snapshot(form));
  }
</script>

<form class="form" onsubmit={submit} data-testid="grinder-form">
  <h2>{grinder ? grinder.model : 'Add a grinder'}</h2>
  {#if grinder?.archived}
    <p class="archived" data-testid="grinder-archived">Archived: not offered for the next shot; its shots stay in the history.</p>
  {/if}
  <label class:missing={!form.model.trim()}>
    <span>model</span>
    <input bind:value={form.model} autocomplete="off" spellcheck="false" enterkeyhint="next" data-testid="grinder-model" />
  </label>
  <label>
    <span>burrs</span>
    <input bind:value={form.burrs} autocomplete="off" spellcheck="false" enterkeyhint="next" data-testid="grinder-burrs" />
  </label>
  <div class="setting">
    <span class="caption">setting</span>
    <div class="choice" role="group" aria-label="setting type">
      <button
        type="button"
        class="select-fill"
        aria-pressed={form.settingType === 'numeric'}
        data-testid="grinder-numeric"
        onclick={() => (form.settingType = 'numeric')}>numbers</button
      >
      <button
        type="button"
        class="select-fill"
        aria-pressed={form.settingType === 'preset'}
        data-testid="grinder-preset"
        onclick={() => (form.settingType = 'preset')}>named positions</button
      >
    </div>
  </div>
  {#if form.settingType === 'numeric'}
    <div class="step-row">
      <ValueChip
        label="step"
        value={String(form.smallStep)}
        testid="grinder-step"
        onstep={nudgeStep}
        onedit={() => (typingStep = true)}
      />
    </div>
  {/if}
  {#if form.settingType === 'preset'}
    <label class:missing={!form.positions.trim()}>
      <span>positions, from fine to coarse, separated by commas</span>
      <input bind:value={form.positions} autocomplete="off" spellcheck="false" enterkeyhint="next" data-testid="grinder-positions" />
    </label>
  {/if}
  <label>
    <span>notes</span>
    <input bind:value={form.notes} autocomplete="off" enterkeyhint="done" data-testid="grinder-notes" />
  </label>

  <div class="actions">
    <button type="submit" class="primary" data-testid="grinder-save" disabled={busy || !valid || (grinder !== null && !changed)}>
      {grinder ? 'save' : 'add'}
    </button>
    {#if grinder && !grinder.archived}
      <button type="button" data-testid="grinder-archive" disabled={busy} onclick={onarchive}>archive</button>
    {:else if grinder}
      <button type="button" data-testid="grinder-restore" disabled={busy} onclick={onrestore}>restore</button>
    {/if}
  </div>
</form>

{#if typingStep}
  <NumberPad
    label="step of the setting"
    unit=""
    min={0.01}
    max={10}
    decimals
    places={2}
    current={String(form.smallStep)}
    onconfirm={(value: number) => {
      form.smallStep = value;
      typingStep = false;
    }}
    oncancel={() => (typingStep = false)}
  />
{/if}

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  h2 {
    margin: 0;
    font-size: var(--text-title);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--dim);
    font-size: var(--text-label);
  }

  input {
    min-height: 3.2rem;
    box-sizing: border-box;
    padding: 0 0.9rem;
    font: inherit;
    font-size: var(--text-value);
    color: var(--fg);
    color-scheme: dark;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    outline: none;
  }

  input:focus {
    border-color: var(--fg);
  }

  /* a required field that is empty */
  .missing input {
    border-color: var(--temperature);
  }

  .actions {
    display: flex;
    gap: 0.6rem;
  }

  button {
    min-height: 3.4rem;
    padding: 0 1.2rem;
    font: inherit;
    font-size: var(--text-body);
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    touch-action: manipulation;
    user-select: none;
  }

  button:disabled {
    opacity: 0.4;
  }

  .primary {
    min-width: 8rem;
    color: var(--bg);
    background: var(--fg);
    border-color: var(--fg);
    font-weight: 600;
  }

  .archived {
    margin: 0;
    color: var(--dim);
    font-size: var(--text-label);
  }

  .archived {
    color: var(--warn);
  }
  .setting {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .caption {
    min-width: 4rem;
    color: var(--dim);
    font-size: var(--text-label);
  }

  .choice {
    display: flex;
    gap: 0.3rem;
  }

  .step-row {
    display: flex;
  }

  .step-row :global(.chip) {
    min-width: 14rem;
  }
</style>
