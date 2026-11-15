<script lang="ts">
  // The live camera in the number pad's dialog: `getUserMedia`, the rear
  // camera preferred, and a capture button. Decaid's window gives the live camera without asking
  // each time; where it is refused or missing, the system's camera through a file input stands in.
  import { onMount } from 'svelte';
  import Dialog from '../ui/Dialog.svelte';
  import { fileToPhoto, nextAngle, previousAngle, toPhoto, turnedSize, type Angle } from './photo';

  interface Props {
    /** the photo, a JPEG data URL scaled down */
    oncapture: (photo: string) => void;
    oncancel: () => void;
  }

  let { oncapture, oncancel }: Props = $props();

  let video: HTMLVideoElement | undefined = $state();
  let stream: MediaStream | null = null;
  let live = $state(false);
  /** why the live camera is not used: the file input stands in */
  let refused: string | null = $state(null);
  let failed: string | null = $state(null);
  /** the overlay's clockwise turn, for the way the tablet is held; not stored */
  let angle = $state<Angle>(0);
  const sideways = $derived(angle === 90 || angle === 270);
  /** the camera's frame size, once known; the viewfinder takes the frame's shape as stored */
  let frame = $state({ width: 16, height: 9 });
  const ratio = $derived(turnedSize(frame.width, frame.height, angle).width / turnedSize(frame.width, frame.height, angle).height);

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

  function measured() {
    if (video?.videoWidth) frame = { width: video.videoWidth, height: video.videoHeight };
  }

  function capture() {
    if (!video || !video.videoWidth) return;
    try {
      oncapture(toPhoto(video, video.videoWidth, video.videoHeight, angle));
    } catch {
      failed = 'The picture was not taken.';
    }
  }

  async function picked(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      oncapture(await fileToPhoto(file));
    } catch {
      failed = 'That file is not a picture.';
    }
  }
</script>

<Dialog label="photo of the bag" width="min(48rem, 92vw)" fill={sideways} testid="camera" backdrop="camera-backdrop" {oncancel}>
  <div class="stage" class:sideways>
    <div class="pad" style:transform="rotate({angle}deg)" data-angle={angle} data-testid="camera-pad">
      <div class="head">
        <span class="label">photo of the bag</span>
        <button class="close" aria-label="cancel" data-testid="camera-close" onclick={oncancel}>×</button>
      </div>
      <div class="viewfinder" class:hidden={!live}>
        <div class="frame" style:--ratio={ratio} data-testid="camera-frame">
          <video
            bind:this={video}
            style:transform="translate(-50%, -50%) rotate({-angle}deg)"
            autoplay
            muted
            playsinline
            onloadedmetadata={measured}
            onresize={measured}
            data-testid="camera-video"
          ></video>
        </div>
      </div>
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
            take a picture
            <input type="file" accept="image/*" capture="environment" data-testid="camera-file" onchange={picked} />
          </label>
        {:else}
          <button class="primary" data-testid="camera-capture" disabled={!live} onclick={capture}>capture</button>
        {/if}
        <button class="turn" data-testid="camera-turn-left" aria-label="turn left" onclick={() => (angle = previousAngle(angle))}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5 5 9l4 4M5 9h9a5 5 0 0 1 0 10h-3" /></svg>
        </button>
        <button class="turn" data-testid="camera-turn-right" aria-label="turn right" onclick={() => (angle = nextAngle(angle))}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4-4 4M19 9h-9a5 5 0 0 0 0 10h3" /></svg>
        </button>
        <button data-testid="camera-cancel" onclick={oncancel}>cancel</button>
      </div>
    </div>
  </div>
</Dialog>

<style>
  /* Turned a quarter, the dialog fills the viewport and the pad, as wide as the viewport is high and
     as high as it is wide, is turned about its centre: its turned box is the viewport. */
  .sideways .pad {
    position: absolute;
    left: 50%;
    top: 50%;
    box-sizing: border-box;
    width: 100vh;
    height: 100vw;
    margin: -50vw 0 0 -50vh;
  }

  .sideways .viewfinder {
    flex: 1;
    min-height: 0;
    container-type: size;
  }

  .sideways .frame {
    width: min(100cqw, calc(100cqh * var(--ratio)));
  }

  .pad {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .label {
    font-size: var(--text-body);
    color: var(--dim);
  }

  .viewfinder {
    display: flex;
    justify-content: center;
  }

  /* The viewfinder has the shape of the stored photo. The video keeps the camera's own shape in a box
     turned back by the overlay's angle and is centred in the frame; the frame's box is the photo's. */
  .frame {
    position: relative;
    container-type: size;
    width: min(100%, calc(60vh * var(--ratio)));
    aspect-ratio: var(--ratio);
    background: var(--bg);
    border-radius: var(--radius);
    overflow: hidden;
  }

  video {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 100cqw;
    height: 100cqh;
    object-fit: contain;
  }

  .sideways video {
    width: 100cqh;
    height: 100cqw;
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
    gap: var(--space-2);
  }

  /* A label that opens the file picker, drawn as a button: the buttons' reset of app.css. */
  .button {
    font: inherit;
    color: var(--fg);
    touch-action: manipulation;
    user-select: none;
  }

  button,
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--control-big);
    padding: 0 var(--space-3);
    font-size: var(--text-body);
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--radius);
  }

  button:disabled {
    opacity: 0.4;
  }

  .turn {
    width: var(--control-big);
    padding: 0;
  }

  .turn svg {
    width: 1.5rem;
    height: 1.5rem;
    fill: none;
    stroke: var(--fg);
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .primary {
    min-width: 9rem;
  }

  .close {
    min-height: var(--control);
    width: 3rem;
    padding: 0;
    font-size: var(--text-title);
    background: none;
    border: 0;
    color: var(--dim);
  }

  input[type='file'] {
    display: none;
  }
</style>
