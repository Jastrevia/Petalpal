import { accessToken, apiBaseUrl, apiRequest, configureApi, type ApiConnection } from '../../../services/api';
import { io } from 'socket.io-client';
import type { FlowerSourceDetail } from './flowerDetailData';

export interface FlowerSession {
  user: { id: string; name?: string; avatar?: string; timezone?: string };
}

export function configureFlowerSession(next: ApiConnection | null): void { configureApi(next); }

// The backend flower catalog also uses emoji artwork, which is not a URL.
function isFlowerImagePath(image: string): boolean {
  return /^(https?:|data:)/i.test(image) || /\.(png|jpe?g|gif|webp|svg|avif)(?:[?#].*)?$/i.test(image);
}

export function sourceFlowerImageUri(image: string): string | null {
  if (!isFlowerImagePath(image)) return null;
  if (/^(https?:|data:)/i.test(image)) return image;
  return `${apiBaseUrl()}/${image.replace(/^\//, '')}`;
}

const request = apiRequest;
export async function loadFlowerSession(): Promise<FlowerSession | null> {
  if (!await accessToken()) return null;
  return request<FlowerSession>('/session?view=metadata');
}

function flowerPath(ownerId: string, flowerId: string): string {
  if (!ownerId || !flowerId) throw new Error('This flower is missing its owner or source identity.');
  return `/users/${encodeURIComponent(ownerId)}/flowers/${encodeURIComponent(flowerId)}`;
}

export function loadFlowerSource(ownerId: string, flowerId: string): Promise<FlowerSourceDetail> {
  return request(flowerPath(ownerId, flowerId));
}

export function giveFlowerSupport(ownerId: string, flowerId: string): Promise<FlowerSourceDetail> {
  return request(`${flowerPath(ownerId, flowerId)}/support`, 'POST');
}

export function leaveFlowerMessage(ownerId: string, flowerId: string, text: string): Promise<FlowerSourceDetail> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Message cannot be empty');
  if (trimmed.length > 300) throw new Error('Messages can contain up to 300 characters.');
  return request(`${flowerPath(ownerId, flowerId)}/message`, 'POST', { text: trimmed });
}

/** Owner-only: store a planted cluster's Garden position (world coordinates + logical Land). */
export function saveFlowerPosition(ownerId: string, placement: {
  flowerId: string; worldX: number; worldY: number; landId?: string; scale?: number; rotation?: number;
}): Promise<{ id: string; worldX: number; worldY: number; landId: string; scale: number; rotation: number }> {
  if (!placement.landId) throw new Error('Choose a Garden Land for this flower.');
  return request(`${flowerPath(ownerId, placement.flowerId)}/placement`, 'PATCH', {
    worldX: placement.worldX, worldY: placement.worldY, landId: placement.landId,
    scale: placement.scale ?? 1, rotation: placement.rotation ?? 0,
  });
}

export async function deleteSourceFlower(ownerId: string, flowerId: string): Promise<void> {
  await request(flowerPath(ownerId, flowerId), 'DELETE');
}

export function subscribeToFlowerUpdates(ownerId: string, flowerId: string,
  onUpdate: (flower: FlowerSourceDetail) => void): () => void {
  let cancelled = false;
  let disconnect: (() => void) | undefined;
  accessToken().then((token) => {
    if (cancelled || !token) return;
    const socket = io(apiBaseUrl() || undefined, { auth: (done) => { accessToken().then((fresh) => done({ token: fresh })).catch(() => done({ token: null })); } });
    disconnect = () => socket.disconnect();
    socket.on('connect', () => socket.emit('join-garden', ownerId));
    const update = (payload: { gardenOwnerId?: string; flowerId?: string; flower?: FlowerSourceDetail }) => {
      if (payload?.gardenOwnerId === ownerId && payload.flowerId === flowerId && payload.flower) {
        onUpdate(payload.flower);
      }
    };
    socket.on('supportUpdated', update);
    socket.on('messageAdded', update);
  }).catch(() => { /* Detail requests still report actionable connection errors. */ });
  return () => { cancelled = true; disconnect?.(); };
}
