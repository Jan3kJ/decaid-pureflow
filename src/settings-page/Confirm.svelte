<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
  src/settings/categories/maintenance.js (its confirm dialogs), by way of SettingsPage.svelte.
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // The question before a write or a procedure that can do harm (research.md 20.9): what it
  // does, Cancel and the action. The settings page, its device lists and maintenance use it.

  interface Props {
    title: string;
    text: string;
    /** the action's button */
    ok?: string;
    onok: () => void;
    oncancel: () => void;
  }

  let { title, text, ok = 'Set', onok, oncancel }: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={(e) => e.target === e.currentTarget && oncancel()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={title} data-testid="settings-confirm">
    <h2>{title}</h2>
    <p>{text}</p>
    <div class="actions">
      <button class="action" data-testid="settings-confirm-cancel" onclick={oncancel}>Cancel</button>
      <button class="action primary" data-testid="settings-confirm-ok" onclick={onok}>{ok}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 55%);
  }

  .dialog {
    width: 30rem;
    box-sizing: border-box;
    padding: 0.4rem 1.2rem 1.2rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 1.2rem;
    box-shadow: 0 0.6rem 2.4rem rgb(0 0 0 / 70%);
  }

  h2 {
    margin: 0.6rem 0 0.4rem;
    font-size: 1.4rem;
    font-weight: 600;
  }

  p {
    margin: 0;
    color: var(--dim);
  }

  .actions {
    margin-top: 1rem;
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
  }

  button {
    font: inherit;
    color: var(--fg);
    touch-action: manipulation;
    user-select: none;
  }

  .action {
    flex: none;
    min-height: 3rem;
    padding: 0 1rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .action.primary {
    color: var(--bg);
    background: var(--fg);
    border-color: var(--fg);
    font-weight: 600;
  }
</style>
