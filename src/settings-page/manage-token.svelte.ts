// Decaid 0.9+ answers 401 'Missing or malformed bearer token' to every route that installs, enables,
// updates or removes a plugin or skin, switches the default skin or starts and stops the skin
// server, unless the request carries a "Manage plugins and skins" API token (Decent Account page >
// API access tokens). A skin has no such authority of its own, so the user pastes the token once;
// it is held in memory by the client for the life of the page (Decaid's `doc/Skins.md` advises against
// storing it); only the developer's install from a local server may keep it, see TOKEN_KEY.
import { DecaidApiError } from '../api';

/**
 * The token kept on this tablet for the developer's install from a local server only, so an update
 * does not ask again (the page reloads onto the new skin). Decaid advises against storing it;
 * the user chose this for that one flow, and 'forget token' removes it.
 */
export const TOKEN_KEY = 'pureflow.manage-token';

export function loadToken(store: Pick<Storage, 'getItem'> = localStorage): string | null {
  try {
    return store.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function saveToken(token: string, store: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    store.setItem(TOKEN_KEY, token);
  } catch {
    // no storage: the token is asked again next time
  }
}

export function forgetToken(store: Pick<Storage, 'removeItem'> = localStorage): void {
  try {
    store.removeItem(TOKEN_KEY);
  } catch {
    // nothing to remove
  }
}

/** What the token dialog shows while a call waits for a token; null when none is asked for. */
export interface TokenAsk {
  /** an earlier token was refused, so the dialog says so */
  refused: string | null;
  done: (token: string | null) => void;
}

export const tokenDialog: { ask: TokenAsk | null } = $state({ ask: null });

function askToken(refused: string | null): Promise<string | null> {
  return new Promise((resolve) => {
    tokenDialog.ask = {
      refused,
      done: (token) => {
        tokenDialog.ask = null;
        resolve(token);
      },
    };
  });
}

/** Why the token was refused, from Decaid's 401 and 403 answers; null for any other failure. */
export function refusal(cause: unknown): string | null {
  if (!(cause instanceof DecaidApiError)) return null;
  if (cause.status === 401) return 'Decaid did not accept that token.';
  if (cause.status === 403) return 'That token is not scoped for "Manage plugins and skins".';
  return null;
}

/**
 * Runs `run`, which calls gated routes of `client`. When Decaid answers 401 or 403 the user is asked
 * for a token and `run` goes again; a refused token is dropped and asked for again. Cancelling
 * throws, so the caller says it did not run.
 */
export async function withManageToken<T>(client: { manageToken: string | null }, run: () => Promise<T>, remember = false): Promise<T> {
  if (remember && !client.manageToken) client.manageToken = loadToken();
  for (;;) {
    try {
      return await run();
    } catch (cause) {
      const refused = refusal(cause);
      if (!refused) throw cause;
      // a token already held was refused; without one, Decaid asked for it (an older Decaid never does)
      const said = client.manageToken ? refused : null;
      client.manageToken = null;
      if (remember) forgetToken();
      const token = await askToken(said);
      if (!token) throw new Error('This needs a "Manage plugins and skins" API token.', { cause });
      client.manageToken = token;
      if (remember) saveToken(token);
    }
  }
}
