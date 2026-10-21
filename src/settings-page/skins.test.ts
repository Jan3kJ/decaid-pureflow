import { describe, expect, it } from 'vitest';
import type { WebUiServerStatus, WebUiSkin } from '../api';
import { SERVER_POLL_MS, orderSkins, skinAddress, switchSkin } from './skins';

const skin = (id: string, name: string): WebUiSkin => ({ id, name, path: `/web-ui/${id}`, isBundled: true });

/** A gateway that keeps `kept` as default (or takes what is set) and answers the status in turn. */
function gateway(statuses: (WebUiServerStatus | Error)[], kept?: string) {
  const calls: string[] = [];
  let chosen = 'streamline.js';
  const client = {
    setDefaultSkin(id: string) {
      calls.push(`set ${id}`);
      chosen = kept ?? id;
      return Promise.resolve();
    },
    getDefaultSkin() {
      calls.push('default');
      return Promise.resolve(skin(chosen, chosen));
    },
    stopWebUiServer() {
      calls.push('stop');
      return Promise.resolve();
    },
    startWebUiServer() {
      calls.push('start');
      return Promise.resolve();
    },
    getWebUiServerStatus() {
      calls.push('status');
      const next = statuses.shift() ?? { serving: false };
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  };
  return { client, calls };
}

const noWait = async () => {};

describe('the skin list', () => {
  it('has the default skin first, the others by name', () => {
    const skins = [skin('streamline.js', 'Streamline.js'), skin('passione', 'Passione'), skin('beanie', 'Beanie')];
    expect(orderSkins(skins, 'passione').map((entry) => entry.id)).toEqual(['passione', 'beanie', 'streamline.js']);
    expect(orderSkins(skins, null).map((entry) => entry.id)).toEqual(['beanie', 'passione', 'streamline.js']);
  });
});

describe('the skin switch', () => {
  it('sets the default, checks it, starts the skin server again and gives the port it serves on', async () => {
    const { client, calls } = gateway([new Error('down'), { serving: false }, { serving: true, port: 27910 }]);
    expect(await switchSkin(client, 'insight', noWait)).toBe(27910);
    expect(calls).toEqual(['set insight', 'default', 'stop', 'start', 'status', 'status', 'status']);
  });

  it('stops when Decaid keeps another default, before the server is touched', async () => {
    const { client, calls } = gateway([], 'streamline.js');
    await expect(switchSkin(client, 'insight', noWait)).rejects.toThrow('Decaid kept streamline.js as its default skin.');
    expect(calls).toEqual(['set insight', 'default']);
  });

  it('says so when the server does not come back in time', async () => {
    const { client, calls } = gateway([]);
    await expect(switchSkin(client, 'insight', noWait, SERVER_POLL_MS * 3)).rejects.toThrow('Restart Decaid');
    expect(calls.filter((call) => call === 'status')).toHaveLength(3);
  });

  it("opens the served port on this page's host", () => {
    expect(skinAddress(27910, { protocol: 'http:', hostname: 'localhost' })).toBe('http://localhost:27910/');
  });
});
