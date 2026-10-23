<script lang="ts">
  // A bean's form on the beans screen (research.md 29.6): name and roaster (required), the
  // current bag's roast date and notes. A new bean gets its first bag with it; an edit sends
  // only what changed. Archive, restore and a new bag are the screen's (it asks first).
  import type { BeanBatch, CatalogueBean } from '../api';
  import DatePicker from '../shell/DatePicker.svelte';
  import { beanForm, beanTitle, dateOf, validBean, type BeanForm } from './catalogue';

  interface Props {
    /** null: a new bean */
    bean: CatalogueBean | null;
    batch: BeanBatch | null;
    /** the catalogue's roasters, suggested in the roaster field */
    roasters: readonly string[];
    busy: boolean;
    onsave: (form: BeanForm) => void;
    onarchive: () => void;
    onrestore: () => void;
    onnewbag: () => void;
  }

  let { bean, batch, roasters, busy, onsave, onarchive, onrestore, onnewbag }: Props = $props();

  // The form starts from the bean it was made for: the screen makes a new one for another bean or bag.
  const initial = () => beanForm(bean, batch);
  let form: BeanForm = $state(initial());
  const changed = $derived(JSON.stringify(form) !== JSON.stringify(beanForm(bean, batch)));
  const valid = $derived(validBean(form));
  let picking = $state(false);

  function pickRoastDate(value: string) {
    form.roastDate = value;
    picking = false;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (valid && (changed || !bean)) onsave($state.snapshot(form));
  }
</script>

<form class="form" onsubmit={submit} data-testid="bean-form">
  <h2>{bean ? beanTitle(bean) : 'Add a bean'}</h2>
  {#if bean?.archived}
    <p class="archived" data-testid="bean-archived">Archived: not offered for the next shot; its shots stay in the history.</p>
  {/if}
  <label class:missing={!form.name.trim()}>
    <span>name</span>
    <input bind:value={form.name} autocomplete="off" spellcheck="false" enterkeyhint="next" data-testid="bean-name" />
  </label>
  <label class:missing={!form.roaster.trim()}>
    <span>roaster</span>
    <input
      bind:value={form.roaster}
      list="bean-roasters"
      autocomplete="off"
      spellcheck="false"
      enterkeyhint="next"
      data-testid="bean-roaster"
    />
    <datalist id="bean-roasters">
      {#each roasters as roaster (roaster)}<option value={roaster}></option>{/each}
    </datalist>
  </label>
  <div class="field">
    <span id="bean-roast-date-label">roast date{bean ? ' of this bag' : ''}</span>
    <button
      type="button"
      class="date"
      class:none={!form.roastDate}
      aria-labelledby="bean-roast-date-label"
      data-testid="bean-roast-date"
      onclick={() => (picking = true)}>{dateOf(form.roastDate) || 'no roast date'}</button
    >
  </div>
  <label>
    <span>notes</span>
    <input bind:value={form.notes} autocomplete="off" enterkeyhint="done" data-testid="bean-notes" />
  </label>

  <div class="actions">
    <button type="submit" class="primary" data-testid="bean-save" disabled={busy || !valid || (bean !== null && !changed)}>
      {bean ? 'Save' : 'Add'}
    </button>
    {#if bean && !bean.archived}
      <button type="button" data-testid="bean-new-bag" disabled={busy} onclick={onnewbag}>New bag</button>
      <button type="button" data-testid="bean-archive" disabled={busy} onclick={onarchive}>Archive</button>
    {:else if bean}
      <button type="button" data-testid="bean-restore" disabled={busy} onclick={onrestore}>Restore</button>
    {/if}
  </div>
  {#if bean && batch}
    <p class="hint" data-testid="bean-bag">
      This bag since {dateOf(batch.createdAt)}{batch.roastDate ? `, roasted ${dateOf(batch.roastDate)}` : ''}. A new bag starts the
      next one of this bean.
    </p>
  {/if}
</form>

{#if picking}
  <DatePicker label="roast date" value={form.roastDate} onpick={pickRoastDate} oncancel={() => (picking = false)} />
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

  label,
  .field {
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

  .date {
    text-align: left;
    padding: 0 0.9rem;
    font-size: var(--text-value);
    background: var(--bg);
  }

  .date.none {
    color: var(--dim);
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

  .hint,
  .archived {
    margin: 0;
    color: var(--dim);
    font-size: var(--text-label);
  }

  .archived {
    color: var(--warn);
  }
</style>
