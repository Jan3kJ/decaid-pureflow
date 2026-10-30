<script lang="ts">
  // A bean's form on the beans screen: name and roaster (required), the
  // current bag's roast date and notes. A new bean gets its first bag with it; an edit sends
  // only what changed. Archive, restore and a new bag are the screen's (it asks first).
  // A photo of the bag is taken with the live camera and stored when the bean
  // is saved.
  import { onMount } from 'svelte';
  import type { BeanBatch, CatalogueBean } from '../api';
  import DatePicker from '../shell/DatePicker.svelte';
  import Camera from './Camera.svelte';
  import { beanForm, beanTitle, dateOf, validBean, type BeanForm } from './catalogue';
  import { readPhoto } from './reading';

  interface Props {
    /** null: a new bean */
    bean: CatalogueBean | null;
    batch: BeanBatch | null;
    /** the catalogue's roasters, suggested in the roaster field */
    roasters: readonly string[];
    busy: boolean;
    /** the bean's stored photo, null for none */
    loadphoto: (beanId: string) => Promise<string | null>;
    /** `photo`: the new photo, null to delete it, undefined when it did not change */
    onsave: (form: BeanForm, photo: string | null | undefined) => Promise<boolean>;
    onarchive: () => void;
    onrestore: () => void;
    onnewbag: () => void;
  }

  let { bean, batch, roasters, busy, loadphoto, onsave, onarchive, onrestore, onnewbag }: Props = $props();

  // The form starts from the bean it was made for: the screen makes a new one for another bean or bag.
  const initial = () => beanForm(bean, batch);
  let form: BeanForm = $state(initial());
  /** the photo as stored; the form's photo differs after a new one or a removal */
  let storedPhoto: string | null = $state(null);
  let photo: string | null = $state(null);
  const photoChanged = $derived(photo !== storedPhoto);
  const changed = $derived(photoChanged || JSON.stringify(form) !== JSON.stringify(beanForm(bean, batch)));
  const valid = $derived(validBean(form));
  let picking = $state(false);
  let shooting = $state(false);

  onMount(() => {
    if (!bean) return;
    void loadphoto(bean.id).then((stored) => {
      // a photo taken before the stored one arrived stays the form's
      if (photo === storedPhoto) photo = stored;
      storedPhoto = stored;
    });
  });

  function captured(taken: string) {
    shooting = false;
    photo = taken;
    // The ocr flavour reads the new photo; the base flavour reads nothing. The form shows no line yet.
    void readPhoto(taken);
  }

  function pickRoastDate(value: string) {
    form.roastDate = value;
    picking = false;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!valid || (!changed && bean)) return;
    const saving = photo;
    if ((await onsave($state.snapshot(form), photoChanged ? saving : undefined)) && storedPhoto !== saving) storedPhoto = saving;
  }
</script>

<form class="form" onsubmit={submit} data-testid="bean-form">
  <h2>{bean ? beanTitle(bean) : 'Add a bean'}</h2>
  {#if bean?.archived}
    <p class="archived" data-testid="bean-archived">Archived: not offered for the next shot; its shots stay in the history.</p>
  {/if}
  <div class="photo">
    {#if photo}
      <img src={photo} alt="the bag" data-testid="bean-photo" />
    {/if}
    <div class="photo-tools">
      <div class="photo-buttons">
        <button type="button" data-testid="bean-photo-take" disabled={busy} onclick={() => (shooting = true)}>
          {photo ? 'new photo' : 'photo'}
        </button>
        {#if photo}
          <button type="button" data-testid="bean-photo-remove" disabled={busy} onclick={() => (photo = null)}>remove photo</button>
        {/if}
      </div>
    </div>
  </div>
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
      {bean ? 'save' : 'add'}
    </button>
    {#if bean && !bean.archived}
      <button type="button" data-testid="bean-new-bag" disabled={busy} onclick={onnewbag}>new bag</button>
      <button type="button" data-testid="bean-archive" disabled={busy} onclick={onarchive}>archive</button>
    {:else if bean}
      <button type="button" data-testid="bean-restore" disabled={busy} onclick={onrestore}>restore</button>
    {/if}
  </div>
  {#if bean && batch}
    <p class="hint" data-testid="bean-bag">
      This bag since {dateOf(batch.createdAt)}{batch.roastDate ? `, roasted ${dateOf(batch.roastDate)}` : ''}. A new bag starts the
      next one of this bean.
    </p>
  {/if}
</form>

{#if shooting}
  <Camera oncapture={captured} oncancel={() => (shooting = false)} />
{/if}

{#if picking}
  <DatePicker label="roast date" value={form.roastDate} onpick={pickRoastDate} oncancel={() => (picking = false)} />
{/if}

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
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
    gap: var(--space-1);
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
    gap: var(--space-2);
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

  .photo {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .photo img {
    height: 6.5rem;
    max-width: 9rem;
    object-fit: cover;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .photo-tools {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .photo-buttons {
    display: flex;
    gap: var(--space-2);
    align-items: center;
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
