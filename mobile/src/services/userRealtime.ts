import { io, type Socket } from 'socket.io-client';
import { accessToken, apiBaseUrl } from './api';

// One live connection per signed-in owner, joined to their private user room. Being connected is
// what makes them "online" for friends; through it they hear friends come and go and visits to
// their Garden. The server decides who may receive what.
export interface PresenceChange { userId: string; online: boolean }
export interface VisitRecord { visitorId?: string; visitorName?: string; visitorAvatar?: string; action?: string }
type Listener = {
  presence?: (change: PresenceChange) => void;
  visit?: (record: VisitRecord, gardenOwnerId?: string) => void;
  connection?: (connected: boolean) => void;
  friendAccepted?: (accepter: { name?: string; avatar?: string }) => void;
};

let socket: Socket | null = null, owner: string | null = null, connected = false;
const listeners = new Set<Listener>();

export function startUserRealtime(ownerId: string) {
  if (owner === ownerId && socket) return;
  stopUserRealtime();
  owner = ownerId;
  const next = io(apiBaseUrl() || undefined, { auth: (done) => {
    accessToken().then((token) => done({ token })).catch(() => done({ token: null }));
  } });
  socket = next;
  next.on('connect', () => {
    next.emit('join-user', ownerId, (reply?: { ok?: boolean }) => {
      if (socket !== next) return;
      connected = reply?.ok === true;
      listeners.forEach(l => l.connection?.(connected));
    });
  });
  next.on('disconnect', () => { if (socket !== next) return; connected = false; listeners.forEach(l => l.connection?.(false)); });
  next.on('presenceChanged', (change: PresenceChange) => listeners.forEach(l => l.presence?.(change)));
  // Sent to both people; only the one who asked hears "they said yes".
  next.on('friendRequestUpdated', (payload: { type?: string; senderId?: string; accepter?: { name?: string; avatar?: string } | null }) => {
    if (payload?.type === 'request-accepted' && payload.senderId === ownerId) listeners.forEach(l => l.friendAccepted?.(payload.accepter ?? {}));
  });
  next.on('visitRecordAdded', (payload: { gardenOwnerId?: string; record?: VisitRecord }) => {
    if (payload?.record) listeners.forEach(l => l.visit?.(payload.record!, payload.gardenOwnerId));
  });
}

export function stopUserRealtime() {
  socket?.disconnect(); socket = null; owner = null;
  if (connected) { connected = false; listeners.forEach(l => l.connection?.(false)); }
}

export const userRealtimeConnected = () => connected;

export function subscribeUserRealtime(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const friendAcceptedNotice = (name: string | undefined, chinese: boolean) => chinese
  ? `${name || '一位朋友'} 通过了你的好友申请 🌿` : `${name || 'A friend'} accepted your friend request 🌿`;

// What the owner sees when someone does something in their Garden ("left your garden" stays quiet).
export function visitNotice(record: VisitRecord, chinese: boolean): string | null {
  const name = record.visitorName || (chinese ? '一位朋友' : 'A friend');
  switch (record.action) {
    case 'started visiting your garden': return chinese ? `${name} 来逛你的花园了 🌸` : `${name} is visiting your Garden 🌸`;
    case 'support': return chinese ? `${name} 给你的花送来了支持 💗` : `${name} sent your flower some support 💗`;
    case 'message': return chinese ? `${name} 在你的花上留了言 💌` : `${name} left a message on your flower 💌`;
    default: return null;
  }
}
