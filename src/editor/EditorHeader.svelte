<script lang="ts">
  import type { Entry } from './entries';

  // The A-Flow editor's header, on one row at 1280 px: the profile's name, the start row,
  // save and save as, the mode.
  interface Props {
    origin: Entry;
    /** the profiles to start from, chosen in the settings */
    row: Entry[];
    busy: boolean;
    canSave: boolean;
    mode: 'simple' | 'detail';
    /** the name was tapped: the profile picker opens */
    onprofile: () => void;
    onpick: (key: string) => void;
    onsave: () => void;
    onsaveas: () => void;
    onmode: (mode: 'simple' | 'detail') => void;
  }

  let { origin, row, busy, canSave, mode, onprofile, onpick, onsave, onsaveas, onmode }: Props = $props();
</script>

<header>
  <!-- The shortcut to the profile picker: a profile chosen there is loaded. -->
  <button class="seg name" data-testid="editor-profile" aria-label="choose another profile" disabled={busy} onclick={onprofile}>
    <span>{origin.name}</span>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9" /></svg>
  </button>
  <!-- The profiles to start from, chosen in the settings; 'save as' does not add to them. -->
  <div class="group start" role="group" aria-label="start from" data-testid="start-row">
    {#each row as entry (entry.key)}
      <button
        class="seg"
        aria-pressed={entry.key === origin.key}
        data-testid="start-{entry.name}"
        disabled={busy}
        onclick={() => onpick(entry.key)}
      >
        {entry.name}
      </button>
    {/each}
  </div>
  <div class="group">
    <div class="group" role="group" aria-label="profile actions">
      <button class="seg action" data-testid="save" disabled={busy || !canSave} onclick={onsave}>save</button>
      <button class="seg action" data-testid="save-as" disabled={busy} onclick={onsaveas}> save as </button>
    </div>
    <div class="group" role="group" aria-label="editor mode">
      <button class="seg" aria-pressed={mode === 'simple'} data-testid="mode-simple" onclick={() => onmode('simple')}>simple</button>
      <button class="seg" aria-pressed={mode === 'detail'} data-testid="mode-detail" onclick={() => onmode('detail')}>detail</button>
    </div>
  </div>
</header>

<style>
  header {
    grid-area: header;
    display: flex;
    justify-content: space-between;
    gap: 2rem;
  }

  .group {
    flex: none;
    display: flex;
    gap: 0.75rem;
  }

  header > .group:last-child {
    gap: 2rem;
  }

  /* The profile's name, and the way to the picker. */
  .name {
    flex: none;
    min-width: 0;
    max-width: 16rem;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .name span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name svg {
    flex: none;
    width: 1.3rem;
    height: 1.3rem;
    fill: none;
    stroke: var(--dim);
    stroke-width: 2.4;
    stroke-linecap: round;
  }

  /* The row takes the room between the name and the actions and scrolls when it has no more. */
  .start {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .start .seg {
    flex: none;
    min-width: 4.5rem;
    max-width: 11rem;
    padding: 0 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    font: inherit;
    color: var(--fg);
    border: 1px solid var(--line);
    background: var(--panel);
    touch-action: manipulation;
    user-select: none;
  }

  .seg {
    min-height: 3rem;
    min-width: 6rem;
    padding: 0 1.1rem;
    border-radius: 0.9rem;
    font-size: 1rem;
  }

  .seg[aria-pressed='true'] {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
    font-weight: 600;
  }

  .seg.action {
    min-width: 0;
    background: var(--raised);
    white-space: nowrap;
  }

  .seg:disabled {
    background: var(--panel);
    border-color: var(--line);
    color: var(--dim);
    font-weight: 400;
  }
</style>
