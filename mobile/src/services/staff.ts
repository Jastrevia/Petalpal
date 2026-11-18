import { useEffect, useState } from 'react';
import { ApiError, apiRequest } from './api';

// Staff page data (lib/app-feedback.js, lib/social-safety.js). Only accounts whose Firebase uid is in
// MODERATOR_FIREBASE_UIDS get past /moderation; everyone else gets 403 and never sees the page.

export type FeedbackStatus = 'NEW' | 'READ' | 'DONE';
export interface StaffFeedback {
  id: string; kind: string; subject: string | null; message: string; replyEmail: string | null; route: string | null;
  appVersion: string | null; platform: string | null; status: FeedbackStatus; staffNote: string | null;
  createdAt: string; reviewedAt: string | null; user: { name: string | null; accountId: string | null } | null;
}
export interface FeedbackPage { items: StaffFeedback[]; counts: Record<FeedbackStatus, number>; nextBefore: string | null }

export interface StaffReport {
  id: string; category: string; status: string; createdAt: string;
  aiOutputKind: string | null; aiOutputId: string | null; reportedUserId: string | null; messageId: string | null;
  message: { id: string; text: string; author: string | null } | null;
  reportedUser: { id: string; name: string | null; accountId?: string | null } | null;
}
export type ReportAction = 'dismiss' | 'review-ai' | 'remove-message' | 'restrict-user' | 'restore-user';

export async function isStaff(): Promise<boolean> {
  try {
    return (await apiRequest<{ staff: boolean }>('/moderation/me')).staff === true;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 401)) return false;
    return false;
  }
}

// Checked once per mount; false until the answer comes back, so non-staff never see the entry.
export function useStaffAccess(enabled = true) {
  const [staff, setStaff] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    isStaff().then(value => { if (active) setStaff(value); });
    return () => { active = false; };
  }, [enabled]);
  return staff;
}

export function loadFeedback(status?: FeedbackStatus, before?: string) {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (before) query.set('before', before);
  const suffix = query.toString();
  return apiRequest<FeedbackPage>(`/moderation/feedback${suffix ? `?${suffix}` : ''}`);
}
export const updateFeedback = (id: string, change: { status?: FeedbackStatus; staffNote?: string | null }) =>
  apiRequest<{ success: true }>(`/moderation/feedback/${encodeURIComponent(id)}`, 'POST', change);

export const loadReports = () => apiRequest<StaffReport[]>('/moderation/reports');
export const actOnReport = (id: string, action: ReportAction) =>
  apiRequest<{ success: true }>(`/moderation/reports/${encodeURIComponent(id)}`, 'POST', { action });
