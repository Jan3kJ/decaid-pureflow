<script lang="ts">
  // A grinder's form on the beans screen: the model (required), the burrs,
  // the setting as numbers with the step of the pick's − and +, or as named positions, and
  // notes. An edit sends only what changed; archive and restore are the screen's.
  import type { Grinder } from '../api';
  import NumberPad from '../editor/NumberPad.svelte';
  import ValueChip from '../editor/ValueChip.svelte';
  import Field from './Field.svelte';
  import Form from './Form.svelte';
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

<Form kind="grinder" title={grinder ? grinder.model : 'Add a grinder'} archived={grinder?.archived ?? false} onsubmit={submit}>
  <Field
    label="model"
    bind:value={form.model}
    missing={!form.model.trim()}
    spellcheck={false}
    enterkeyhint="next"
    testid="grinder-model"
  />
  <Field label="burrs" bind:value={form.burrs} spellcheck={false} enterkeyhint="next" testid="grinder-burrs" />
  <div class="setting">
    <span class="caption">setting</span>
    <div class="choice" role="group" aria-label="setting type">
      <button
        type="button"
        class="form-button select-fill"
        aria-pressed={form.settingType === 'numeric'}
        data-testid="grinder-numeric"
        onclick={() => (form.settingType = 'numeric')}>numbers</button
      >
      <button
        type="button"
        class="form-button select-fill"
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
    <Field
      label="positions, from fine to coarse, separated by commas"
      bind:value={form.positions}
      missing={!form.positions.trim()}
      spellcheck={false}
      enterkeyhint="next"
      testid="grinder-positions"
    />
  {/if}
  <Field label="notes" bind:value={form.notes} enterkeyhint="done" testid="grinder-notes" />

  {#snippet actions()}
    <button
      type="submit"
      class="form-button primary"
      data-testid="grinder-save"
      disabled={busy || !valid || (grinder !== null && !changed)}
    >
      {grinder ? 'save' : 'add'}
    </button>
    {#if grinder && !grinder.archived}
      <button type="button" class="form-button" data-testid="grinder-archive" disabled={busy} onclick={onarchive}>archive</button>
    {:else if grinder}
      <button type="button" class="form-button" data-testid="grinder-restore" disabled={busy} onclick={onrestore}>restore</button>
    {/if}
  {/snippet}
</Form>

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
  .setting {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .caption {
    min-width: 4rem;
    color: var(--dim);
    font-size: var(--text-label);
  }

  .choice {
    display: flex;
    gap: var(--space-1);
  }

  .step-row {
    display: flex;
  }

  .step-row :global(.value-chip) {
    min-width: 14rem;
  }
</style>
