<script lang="ts">
  // The pick for the next shot, a dialog over home: a bean that is not
  // archived or no bean, a grinder or none, and the grinder setting with − and + by the
  // grinder's step, typed on the number pad, or its named positions. 'Use for the next shot'
  // writes all of it in one `PUT /api/v1/workflow`; it stays for every next shot until changed.
  import { onMount } from 'svelte';
  import type { CatalogueBean, Grinder } from '../api';
  import NumberPad from '../editor/NumberPad.svelte';
  import type { Skin } from '../shell/skin.svelte';
  import { beanTitle, dateOf, newestFirst, pickedBean, pickedGrinder, search, selectableBeans, stepSetting } from './catalogue';

  interface Props {
    skin: Skin;
    onclose: () => void;
  }

  let { skin, onclose }: Props = $props();
  const catalogue = $derived(skin.catalogue);

  /** More beans than this get a search field. */
  const SEARCH_FROM = 6;
  /** The grinder setting's range on the number pad. */
  const SETTING_MAX = 999;

  let bean = $state.raw<CatalogueBean | null>(null);
  let grinder = $state.raw<Grinder | null>(null);
  let setting = $state<string | null>(null);
  let query = $state('');
  let ready = $state(false);
  let typing = $state(false);

  // Starts from what the workflow holds now, once the catalogue is read.
  onMount(async () => {
    await catalogue.load();
    const context = skin.workflow?.context;
    bean = pickedBean(catalogue.beans, catalogue.batches, context);
    grinder = pickedGrinder(catalogue.grinders, context);
    setting = context?.grinderSetting ?? null;
    ready = true;
  });

  const offered = $derived(newestFirst(selectableBeans(catalogue.beans)));
  const beans = $derived(search(offered, query, (entry) => `${entry.roaster} ${entry.name}`));
  const grinders = $derived(newestFirst(catalogue.grinders.filter((entry) => !entry.archived)));
  const preset = $derived(grinder?.settingType === 'preset' && (grinder.settingValues?.length ?? 0) > 0);
  const places = $derived(Math.min(2, (String(grinder?.settingSmallStep ?? 1).split('.')[1] ?? '').length || 1));

  async function use() {
    if (await catalogue.pick({ bean, batch: catalogue.batchOf(bean), grinder, setting })) onclose();
  }

  function openCatalogue() {
    onclose();
    skin.go('beans');
  }
</script>

<svelte:window onkeydown={(e: KeyboardEvent) => e.key === 'Escape' && !typing && onclose()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" data-no-swipe onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="bean and grinder for the next shot" data-testid="pick">
    <h2>For the next shot</h2>
    <div class="columns">
      <section aria-label="bean">
        <h3>Bean</h3>
        {#if offered.length > SEARCH_FROM}
          <label class="search">
            <span class="hidden">search the beans</span>
            <input
              type="search"
              bind:value={query}
              placeholder="search"
              autocomplete="off"
              spellcheck="false"
              data-testid="pick-search"
            />
          </label>
        {/if}
        <ul>
          <li>
            <button
              class="row select-outline"
              aria-pressed={ready && bean === null}
              data-testid="pick-no-bean"
              onclick={() => (bean = null)}
            >
              <strong>no bean</strong>
            </button>
          </li>
          {#each beans as entry (entry.id)}
            {@const bag = catalogue.batchOf(entry)}
            <li>
              <button
                class="row select-outline"
                aria-pressed={bean?.id === entry.id}
                data-testid="pick-bean"
                onclick={() => (bean = entry)}
              >
                <strong>{beanTitle(entry)}</strong>
                {#if bag?.roastDate}<small>roasted {dateOf(bag.roastDate)}</small>{/if}
              </button>
            </li>
          {/each}
        </ul>
        {#if ready && offered.length === 0}
          <p class="hint" data-testid="pick-empty">No beans in the catalogue yet.</p>
        {/if}
      </section>

      <section aria-label="grinder">
        <h3>Grinder</h3>
        <ul>
          <li>
            <button
              class="row select-outline"
              aria-pressed={ready && grinder === null}
              data-testid="pick-no-grinder"
              onclick={() => (grinder = null)}
            >
              <strong>no grinder</strong>
            </button>
          </li>
          {#each grinders as entry (entry.id)}
            <li>
              <button
                class="row select-outline"
                aria-pressed={grinder?.id === entry.id}
                data-testid="pick-grinder"
                onclick={() => (grinder = entry)}
              >
                <strong>{entry.model}</strong>
              </button>
            </li>
          {/each}
        </ul>
        <div class="setting">
          <span class="caption">setting</span>
          <button
            class="step"
            aria-label="finer"
            data-testid="pick-setting-down"
            onclick={() => (setting = stepSetting(grinder, setting, -1))}>−</button
          >
          <button class="value" data-testid="pick-setting" disabled={preset} onclick={() => (typing = true)}>{setting ?? '–'}</button>
          <button
            class="step"
            aria-label="coarser"
            data-testid="pick-setting-up"
            onclick={() => (setting = stepSetting(grinder, setting, 1))}>+</button
          >
        </div>
      </section>
    </div>

    {#if catalogue.error}<p class="warn" role="alert" data-testid="pick-error">{catalogue.error}</p>{/if}
    <div class="actions">
      <button class="link" data-testid="pick-catalogue" onclick={openCatalogue}>beans and grinders…</button>
      <button data-testid="pick-cancel" onclick={onclose}>cancel</button>
      <button class="primary" data-testid="pick-use" disabled={!ready || catalogue.busy} onclick={use}>use for the next shot</button>
    </div>
  </div>
</div>

{#if typing}
  <NumberPad
    label="grinder setting"
    unit=""
    min={0}
    max={SETTING_MAX}
    decimals
    {places}
    current={setting ?? ''}
    onconfirm={(value: number) => {
      setting = String(value);
      typing = false;
    }}
    oncancel={() => (typing = false)}
  />
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 4rem;
    background: rgb(0 0 0 / 55%);
  }

  .dialog {
    width: min(56rem, 90%);
    max-height: calc(100% - 6rem);
    box-sizing: border-box;
    padding: 0.4rem 1.2rem 1.2rem;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 1.2rem;
    box-shadow: 0 0.6rem 2.4rem rgb(0 0 0 / 70%);
  }

  h2 {
    margin: 0.6rem 0 0.6rem;
    font-size: var(--text-title);
    font-weight: 600;
  }

  h3 {
    margin: 0 0 0.4rem;
    color: var(--dim);
    font-size: var(--text-label);
    font-weight: 400;
  }

  .columns {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 1.2rem;
  }

  section {
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  ul {
    min-height: 0;
    max-height: 22rem;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  button {
    font: inherit;
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

  .row {
    width: 100%;
    min-height: 3.4rem;
    padding: 0.3rem 0.9rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: left;
    background: var(--bg);
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

  .search {
    display: flex;
    margin-bottom: 0.4rem;
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
    color: var(--fg);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    outline: none;
  }

  .setting {
    margin-top: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .caption {
    flex: 1;
    color: var(--dim);
    font-size: var(--text-label);
  }

  .step {
    width: 3.6rem;
    height: 3.6rem;
    font-size: var(--text-title);
  }

  .value {
    min-width: 6rem;
    height: 3.6rem;
    font-size: var(--text-value);
    font-variant-numeric: tabular-nums;
  }

  .value:disabled {
    opacity: 1;
  }

  .hint {
    margin: 0.4rem 0 0;
    color: var(--dim);
    font-size: var(--text-label);
  }

  .warn {
    margin: 0.6rem 0 0;
    color: var(--temperature);
  }

  .actions {
    margin-top: 1rem;
    display: flex;
    gap: 0.6rem;
  }

  .actions button {
    min-height: 3.4rem;
    padding: 0 1.2rem;
  }

  .actions .link {
    margin-right: auto;
    color: var(--dim);
    background: none;
  }

  .primary {
    color: var(--bg);
    background: var(--fg);
    border-color: var(--fg);
    font-weight: 600;
  }
</style>
