<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.17,
  src/settings/settings.js (renderQuickstartGuideSettings, renderFeedbackSettings, submitFeedback).
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // 11. User Manual: the manual's links and Send Feedback. Feedback goes to
  // Decent through Decaid (`POST /api/v1/feedback`) and becomes a public GitHub issue, so the
  // Send button asks first.
  import type { FeedbackRequest } from '../api';
  import { errorMessage } from '../error-message';
  import type { Skin } from '../shell/skin.svelte';
  import Lever from '../ui/Lever.svelte';
  import { FEEDBACK_TYPES, MANUAL_LINKS, feedbackText } from './bengle';
  import Confirm from './Confirm.svelte';
  import SettingsRow from './SettingsRow.svelte';

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
      <SettingsRow label={link.label} spacing="tight">
        <a class="action" data-testid="manual-{link.id}" href={link.url} target="_blank" rel="noopener noreferrer">view</a>
      </SettingsRow>
    {/each}
    <p class="dim">The guides open in the browser and need the internet.</p>
  </div>
{:else}
  <div data-testid="feedback">
    <p class="dim">Feedback is submitted as a public GitHub issue. Do not include personal or private information.</p>
    <div class="choices">
      {#each FEEDBACK_TYPES as option (option.value)}
        <button
          class="chip select-outline"
          aria-pressed={type === option.value}
          data-testid="feedback-type-{option.value}"
          onclick={() => (type = option.value)}>{option.label}<small>{option.hint}</small></button
        >
      {/each}
    </div>
    <label>
      <span>title</span>
      <input data-testid="feedback-title" bind:value={title} placeholder="Short summary of your feedback…" />
    </label>
    <label>
      <span>description</span>
      <textarea data-testid="feedback-description" rows="5" bind:value={description} placeholder="Tell us more…"></textarea>
    </label>
    <SettingsRow
      label="attach system information and logs"
      hint="Decaid's version, the machine and its log help to find the cause."
      spacing="tight"
    >
      <Lever
        checked={attach}
        label="Attach system information and logs"
        testid="feedback-attach"
        onchange={(on: boolean) => (attach = on)}
      />
    </SettingsRow>
    <SettingsRow spacing="tight">
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
        >{sending ? 'submitting…' : 'send'}</button
      >
    </SettingsRow>
  </div>
{/if}

{#if asking}
  <Confirm
    title="Send the feedback?"
    text="It becomes a public GitHub issue of Decent's, sent through Decaid. Nothing in it should be personal or private."
    ok="send"
    onok={send}
    oncancel={() => (asking = false)}
  />
{/if}

<style>
  span {
    font-size: var(--text-body);
    font-weight: 600;
  }

  small {
    color: var(--dim);
    font-size: var(--text-label);
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
    gap: var(--space-2);
    margin: var(--space-2) 0;
  }

  .chip {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-height: var(--control-tall);
    padding: 0.4rem 1rem;
    border-radius: var(--radius);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: var(--space-2) 0;
  }

  input,
  textarea {
    font: inherit;
    color: var(--fg);
    padding: 0.6rem 0.8rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    resize: none;
  }

  a {
    font: inherit;
    color: var(--fg);
    touch-action: manipulation;
    user-select: none;
  }

  button,
  a {
    font-weight: 400;
  }

  button:disabled {
    opacity: 0.5;
  }

  .action {
    padding: 0 1.4rem;
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }

  /* The row's main action: the white outline, not the main button's fill; off, it is the shared off look. */
  .action.primary {
    color: var(--fg);
    background: var(--raised);
    font-weight: 400;
  }
</style>
