<script lang="ts">
  // The live camera in the number pad's dialog (spec 3.9 item 20): `getUserMedia`, the rear
  // camera preferred, and a capture button. Decaid's window gives the live camera without asking
  // each time; where it is refused or missing, the system's camera through a file input stands in.
  import { onMount } from 'svelte';
  import { fileToCapture, toCapture, type Capture } from './photo';

  interface Props {
    /** the photo, a JPEG data URL scaled down, and the picture to read */
    oncapture: (capture: Capture) => void;
    oncancel: () => void;
  }

  let { oncapture, oncancel }: Props = $props();

  let video: HTMLVideoElement | undefined = $state();
  let stream: MediaStream | null = null;
  let live = $state(false);
  /** why the live camera is not used: the file input stands in */
  let refused: string | null = $state(null);
  let failed: string | null = $state(null);

  onMount(() => {
    let closed = false;
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        refused = 'This window has no live camera.';
        return;
      }
      try {
        const opened = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (closed) {
          for (const track of opened.getTracks()) track.stop();
          return;
        }
        stream = opened;
        if (video) {
          video.srcObject = opened;
          await video.play().catch(() => undefined);
        }
        live = true;
      } catch (error) {
        refused = `The live camera was refused${error instanceof Error && error.name ? ` (${error.name})` : ''}.`;
      }
    })();
    return () => {
      closed = true;
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  });

  function capture() {
    if (!video || !video.videoWidth) return;
    try {
      oncapture(toCapture(video, video.videoWidth, video.videoHeight));
    } catch {
      failed = 'The picture was not taken.';
    }
  }

  async function picked(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      oncapture(await fileToCapture(file));
    } catch {
      failed = 'That file is not a picture.';
    }
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') oncancel();
  }
</script>

<svelte:window onkeydown={keydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" data-no-swipe data-testid="camera-backdrop" onclick={(e) => e.target === e.currentTarget && oncancel()}>
  <div class="pad" role="dialog" aria-modal="true" aria-label="photo of the bag" data-testid="camera">
    <div class="head">
      <span class="label">photo of the bag</span>
      <button class="close" aria-label="cancel" data-testid="camera-close" onclick={oncancel}>×</button>
    </div>
    <video bind:this={video} class:hidden={!live} autoplay muted playsinline data-testid="camera-video"></video>
    {#if refused}
      <p class="note" data-testid="camera-refused">{refused} Take the picture with the system's camera instead.</p>
    {:else if !live}
      <p class="note" data-testid="camera-starting">Starting the camera…</p>
    {/if}
    {#if failed}
      <p class="note warn" role="alert" data-testid="camera-failed">{failed}</p>
    {/if}
    <div class="actions">
      {#if refused}
        <label class="button primary">
          Take a picture
          <input type="file" accept="image/*" capture="environment" data-testid="camera-file" onchange={picked} />
        </label>
      {:else}
        <button class="primary" data-testid="camera-capture" disabled={!live} onclick={capture}>Capture</button>
      {/if}
      <button data-testid="camera-cancel" onclick={oncancel}>Cancel</button>
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

  .pad {
    width: min(48rem, 92vw);
    max-height: 96%;
    overflow-y: auto;
    box-sizing: border-box;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 1.2rem;
    box-shadow: 0 0.6rem 2.4rem rgb(0 0 0 / 70%);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .label {
    font-size: 1.05rem;
    color: var(--dim);
  }

  video {
    display: block;
    width: 100%;
    max-height: 60vh;
    object-fit: contain;
    background: var(--bg);
    border-radius: var(--radius);
  }

  .hidden {
    display: none;
  }

  .note {
    margin: 0;
    color: var(--dim);
    font-size: var(--text-label);
  }

  .warn {
    color: var(--warn);
  }

  .actions {
    display: flex;
    gap: 0.6rem;
  }

  button,
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 3.5rem;
    padding: 0 1.2rem;
    font: inherit;
    font-size: var(--text-body);
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    touch-action: manipulation;
    user-select: none;
  }

  button:disabled {
    opacity: 0.4;
  }

  .primary {
    min-width: 9rem;
    color: var(--bg);
    background: var(--fg);
    border-color: var(--fg);
    font-weight: 600;
  }

  .close {
    min-height: 3rem;
    width: 3rem;
    padding: 0;
    font-size: 1.7rem;
    background: none;
    border: 0;
    color: var(--dim);
  }

  input[type='file'] {
    display: none;
  }
</style>
