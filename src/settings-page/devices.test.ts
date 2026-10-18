import { describe, expect, it } from 'vitest';
import type { DeviceInfo } from '../api';
import { connectMessage, deviceRows, rowState } from './devices';

const device = (id: string, type: DeviceInfo['type'], state: DeviceInfo['state'], available?: boolean): DeviceInfo => ({
  name: id,
  id,
  type,
  state,
  ...(available === undefined ? {} : { available }),
});

describe('the device lists of Connections (research.md 20.10 S2b)', () => {
  it("each list has its type only: the rig's frame gives two machines and one scale", () => {
    // As /ws/v1/devices sent it on the rig, 2026-10-18: the mock DE1, a real DE1 found by Bluetooth, the mock scale.
    const devices = [
      device('MockScale', 'scale', 'connected', true),
      device('MockDe1', 'machine', 'connected', true),
      device('aa:bb:cc:00:00:02', 'machine', 'discovered', true),
    ];
    expect(deviceRows(devices, 'machine', 'MockDe1').map((row) => [row.device.id, row.state, row.preferred])).toEqual([
      ['MockDe1', 'connected', true],
      ['aa:bb:cc:00:00:02', 'available', false],
    ]);
    expect(deviceRows(devices, 'scale', null).map((row) => [row.device.id, row.state, row.preferred])).toEqual([
      ['MockScale', 'connected', false],
    ]);
  });

  it('orders connected, then connecting or disconnecting, then present, then remembered and absent; else as Decaid sends them', () => {
    const devices = [
      device('gone', 'scale', 'disconnected', false),
      device('found-1', 'scale', 'discovered'),
      device('leaving', 'scale', 'disconnecting', true),
      device('found-2', 'scale', 'disconnected', true),
      device('on', 'scale', 'connected', true),
      device('coming', 'scale', 'connecting', true),
    ];
    expect(deviceRows(devices, 'scale', null).map((row) => row.device.id)).toEqual([
      'on',
      'leaving',
      'coming',
      'found-1',
      'found-2',
      'gone',
    ]);
  });

  it('says the state and offers what Streamline offers', () => {
    const rows = deviceRows(
      [
        device('on', 'machine', 'connected', true),
        device('coming', 'machine', 'connecting', true),
        device('found', 'machine', 'discovered', true),
        device('gone', 'machine', 'disconnected', false),
      ],
      'machine',
      'gone',
    );
    expect(rows.map((row) => [row.device.id, row.label, row.actions, row.preferred])).toEqual([
      ['on', 'Connected', ['disconnect'], false],
      ['coming', 'Connecting', [], false],
      ['found', 'Available', ['connect'], false],
      // A remembered device that is absent connects again when a scan finds it.
      ['gone', 'Unavailable', ['rescan', 'forget'], true],
    ]);
  });

  it('a device of an older Decaid without `available` is present', () => {
    expect(rowState(device('old', 'scale', 'disconnected'))).toBe('available');
    expect(rowState(device('old', 'scale', 'connected'))).toBe('connected');
    // A remembered device is absent even with a stale state.
    expect(rowState(device('gone', 'scale', 'connected', false))).toBe('unavailable');
  });

  it('a device without a name is not listed; sensors and grinders are in neither list', () => {
    const devices = [{ ...device('x', 'scale', 'discovered'), name: '' }, device('probe', 'sensor', 'connected'), device('g', 'grinder', 'connected')];
    expect(deviceRows(devices, 'scale', null)).toEqual([]);
    expect(deviceRows(devices, 'machine', null)).toEqual([]);
  });

  it("says what a connect that did not connect answered", () => {
    expect(connectMessage({ outcome: 'connected' })).toBeNull();
    expect(connectMessage({ outcome: 'alreadyConnected' })).toBeNull();
    expect(connectMessage({ outcome: 'conflict' })).toBe('Already connecting: try again in a moment.');
    expect(connectMessage({ outcome: 'timedOut' })).toBe('The connection timed out.');
    expect(connectMessage({ outcome: 'failed', error: 'adapter off' })).toBe('Not connected: adapter off');
    expect(connectMessage({ outcome: 'failed', connectionError: { message: 'no permission' } })).toBe('Not connected: no permission');
  });
});
