<!--
Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
src/profiles/profile_editor.html and src/modules/profile_editor.js (the SCRIPT panel:
"Steps Overview" left, "Graph Preview" right).
Streamline.js - A browser-native skin for Decent Espresso machines
Copyright (C) 2025-2026 Decent Espresso
Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // The step editor's SCRIPT tab (spec 3.6, research.md 17.8): the profile's steps as text in
  // Streamline's sentences, the preview beside it. The text is written from the profile when
  // the tab opens and parsed on every change: a text that parses is the editor's profile at
  // once, which the preview and the other tabs show; one that does not lists its errors, the
  // preview keeps the last text that parsed, and the editor saves nothing while it is so.
  import { untrack } from 'svelte';
  import type { Profile } from '../api';
  import { parseScript, writeScript } from './script';
  import StepPreview from './StepPreview.svelte';

  interface Props {
    profile: Profile;
    /** the errors of the text; empty when it parses */
    errors: string[];
    disabled?: boolean;
    onedit: (next: Profile) => void;
    onerrors: (errors: string[]) => void;
  }

  let { profile, errors, disabled = false, onedit, onerrors }: Props = $props();

  // A text that was not changed is never parsed back into the profile.
  let text = $state(untrack(() => writeScript(profile)));

  function input(next: string) {
    text = next;
    const result = parseScript(next, profile);
    if (result.ok) {
      onerrors([]);
      onedit(result.profile);
    } else {
      onerrors(result.errors);
    }
  }
</script>

<div class="script" data-testid="step-script">
  <div class="text">
    <span class="caption">steps</span>
    <textarea
      data-testid="script-text"
      aria-label="the steps as text"
      aria-invalid={errors.length > 0}
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      {disabled}
      value={text}
      oninput={(e) => input(e.currentTarget.value)}
    ></textarea>
    {#if errors.length > 0}
      <div class="errors" role="alert" data-testid="script-errors">
        <p>The script has errors: nothing is saved.</p>
        <ul>
          {#each errors as error, i (i)}
            <li data-testid="script-error">{error}</li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
  <StepPreview {profile} />
</div>

<style>
  .script {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    gap: 0.8rem;
  }

  .text {
    flex: 0 0 42%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .caption {
    color: var(--dim);
    font-size: 0.9rem;
  }

  textarea {
    flex: 1 1 0;
    min-height: 0;
    box-sizing: border-box;
    resize: none;
    padding: 0.7rem 0.9rem;
    font: 0.95rem/1.45 ui-monospace, 'Cascadia Mono', Consolas, monospace;
    color: var(--fg);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 1rem;
    white-space: pre;
    overflow: auto;
  }

  textarea[aria-invalid='true'] {
    border-color: var(--warn);
  }

  .errors {
    flex: none;
    max-height: 30vh;
    overflow-y: auto;
    padding: 0.5rem 0.9rem;
    border: 1px solid var(--warn);
    border-radius: 0.9rem;
    background: var(--raised);
    color: var(--warn);
    font-size: 0.95rem;
  }

  .errors p {
    margin: 0 0 0.3rem;
    font-weight: 600;
  }

  .errors ul {
    margin: 0;
    padding-left: 1.2rem;
  }
</style>
