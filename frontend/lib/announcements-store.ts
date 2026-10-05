export interface StoredAnnouncement {
  announcementId: string;
  title: string;
  message: string;
  recipientIds: string[];
  recipientNames: string[];
  sentCount: number;
  failedCount: number;
  status: "Sent" | "Partial" | "Failed";
  createdAt: string;
}

const KEY = "announcements";

export function loadAnnouncements(): StoredAnnouncement[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredAnnouncement[]) : [];
  } catch {
    return [];
  }
}

export function saveAnnouncements(items: StoredAnnouncement[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
}
