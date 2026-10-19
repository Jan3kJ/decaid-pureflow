// The skin's navigation: one value says which screen is shown. No routes and no history
// stack: every screen is one tap from home, and home is one tap from every screen. The shot
// history is not a screen: it is an overlay on home (spec 3.1, src/history); nor is the shot,
// an overlay on home's graph (spec 3.8, `ShotOverlay.svelte`).
import type { MachineState } from '../api';

export const SCREENS = [
  'home',
  'profiles',
  'editor',
  'steam',
  'hot-water',
  'settings',
] as const;

export type Screen = (typeof SCREENS)[number];

export const SCREEN_KEY = 'pureflow.screen';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The screen the skin opens with: the one it showed before the WebView unloaded (spec 4.1).
 * 'espresso', stored by a skin before 0.3, is no screen any more: home.
 */
export function loadScreen(store: Store = localStorage): Screen {
  try {
    const stored = store.getItem(SCREEN_KEY);
    if ((SCREENS as readonly string[]).includes(stored ?? '')) {
      return stored as Screen;
    }
  } catch {
    // no storage: home
  }
  return 'home';
}

export function saveScreen(screen: Screen, store: Store = localStorage): void {
  try {
    store.setItem(SCREEN_KEY, screen);
  } catch {
    // no storage: the screen lasts until the page unloads
  }
}

/**
 * The screen after a machine frame. Home opens by itself when the machine enters espresso,
 * also when the skin loads in the middle of a shot, since the shot's overlay lies on home
 * (`shotOverlay`). Every other change of state leaves the screen alone: after the shot the
 * overlay stays, so nothing jumps (founder, 2026-10-17).
 */
export function followMachine(screen: Screen, before: MachineState | undefined, now: MachineState): Screen {
  return now === 'espresso' && before !== 'espresso' ? 'home' : screen;
}

/**
 * The shot's overlay after a machine frame (spec 3.8): it opens when the machine enters
 * espresso and stays open after the shot, until it is closed (`closeShot`, a tap anywhere
 * once the shot is over) or the next shot opens it again with that shot.
 */
export function shotOverlay(open: boolean, before: MachineState | undefined, now: MachineState): boolean {
  return (now === 'espresso' && before !== 'espresso') || open;
}
