// The app keeps its size when the keyboard opens (spec 3.9, item 10). Decaid's Android activity
// resizes its WebView to the space above the keyboard (`adjustResize`), and the skin sizes
// everything by the viewport, so the whole app was drawn small in the upper half. Here the
// viewport's size is stored in px on `:root` (`--app-w`, `--app-h`), at the start and on every
// resize that is not the keyboard: a new width (rotation, another window), or a height that
// grows. A height that shrinks while a text field has the focus is the keyboard and is not
// taken. `app.css` sizes the root font and `#app` from the stored size, so the keyboard covers
// the app's lower part. Then the field is lifted: when its dialog (or the label around it) reaches
// under the keyboard's top, `--keyboard-lift` holds the distance and the element is marked
// `data-lifted`, which `app.css` moves up by it; an element taller than the space above the
// keyboard (the profile's notes fill their column) is held to that space (`--keyboard-space`).
// Both go when the field loses the focus or the keyboard closes.

export interface Size {
  width: number;
  height: number;
}

/** px between the lifted element and the keyboard */
export const LIFT_MARGIN = 8;

/** The size the app keeps: the viewport's, but not a height the keyboard took away. */
export function keptSize(stored: Size | null, viewport: Size, typing: boolean): Size {
  if (!stored || viewport.width !== stored.width || viewport.height >= stored.height || !typing) return viewport;
  return stored;
}

/** px, how far an element from `top` to `bottom` moves up to end above the keyboard's top; never past the screen's top. */
export function liftFor(top: number, bottom: number, keyboardTop: number): number {
  const lift = bottom + LIFT_MARGIN - keyboardTop;
  return lift <= 0 ? 0 : Math.max(0, Math.min(lift, top));
}

/** A field the keyboard opens for. */
export function isTextField(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement) return !element.readOnly;
  if (!(element instanceof HTMLInputElement) || element.readOnly) return false;
  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(element.type);
}

/** What stays visible above the keyboard with the field: its dialog, else the label around it, else the field. */
function liftTarget(field: HTMLElement): HTMLElement {
  return field.closest<HTMLElement>('[role="dialog"]') ?? field.closest<HTMLElement>('label') ?? field;
}

/** px from the top of the layout viewport: where the keyboard begins, by the host's resize or the visual viewport. */
function keyboardTop(): number {
  const visual = window.visualViewport;
  return visual ? Math.min(window.innerHeight, visual.height + visual.offsetTop) : window.innerHeight;
}

/** Starts the module; returns what stops it. */
export function startViewport(root: HTMLElement = document.documentElement): () => void {
  let stored: Size | null = null;
  let lifted: HTMLElement | null = null;

  const store = (size: Size) => {
    stored = size;
    root.style.setProperty('--app-w', `${size.width}px`);
    root.style.setProperty('--app-h', `${size.height}px`);
    root.toggleAttribute('data-portrait', size.height > size.width);
  };

  const unlift = () => {
    lifted?.removeAttribute('data-lifted');
    lifted = null;
    root.style.setProperty('--keyboard-lift', '0px');
  };

  const lift = () => {
    const field = document.activeElement;
    if (!isTextField(field)) return unlift();
    const target = liftTarget(field);
    if (target !== lifted) unlift();
    // Measured where it stands without the lift.
    const shift = lifted ? parseFloat(root.style.getPropertyValue('--keyboard-lift')) || 0 : 0;
    const rect = target.getBoundingClientRect();
    const space = keyboardTop() - LIFT_MARGIN;
    const top = rect.top + shift;
    const distance = liftFor(top, top + Math.min(rect.height, space), keyboardTop());
    if (distance === 0 && rect.height <= space) return unlift();
    lifted = target;
    target.setAttribute('data-lifted', '');
    root.style.setProperty('--keyboard-lift', `${distance}px`);
    root.style.setProperty('--keyboard-space', `${space}px`);
  };

  const resize = () => {
    const typing = isTextField(document.activeElement);
    store(keptSize(stored, { width: window.innerWidth, height: window.innerHeight }, typing));
    lift();
  };

  // After the focus moved: the keyboard opens a moment later and resizes then.
  const focus = () => requestAnimationFrame(lift);

  store({ width: window.innerWidth, height: window.innerHeight });
  root.style.setProperty('--keyboard-lift', '0px');
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  document.addEventListener('focusin', focus);
  document.addEventListener('focusout', focus);
  return () => {
    window.removeEventListener('resize', resize);
    window.visualViewport?.removeEventListener('resize', resize);
    document.removeEventListener('focusin', focus);
    document.removeEventListener('focusout', focus);
    unlift();
  };
}
