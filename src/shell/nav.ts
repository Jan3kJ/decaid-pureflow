// The skin's navigation: one value says which screen is shown. No routes and no history
// stack: every screen is one tap from home, and home is one tap from every screen. The shot
// history is not a screen: it is an overlay on home (src/history); nor is the shot:
// home is the shot screen (`ShotView.svelte`).
import type { MachineState } from '../api';

export const SCREENS = ['home', 'profiles', 'editor', 'steam', 'hot-water', 'settings', 'beans'] as const;

export type Screen = (typeof SCREENS)[number];

export const SCREEN_KEY = 'pureflow.screen';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The screen the skin opens with: the one it showed before the WebView unloaded.
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
 * also when the skin loads in the middle of a shot, since home shows the shot. Every other
 * change of state leaves the screen alone: after the shot home keeps it, so nothing jumps.
 */
export function followMachine(screen: Screen, before: MachineState | undefined, now: MachineState): Screen {
  return now === 'espresso' && before !== 'espresso' ? 'home' : screen;
}
