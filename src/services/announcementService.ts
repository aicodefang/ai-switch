import { invoke } from '@tauri-apps/api/core';
import type { AnnouncementState } from '../types/announcement';
import { UPSTREAM_REMOTE_SERVICES_ENABLED } from '../productScope';

export async function getAnnouncementState(): Promise<AnnouncementState> {
  if (!UPSTREAM_REMOTE_SERVICES_ENABLED) return {announcements: [], unreadIds: [], popupAnnouncement: null};
  return await invoke('announcement_get_state');
}

export async function markAnnouncementAsRead(id: string): Promise<void> {
  await invoke('announcement_mark_as_read', { id });
}

export async function markAllAnnouncementsAsRead(): Promise<void> {
  await invoke('announcement_mark_all_as_read');
}

export async function forceRefreshAnnouncements(): Promise<AnnouncementState> {
  if (!UPSTREAM_REMOTE_SERVICES_ENABLED) return {announcements: [], unreadIds: [], popupAnnouncement: null};
  return await invoke('announcement_force_refresh');
}
