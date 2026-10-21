<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.17,
  src/settings/settings.js (renderQuickstartGuideSettings, renderFeedbackSettings, submitFeedback).
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // 11. User Manual (research.md 31): the manual's links and Send Feedback. Feedback goes to
  // Decent through Decaid (`POST /api/v1/feedback`) and becomes a public GitHub issue, so the
  // Send button asks first.
  import type { FeedbackRequest } from '../api';
  import { errorMessage } from '../error-message';
  import type { Skin } from '../shell/skin.svelte';
  import { FEEDBACK_TYPES, MANUAL_LINKS, feedbackText } from './bengle';
  import Confirm from './Confirm.svelte';

  interface Props {
    skin: Skin;
    part: 'manual' | 'feedback';
  }

  let { skin, part }: Props = $props();

  let type: FeedbackRequest['type'] = $state('bug');
  let title = $state('');
  let description = $state('');
  let attach = $state(true);
  let asking = $state(false);
  let sending = $state(false);
  let sent: { issueUrl?: string } | null = $state(null);
  let failed: string | null = $state(null);

  const ready = $derived(title.trim() !== '');

  async function send() {
    asking = false;
    sending = true;
    failed = null;
    sent = null;
    try {
      const answer = await skin.client.sendFeedback({
        description: feedbackText(title, description),
        type,
        includeLogs: attach,
        includeSystemInfo: attach,
      });
      sent = answer ?? {};
      title = '';
      description = '';
    } catch (cause) {
      failed = errorMessage(cause);
    } finally {
      sending = false;
    }
  }
</script>

{#if part === 'manual'}
  <div data-testid="manual">
    {#each MANUAL_LINKS as link (link.id)}
      <div class="row">
        <span>{link.label}</span>
        <a class="action" data-testid="manual-{link.id}" href={link.url} target="_blank" rel="noopener noreferrer">View</a>
      </div>
    {/each}
    <p class="dim">The guides open in the browser and need the internet.</p>
  </div>
{:else}
  <div data-testid="feedback">
    <p class="dim">Feedback is submitted as a public GitHub issue. Do not include personal or private information.</p>
    <div class="choices">
      {#each FEEDBACK_TYPES as option (option.value)}
        <button
          class="chip"
          aria-pressed={type === option.value}
          data-testid="feedback-type-{option.value}"
          onclick={() => (type = option.value)}>{option.label}<small>{option.hint}</small></button
        >
      {/each}
    </div>
    <label>
      <span>Title</span>
      <input data-testid="feedback-title" bind:value={title} placeholder="Short summary of your feedback…" />
    </label>
    <label>
      <span>Description</span>
      <textarea data-testid="feedback-description" rows="5" bind:value={description} placeholder="Tell us more…"></textarea>
    </label>
    <div class="row">
      <div class="about">
        <span>Attach system information and logs</span>
        <small>Decaid's version, the machine and its log help to find the cause.</small>
      </div>
      <button
        class="lever-button"
        role="switch"
        aria-label="Attach system information and logs"
        aria-checked={attach}
        data-testid="feedback-attach"
        onclick={() => (attach = !attach)}><span class="lever"><span></span></span></button
      >
    </div>
    <div class="row">
      <div class="status" aria-live="polite">
        {#if failed}<b class="warn" data-testid="feedback-failed">Error: {failed}</b>{/if}
        {#if sent}
          <b data-testid="feedback-sent"
            >Submitted!
            {#if sent.issueUrl}<a href={sent.issueUrl} target="_blank" rel="noopener noreferrer">View issue</a>{/if}</b
          >
        {/if}
      </div>
      <button class="action primary" data-testid="feedback-send" disabled={!ready || sending} onclick={() => (asking = true)}
        >{sending ? 'Submitting…' : 'Send'}</button
      >
    </div>
  </div>
{/if}

{#if asking}
  <Confirm
    title="Send the feedback?"
    text="It becomes a public GitHub issue of Decent's, sent through Decaid. Nothing in it should be personal or private."
    ok="Send"
    onok={send}
    oncancel={() => (asking = false)}
  />
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 3.2rem;
    padding: 0.35rem 0;
    border-top: 1px solid var(--line);
  }

  .about {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  span {
    font-size: 1.15rem;
    font-weight: 600;
  }

  small {
    color: var(--dim);
    font-size: 0.85rem;
    font-weight: 400;
  }

  .dim {
    color: var(--dim);
  }

  .warn {
    color: var(--temperature);
  }

  b {
    font-weight: 400;
  }

  .status {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin: 0.6rem 0;
  }

  .chip {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-height: 3.2rem;
    padding: 0.4rem 1rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .chip[aria-pressed='true'] {
    border-color: var(--fg);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin: 0.6rem 0;
  }

  input,
  textarea {
    font: inherit;
    color: var(--fg);
    padding: 0.6rem 0.8rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    resize: none;
  }

  button,
  a {
    font: inherit;
    font-weight: 400;
    color: var(--fg);
    touch-action: manipulation;
    user-select: none;
  }

  button:disabled {
    opacity: 0.5;
  }

  .action {
    flex: none;
    min-height: 3rem;
    padding: 0 1.4rem;
    display: inline-flex;
    align-items: center;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    text-decoration: none;
  }

  .primary {
    border-color: var(--fg);
  }

  .lever-button {
    flex: none;
    padding: 0;
    background: none;
    border: 0;
  }

  .lever {
    display: block;
    width: 4.4rem;
    height: 2.4rem;
    padding: 0.25rem;
    box-sizing: border-box;
    border-radius: 1.2rem;
    background: var(--raised);
    border: 1px solid var(--line);
  }

  .lever span {
    display: block;
    width: 1.8rem;
    height: 100%;
    border-radius: 50%;
    background: var(--dim);
    transition: transform 0.12s;
  }

  [aria-checked='true'] .lever {
    background: var(--pressure);
    border-color: var(--pressure);
  }

  [aria-checked='true'] .lever span {
    background: var(--bg);
    transform: translateX(2rem);
  }
</style>
