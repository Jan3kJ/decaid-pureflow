<script lang="ts">
  // An editor's first button: the profile's name, the shortcut to the profile picker.
  interface Props {
    name: string;
    disabled: boolean;
    /** the widest the name may take before it is cut */
    width: string;
    onclick: () => void;
  }

  let { name, disabled, width, onclick }: Props = $props();
</script>

<button class="seg name" style:max-width={width} data-testid="editor-profile" aria-label="choose another profile" {disabled} {onclick}>
  <span class="truncate">{name}</span>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9" /></svg>
</button>

<style>
  .name {
    flex: none;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-body);
  }

  .name:enabled {
    font-weight: 600;
  }

  svg {
    flex: none;
    width: 1.3rem;
    height: 1.3rem;
    fill: none;
    stroke: var(--dim);
    stroke-width: 2.4;
    stroke-linecap: round;
  }
</style>
