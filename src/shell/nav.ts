// The skin's navigation: one value says which screen is shown. No routes and no history
// stack: every screen is one tap from home, and home is one tap from every screen. The shot
// history is not a screen: it is an overlay on home (spec 3.1, src/history).
import type { MachineState } from '../api';

export const SCREENS = [
  'home',
  'espresso',
  'profiles',
  'editor',
  'steam',
  'hot-water',
  'settings',
] as const;

export type Screen = (typeof SCREENS)[number];

export const SCREEN_KEY = 'decaid-skin.screen';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The screen the skin opens with: the one it showed before the WebView unloaded (spec 4.1).
 * The espresso screen is never restored: it follows the machine, not the storage.
 */
export function loadScreen(store: Store = localStorage): Screen {
  try {
    const stored = store.getItem(SCREEN_KEY);
    if (stored !== 'espresso' && (SCREENS as readonly string[]).includes(stored ?? '')) {
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
 * The screen after a machine frame. The espresso screen opens by itself when the machine
 * enters espresso, also when the skin loads in the middle of a shot, and gives way to home
 * when the machine leaves espresso. Every other change of state leaves the screen alone.
 */
export function followMachine(screen: Screen, before: MachineState | undefined, now: MachineState): Screen {
  if (now === 'espresso' && before !== 'espresso') return 'espresso';
  if (now !== 'espresso' && before === 'espresso' && screen === 'espresso') return 'home';
  return screen;
}
