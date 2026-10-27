import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

function setup() {
  const sockets = [];
  const io = () => {
    const handlers = {}, emitted = [];
    const socket = { handlers, emitted, disconnected: false,
      on: (event, fn) => { handlers[event] = fn; }, emit: (...args) => emitted.push(args), disconnect() { this.disconnected = true; } };
    sockets.push(socket); return socket;
  };
  const load = loadPlantingModules(undefined, undefined, undefined, false, { 'socket.io-client': { io } });
  const api = load('../../../services/api');
  api.configureApi({ apiBaseUrl: 'https://api.example.test', getAccessToken: async () => 'token' });
  return { realtime: load('../../../services/userRealtime'), sockets };
}

test('the owner joins their own user room and is online only after the server accepts', () => {
  const { realtime, sockets } = setup();
  const seen = [];
  const stop = realtime.subscribeUserRealtime({ connection: value => seen.push(value) });
  realtime.startUserRealtime('owner'); realtime.startUserRealtime('owner');
  assert.equal(sockets.length, 1, 'one connection per owner');
  sockets[0].handlers.connect();
  const [event, payload, ack] = sockets[0].emitted[0];
  assert.equal(event, 'join-user'); assert.equal(payload, 'owner');
  assert.equal(realtime.userRealtimeConnected(), false);
  ack({ ok: true });
  assert.equal(realtime.userRealtimeConnected(), true);
  sockets[0].handlers.disconnect();
  assert.deepEqual(seen, [true, false]);
  realtime.startUserRealtime('someone-else');
  assert.equal(sockets[0].disconnected, true); assert.equal(sockets.length, 2);
  stop(); realtime.stopUserRealtime();
});

test('friends coming online and visits reach listeners; visit text is short and bilingual', () => {
  const { realtime, sockets } = setup();
  const presence = [], visits = [];
  realtime.subscribeUserRealtime({ presence: change => presence.push(change), visit: (record, owner) => visits.push([record.action, owner]) });
  realtime.startUserRealtime('owner');
  sockets[0].handlers.presenceChanged({ userId: 'friend', online: true });
  sockets[0].handlers.visitRecordAdded({ gardenOwnerId: 'owner', record: { visitorId: 'friend', visitorName: 'Mia', action: 'started visiting your garden' } });
  assert.deepEqual(presence.map(p => [p.userId, p.online]), [['friend', true]]);
  assert.deepEqual(visits, [['started visiting your garden', 'owner']]);
  assert.equal(realtime.visitNotice({ visitorName: 'Mia', action: 'started visiting your garden' }, false), 'Mia is visiting your Garden 🌸');
  assert.equal(realtime.visitNotice({ visitorName: 'Mia', action: 'support' }, true), 'Mia 给你的花送来了支持 💗');
  assert.equal(realtime.visitNotice({ visitorName: 'Mia', action: 'left your garden' }, false), null);
  realtime.stopUserRealtime();
});
