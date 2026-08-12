// tests/online-presence.test.mjs — Presence PvP : abandon réel vs coupure locale.
import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createPrivate,
  getOnline,
  initOnline,
  leave,
  on,
  startPlaying,
} from '../game/src/online.js?v=115';

class FakeChannel {
  constructor() {
    this.handlers = {};
    this.presence = {};
    this.statusCallback = null;
    this.sent = [];
  }

  on(kind, _filter, callback) {
    this.handlers[kind] = callback;
    return this;
  }

  subscribe(callback) {
    this.statusCallback = callback;
    queueMicrotask(() => callback('SUBSCRIBED'));
    return this;
  }

  async track(meta) {
    this.presence[String(meta.side)] = [meta];
    return 'ok';
  }

  presenceState() {
    return this.presence;
  }

  send(message) {
    this.sent.push(message);
    return Promise.resolve('ok');
  }

  unsubscribe() {}

  setPresence(next) {
    this.presence = next;
    this.handlers.presence?.();
  }

  emitStatus(status) {
    return this.statusCallback?.(status);
  }

  emitAction(payload) {
    this.handlers.broadcast?.({ payload });
  }
}

function clientFor(channel) {
  return {
    rpc: async () => ({ data: [{ match_id: 'match-test', code: 'ABC123' }], error: null }),
    channel: () => channel,
  };
}

async function connectedPlayingChannel() {
  const channel = new FakeChannel();
  initOnline(clientFor(channel));
  await createPrivate();
  await new Promise((resolve) => setTimeout(resolve, 0));
  channel.emitAction({ kind: 'ready' });
  channel.setPresence({
    '0': [{ side: 0 }],
    '1': [{ side: 1 }],
  });
  startPlaying();
  return channel;
}

afterEach(() => {
  leave();
  on('oppLeft', null);
  on('disconnected', null);
});

describe('Presence PvP et reconnexion', () => {
  test('déclare une vraie absence adverse après le debounce', async () => {
    let left = 0;
    on('oppLeft', () => { left++; });
    const channel = await connectedPlayingChannel();

    channel.setPresence({ '0': [{ side: 0 }] });
    await new Promise((resolve) => setTimeout(resolve, 3100));

    assert.equal(left, 1);
    assert.equal(getOnline().oppGone, true);
  });

  test('ignore un sync vide pendant une coupure du canal local', async () => {
    let left = 0;
    on('oppLeft', () => { left++; });
    const channel = await connectedPlayingChannel();

    await channel.emitStatus('CHANNEL_ERROR');
    channel.setPresence({ '0': [{ side: 0 }] });
    await new Promise((resolve) => setTimeout(resolve, 3100));

    assert.equal(left, 0);
    assert.equal(getOnline().oppGone, false);
    assert.equal(getOnline()._channelStatus, 'reconnecting');
  });
});
