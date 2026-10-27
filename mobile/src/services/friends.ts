import { apiRequest } from './api';

export interface FriendUser { id: string; name: string; displayName?: string; avatar?: string; accountId?: string | null; allowGardenVisits?: boolean;
  /** Friends list only: whether this friend has PetalPal open right now. */
  online?: boolean }
export interface FriendRequest {
  id: string; senderId: string; receiverId: string; status: string;
  sender?: FriendUser; receiver?: FriendUser;
}
export interface FriendRequests { incoming: FriendRequest[]; outgoing: FriendRequest[] }
interface FriendActionResponse { message?: string; request?: FriendRequest }

// Same contracts as the web Friends screens. Ownership is enforced by the
// existing authenticated API; mutation bodies contain only their target.
export const loadFriends = (ownerId: string) =>
  apiRequest<FriendUser[]>(`/users/${encodeURIComponent(ownerId)}/friends`);
export const loadFriendRequests = (ownerId: string) =>
  apiRequest<FriendRequests>(`/friends/requests/${encodeURIComponent(ownerId)}`);
export const searchFriends = (name: string) =>
  apiRequest<FriendUser[]>(`/users/search?name=${encodeURIComponent(name.trim())}`);
export const sendFriendRequest = (receiverId: string) =>
  apiRequest<FriendActionResponse>('/friends/request', 'POST', { receiverId });
export const respondToFriendRequest = (requestId: string, action: 'accept' | 'reject') =>
  apiRequest<FriendActionResponse>(`/friends/requests/${encodeURIComponent(requestId)}/${action}`, 'POST', {});
export const removeFriend = (friendId: string) =>
  apiRequest<FriendActionResponse>('/friends/remove', 'POST', { friendId });
