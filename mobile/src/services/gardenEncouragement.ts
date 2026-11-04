import { apiRequest } from './api';
import type { ReceivedEncouragement, VisitorEncouragementState } from '../components/encouragement/encouragementFormat';

// Daily Garden encouragement. The server is the source of truth for whether today's
// Support or note was already given (one each per friend per day); the app only mirrors it.
const visitPath = (ownerId: string) => `/users/${encodeURIComponent(ownerId)}/garden-encouragement`;

export const loadVisitorEncouragement = (ownerId: string) =>
  apiRequest<VisitorEncouragementState>(visitPath(ownerId));
export const giveGardenSupport = (ownerId: string) =>
  apiRequest<VisitorEncouragementState>(`${visitPath(ownerId)}/support`, 'POST', {});
export const leaveGardenNote = (ownerId: string, text: string) =>
  apiRequest<VisitorEncouragementState>(`${visitPath(ownerId)}/message`, 'POST', { text });

export const loadReceivedEncouragement = (cursor?: string) =>
  apiRequest<ReceivedEncouragement>(`/users/me/garden-encouragements${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
export const markEncouragementRead = (body: { messageIds?: string[]; supports?: boolean }) =>
  apiRequest<{ updated: number }>('/users/me/garden-encouragements/read', 'POST', body);
