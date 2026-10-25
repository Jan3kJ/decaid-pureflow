<script lang="ts">
  // The beans and grinders screen (spec 3.9 item 19, research.md 29.6), laid out as the
  // settings page: the two kinds on the left, the chosen kind's list in the middle with a search
  // and 'show archived', and on the right the chosen one's form, or the form that adds one.
  // Every write goes to Decaid and is read back; archive asks first (the settings' `Confirm`).
  import { onMount } from 'svelte';
  import type { CatalogueBean, Grinder } from '../api';
  import Confirm from '../settings-page/Confirm.svelte';
  import type { Skin } from '../shell/skin.svelte';
  import BeanForm from './BeanForm.svelte';
  import { beanTitle, dateOf, newestFirst, roasters, search } from './catalogue';
  import GrinderForm from './GrinderForm.svelte';
  import type { BeanForm as BeanFields, GrinderForm as GrinderFields } from './catalogue';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();
  const catalogue = $derived(skin.catalogue);

  onMount(() => void catalogue.load());

  type Kind = 'beans' | 'grinders';
  const KINDS: { id: Kind; label: string }[] = [
    { id: 'beans', label: 'Beans' },
    { id: 'grinders', label: 'Grinders' },
  ];
  let kind = $state<Kind>('beans');
  /** the chosen bean's or grinder's id; null: the form that adds one */
  let chosen = $state<string | null>(null);
  let query = $state('');
  let showArchived = $state(false);
  let confirming: { title: string; text: string; ok: string; run: () => void } | null = $state(null);

  const beans = $derived(
    search(
      newestFirst(catalogue.beans.filter((bean) => showArchived || !bean.archived)),
      query,
      (bean) => `${bean.roaster} ${bean.name} ${bean.notes ?? ''}`,
    ),
  );
  const grinders = $derived(
    search(
      newestFirst(catalogue.grinders.filter((grinder) => showArchived || !grinder.archived)),
      query,
      (grinder) => `${grinder.model} ${grinder.burrs ?? ''} ${grinder.notes ?? ''}`,
    ),
  );
  const bean = $derived(kind === 'beans' ? (catalogue.beans.find((entry) => entry.id === chosen) ?? null) : null);
  const batch = $derived(catalogue.batchOf(bean));
  const grinder = $derived(kind === 'grinders' ? (catalogue.grinders.find((entry) => entry.id === chosen) ?? null) : null);

  function choose(next: Kind) {
    kind = next;
    chosen = null;
    query = '';
  }

  async function saveBean(form: BeanFields, photo: string | null | undefined): Promise<boolean> {
    if (bean) return catalogue.saveBean(bean, form, photo);
    chosen = (await catalogue.addBean(form, photo ?? null)) ?? null;
    return chosen !== null;
  }

  async function saveGrinder(form: GrinderFields) {
    if (grinder) await catalogue.saveGrinder(grinder, form);
    else chosen = (await catalogue.addGrinder(form)) ?? null;
  }

  function archive(target: CatalogueBean | Grinder) {
    const isBean = 'roaster' in target;
    const name = isBean ? beanTitle(target) : target.model;
    confirming = {
      title: `Archive ${name}?`,
      text: 'It is no longer offered for the next shot; its shots stay in the history. Show archived lists it again, to restore it.',
      ok: 'Archive',
      run: () => {
        confirming = null;
        void (isBean ? catalogue.archiveBean(target, true) : catalogue.archiveGrinder(target, true)).then((done) => {
          if (done && !showArchived) chosen = null;
        });
      },
    };
  }

  function startBag(target: CatalogueBean) {
    confirming = {
      title: `A new bag of ${beanTitle(target)}?`,
      text: 'The current bag is archived and the next one starts, without a roast date until one is set here.',
      ok: 'New bag',
      run: () => {
        confirming = null;
        void catalogue.newBag(target);
      },
    };
  }
</script>

<div class="beans">
  <header>
    <h1>Beans and grinders</h1>
    <p>Decaid's catalogue: what is added here is offered for the next shot, on home.</p>
  </header>

  <nav class="kinds" aria-label="beans or grinders">
    {#each KINDS as entry (entry.id)}
      <button class="kind" aria-current={entry.id === kind} data-testid="beans-kind-{entry.id}" onclick={() => choose(entry.id)}>
        {entry.label}
      </button>
    {/each}
  </nav>

  <section class="list" aria-label={kind} data-main-frame>
    <div class="tools">
      <label class="search">
        <span class="hidden">search</span>
        <input
          type="search"
          bind:value={query}
          placeholder="search"
          autocomplete="off"
          spellcheck="false"
          enterkeyhint="search"
          data-testid="beans-search"
        />
      </label>
      <button
        class="toggle"
        aria-pressed={showArchived}
        data-testid="beans-show-archived"
        onclick={() => (showArchived = !showArchived)}
      >
        show archived
      </button>
    </div>
    <button class="row add" aria-current={chosen === null} data-testid="beans-add" onclick={() => (chosen = null)}>
      + {kind === 'beans' ? 'add a bean' : 'add a grinder'}
    </button>
    <ul data-testid="beans-list">
      {#if kind === 'beans'}
        {#each beans as entry (entry.id)}
          {@const bag = catalogue.batchOf(entry)}
          <li>
            <button
              class="row"
              class:archived={entry.archived}
              aria-current={entry.id === chosen}
              data-testid="bean-row"
              onclick={() => (chosen = entry.id)}
            >
              <strong>{beanTitle(entry)}</strong>
              <small>
                {entry.archived ? 'archived' : bag?.roastDate ? `roasted ${dateOf(bag.roastDate)}` : 'no roast date'}
              </small>
            </button>
          </li>
        {/each}
      {:else}
        {#each grinders as entry (entry.id)}
          <li>
            <button
              class="row"
              class:archived={entry.archived}
              aria-current={entry.id === chosen}
              data-testid="grinder-row"
              onclick={() => (chosen = entry.id)}
            >
              <strong>{entry.model}</strong>
              <small
                >{entry.archived
                  ? 'archived'
                  : (entry.burrs ?? (entry.settingType === 'preset' ? 'named positions' : 'numbers'))}</small
              >
            </button>
          </li>
        {/each}
      {/if}
    </ul>
    {#if catalogue.loaded && (kind === 'beans' ? beans : grinders).length === 0}
      <p class="empty" data-testid="beans-empty">
        {query ? 'Nothing matches the search.' : kind === 'beans' ? 'No beans yet.' : 'No grinders yet.'}
      </p>
    {/if}
  </section>

  <section class="detail" data-main-frame>
    {#if kind === 'beans'}
      {#key `${bean?.id ?? 'new'}:${batch?.id ?? ''}`}
        <BeanForm
          {bean}
          {batch}
          roasters={roasters(catalogue.beans)}
          known={catalogue.beans}
          busy={catalogue.busy}
          loadphoto={(id: string) => catalogue.photoOf(id)}
          onsave={saveBean}
          onarchive={() => bean && archive(bean)}
          onrestore={() => bean && void catalogue.archiveBean(bean, false)}
          onnewbag={() => bean && startBag(bean)}
        />
      {/key}
    {:else}
      {#key grinder?.id ?? 'new'}
        <GrinderForm
          {grinder}
          busy={catalogue.busy}
          onsave={saveGrinder}
          onarchive={() => grinder && archive(grinder)}
          onrestore={() => grinder && void catalogue.archiveGrinder(grinder, false)}
        />
      {/key}
    {/if}
    {#if catalogue.error}
      <p class="warn" role="alert" data-testid="beans-error">
        {catalogue.error}
        <button class="toggle" onclick={() => catalogue.load()}>Read again</button>
      </p>
    {/if}
  </section>
</div>

{#if confirming}
  <Confirm
    title={confirming.title}
    text={confirming.text}
    ok={confirming.ok}
    onok={confirming.run}
    oncancel={() => (confirming = null)}
  />
{/if}

<style>
  .beans {
    height: 100%;
    box-sizing: border-box;
    padding: 1rem 1.2rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) minmax(0, 3fr);
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.8rem 1.2rem;
  }

  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: baseline;
    gap: 1.2rem;
    min-width: 0;
  }

  h1 {
    margin: 0;
    font-size: var(--text-title);
    font-weight: 600;
    line-height: 1.15;
  }

  header p {
    margin: 0;
    min-width: 0;
    color: var(--dim);
  }

  button {
    font: inherit;
    color: var(--fg);
    touch-action: manipulation;
    user-select: none;
  }

  .kinds {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .kind {
    min-height: 3.2rem;
    padding: 0 0.9rem;
    text-align: left;
    font-size: var(--text-body);
    font-weight: 600;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .kind[aria-current='true'] {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
  }

  .list {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tools {
    display: flex;
    gap: 0.5rem;
  }

  .search {
    flex: 1;
    min-width: 0;
    display: flex;
  }

  .hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  input {
    flex: 1;
    min-width: 0;
    min-height: 3.2rem;
    box-sizing: border-box;
    padding: 0 0.9rem;
    font: inherit;
    font-size: var(--text-body);
    color: var(--fg);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    outline: none;
  }

  input:focus {
    border-color: var(--fg);
  }

  .toggle {
    flex: none;
    min-height: 3.2rem;
    padding: 0 0.9rem;
    font-size: var(--text-label);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .toggle[aria-pressed='true'] {
    color: var(--bg);
    background: var(--fg);
    border-color: var(--fg);
  }

  ul {
    min-height: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .row {
    width: 100%;
    min-height: 3.6rem;
    padding: 0.4rem 0.9rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: left;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .row[aria-current='true'] {
    border-color: var(--fg);
  }

  .row strong {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-body);
    font-weight: 600;
  }

  .row small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  .row.archived strong {
    color: var(--dim);
  }

  .add {
    flex: none;
    color: var(--dim);
    font-size: var(--text-body);
    border-style: dashed;
  }

  .empty {
    margin: 0;
    color: var(--dim);
  }

  .detail {
    min-height: 0;
    min-width: 0;
    overflow-y: auto;
    padding: 0.8rem 1.2rem 1.2rem;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
  }

  .warn {
    margin: 0.8rem 0 0;
    color: var(--temperature);
  }
</style>
