// The skin's navigation: one value says which screen is shown. No routes and no history
// stack: every screen is one tap from home, and home is one tap from every screen.
import type { MachineState } from '../api';

export const SCREENS = [
  'home',
  'espresso',
  'profiles',
  'editor',
  'steam',
  'history',
  'scale',
  'settings',
] as const;

export type Screen = (typeof SCREENS)[number];

/** Screens that have their place in the shell and are built by a later milestone. */
export const PLACEHOLDERS: Partial<Record<Screen, { title: string; text: string }>> = {
  steam: {
    title: 'Steam',
    text: 'Start and stop, the steam graph and the timer set from the weight of the milk come here.',
  },
  history: {
    title: 'Shot history',
    text: 'The list of previous shots comes here, as an overlay from the left edge.',
  },
  scale: { title: 'Scale', text: 'The connection of the scale and tare come here.' },
  settings: { title: 'Settings', text: 'The settings of the skin come here: steam, profile and a few others.' },
};

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
