<!--
Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
src/modules/profile_editor.js (part of renderSettingsTab).
Streamline.js - A browser-native skin for Decent Espresso machines
Copyright (C) 2025-2026 Decent Espresso
Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // The step editor's SETTINGS tab: the profile's title, notes,
  // target weight, target volume and tank temperature. Each edit is the editor's, saved with
  // the steps by 'save' and 'save as'. The numbers take ± and the number pad, as on a card.
  import type { Profile } from '../api';
  import NumberPad from '../editor/NumberPad.svelte';
  import ValueChip from '../editor/ValueChip.svelte';
  import { SETTING_LIMITS, type SettingField } from './limits';
  import { formatSetting, setSetting, setText, settingOf, stepSetting } from './model';

  interface Props {
    profile: Profile;
    /** what is wrong with the title for 'save', if anything */
    titleProblem?: string | null;
    disabled?: boolean;
    onedit: (next: Profile) => void;
  }

  let { profile, titleProblem = null, disabled = false, onedit }: Props = $props();

  const NUMBERS: { field: SettingField; label: string; caption: string; tone: 'none' | 'temperature' }[] = [
    { field: 'target_weight', label: 'target weight', caption: 'the scale stops the shot at this weight', tone: 'none' },
    { field: 'target_volume', label: 'target volume', caption: 'the flow meter stops the shot at this volume', tone: 'none' },
    { field: 'tank_temperature', label: 'tank temperature', caption: 'the water tank is heated to this first', tone: 'temperature' },
  ];

  let typing: SettingField | null = $state(null);
  let emptyTitle = $state(false);
</script>

<div class="settings" data-testid="profile-settings">
  <div class="texts">
    <label class="field">
      <span class="caption">title</span>
      <input
        class="text"
        data-testid="setting-title"
        value={profile.title}
        {disabled}
        oninput={(e) => {
          const text = e.currentTarget.value;
          emptyTitle = !text.trim();
          onedit(setText(profile, 'title', text));
        }}
      />
      {#if emptyTitle}
        <span class="problem" data-testid="setting-title-problem">A profile needs a title; it keeps “{profile.title}”.</span>
      {:else if titleProblem}
        <span class="problem" data-testid="setting-title-problem">{titleProblem}</span>
      {/if}
    </label>
    <label class="field notes">
      <span class="caption">notes</span>
      <textarea
        class="text"
        data-testid="setting-notes"
        value={profile.notes ?? ''}
        {disabled}
        oninput={(e) => onedit(setText(profile, 'notes', e.currentTarget.value))}></textarea>
    </label>
  </div>

  <div class="numbers">
    {#each NUMBERS as { field, label, caption, tone } (field)}
      <div class="number">
        <ValueChip
          {label}
          value={formatSetting(profile, field)}
          {tone}
          testid="setting-{field}"
          onstep={(d: 1 | -1) => !disabled && onedit(stepSetting(profile, field, d))}
          onedit={() => !disabled && (typing = field)}
        />
        <span class="hint">{caption}; 0 is off</span>
      </div>
    {/each}
  </div>
</div>

{#if typing}
  {@const field = typing}
  {@const limit = SETTING_LIMITS[field]}
  <NumberPad
    label={NUMBERS.find((entry) => entry.field === field)!.label}
    unit={limit.unit}
    min={limit.min}
    max={limit.max}
    decimals={limit.step < 1}
    current={settingOf(profile, field).toFixed(limit.step < 1 ? 1 : 0)}
    onconfirm={(typed: number) => {
      onedit(setSetting(profile, field, typed));
      typing = null;
    }}
    oncancel={() => (typing = null)}
  />
{/if}

<style>
  .settings {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: var(--space-3);
    padding: 1rem var(--space-3);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 1rem;
  }

  .texts,
  .numbers {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field.notes {
    flex: 1;
    min-height: 0;
  }

  .caption {
    font-size: var(--text-label);
    color: var(--dim);
  }

  .text {
    box-sizing: border-box;
    width: 100%;
    min-height: 3rem;
    padding: var(--space-2) 0.8rem;
    font: inherit;
    font-size: var(--text-body);
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.8rem;
  }

  textarea.text {
    flex: 1;
    min-height: 6rem;
    resize: none;
    line-height: 1.4;
  }

  .problem {
    font-size: var(--text-label);
    color: var(--warn);
  }

  .number {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .hint {
    font-size: var(--text-label);
    color: var(--dim);
  }
</style>
