<script lang="ts">
  // A bean's form on the beans screen (research.md 29.6): name and roaster (required), the
  // current bag's roast date and notes. A new bean gets its first bag with it; an edit sends
  // only what changed. Archive, restore and a new bag are the screen's (it asks first).
  // A photo of the bag (spec 3.9 item 20) is taken with the live camera; reading it pre-fills
  // an empty name and roaster, which the user corrects; the lines it read are chips under the
  // photo, and a tap on one puts it into the name or the roaster, whichever had the focus last.
  // It is stored when the bean is saved.
  import { onDestroy, onMount } from 'svelte';
  import type { BeanBatch, CatalogueBean } from '../api';
  import DatePicker from '../shell/DatePicker.svelte';
  import Camera from './Camera.svelte';
  import { beanForm, beanTitle, dateOf, validBean, type BeanForm } from './catalogue';
  import type { KnownBean, OcrProgress } from './ocr';
  import type { Capture } from './photo';
  import { readBag } from './read';

  interface Props {
    /** null: a new bean */
    bean: CatalogueBean | null;
    batch: BeanBatch | null;
    /** the catalogue's roasters, suggested in the roaster field */
    roasters: readonly string[];
    /** the catalogue's beans, which help to read a bag's photo */
    known: readonly KnownBean[];
    busy: boolean;
    /** the bean's stored photo, null for none */
    loadphoto: (beanId: string) => Promise<string | null>;
    /** `photo`: the new photo, null to delete it, undefined when it did not change */
    onsave: (form: BeanForm, photo: string | null | undefined) => Promise<boolean>;
    onarchive: () => void;
    onrestore: () => void;
    onnewbag: () => void;
  }

  let { bean, batch, roasters, known, busy, loadphoto, onsave, onarchive, onrestore, onnewbag }: Props = $props();

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
  /** the reading of the photo, while it runs */
  let reading: OcrProgress | null = $state(null);
  let readNote: string | null = $state(null);
  /** the lines the reading gave, offered for the fields */
  let chips: string[] = $state([]);
  /** the field a chip goes into: the one that had the focus last */
  let target: 'name' | 'roaster' = $state('name');
  let nameInput: HTMLInputElement | undefined = $state();
  let roasterInput: HTMLInputElement | undefined = $state();
  let stopReading: AbortController | null = null;

  onMount(() => {
    if (!bean) return;
    void loadphoto(bean.id).then((stored) => {
      // a photo taken before the stored one arrived stays the form's
      if (photo === storedPhoto) photo = stored;
      storedPhoto = stored;
    });
  });

  onDestroy(() => stopReading?.abort());

  function captured(capture: Capture) {
    shooting = false;
    photo = capture.photo;
    chips = [];
    if (!form.name.trim() || !form.roaster.trim()) void read(capture.source);
  }

  async function read(source: HTMLCanvasElement) {
    stopReading?.abort();
    const controller = new AbortController();
    stopReading = controller;
    readNote = null;
    reading = { status: 'Loading the reader', progress: 0 };
    try {
      const found = await readBag(source, known, (progress) => !controller.signal.aborted && (reading = progress), controller.signal);
      // only empty fields: what the user typed meanwhile stays
      if (!form.name.trim() && found.name) form.name = found.name;
      if (!form.roaster.trim() && found.roaster) form.roaster = found.roaster;
      chips = found.chips;
      if (!found.chips.length && !found.name && !found.roaster) readNote = 'Nothing could be read from this photo.';
    } catch (error) {
      if (!controller.signal.aborted)
        readNote = `The photo was not read${error instanceof Error && error.message ? `: ${error.message}` : ''}.`;
    } finally {
      if (stopReading === controller) {
        stopReading = null;
        reading = null;
      }
    }
  }

  function useChip(text: string) {
    form[target] = text;
    (target === 'name' ? nameInput : roasterInput)?.focus();
  }

  function removePhoto() {
    photo = null;
    chips = [];
    readNote = null;
  }

  function cancelReading() {
    stopReading?.abort();
    stopReading = null;
    reading = null;
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
          {photo ? 'New photo' : 'Photo'}
        </button>
        {#if photo}
          <button type="button" data-testid="bean-photo-remove" disabled={busy} onclick={removePhoto}>Remove photo</button>
        {/if}
      </div>
      {#if reading}
        <div class="reading" role="status" data-testid="bean-ocr">
          <span data-testid="bean-ocr-status">{reading.status} {Math.round(reading.progress * 100)}%</span>
          <button type="button" class="small" data-testid="bean-ocr-cancel" onclick={cancelReading}>Cancel</button>
        </div>
      {:else if readNote}
        <p class="hint" data-testid="bean-ocr-note">{readNote}</p>
      {:else if chips.length}
        <p class="hint" data-testid="bean-ocr-hint">Tap a line to put it into the {target}.</p>
      {:else if !photo}
        <p class="hint">A photo of the bag fills an empty name and roaster from its print.</p>
      {/if}
    </div>
  </div>
  {#if chips.length && photo}
    <div class="chips" data-testid="bean-ocr-chips">
      {#each chips as chip (chip)}
        <!-- a press keeps the focus in the field the chip goes into -->
        <button
          type="button"
          class="chip"
          data-testid="bean-ocr-chip"
          onpointerdown={(event) => event.preventDefault()}
          onmousedown={(event) => event.preventDefault()}
          onclick={() => useChip(chip)}>{chip}</button
        >
      {/each}
    </div>
  {/if}
  <label class:missing={!form.name.trim()}>
    <span>name</span>
    <input
      bind:this={nameInput}
      bind:value={form.name}
      onfocus={() => (target = 'name')}
      autocomplete="off"
      spellcheck="false"
      enterkeyhint="next"
      data-testid="bean-name"
    />
  </label>
  <label class:missing={!form.roaster.trim()}>
    <span>roaster</span>
    <input
      bind:this={roasterInput}
      bind:value={form.roaster}
      onfocus={() => (target = 'roaster')}
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

  .photo {
    display: flex;
    gap: 0.8rem;
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
    gap: 0.4rem;
    min-width: 0;
  }

  .photo-buttons,
  .reading {
    display: flex;
    gap: 0.6rem;
    align-items: center;
  }

  .reading {
    color: var(--dim);
    font-size: var(--text-label);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .chip {
    min-height: 2.8rem;
    max-width: 100%;
    padding: 0 1rem;
    font-size: var(--text-label);
    border-radius: 1.4rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .small {
    min-height: 2.6rem;
    padding: 0 0.9rem;
    font-size: var(--text-label);
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
