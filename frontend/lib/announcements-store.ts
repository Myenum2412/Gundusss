import { getCollection, replaceCollection } from "./api";
import { trackSync } from "./live";

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

function loadLocal(): StoredAnnouncement[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredAnnouncement[]) : [];
  } catch {
    return [];
  }
}

function cacheLocal(items: StoredAnnouncement[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
}

// Postgres-first; falls back to the local cache when the API is unreachable.
export async function loadAnnouncements(): Promise<StoredAnnouncement[]> {
  try {
    const rows = await getCollection<StoredAnnouncement>("announcements");
    cacheLocal(rows);
    return rows;
  } catch {
    return loadLocal();
  }
}

export async function saveAnnouncements(items: StoredAnnouncement[]): Promise<void> {
  cacheLocal(items);
  try {
    await trackSync(replaceCollection("announcements", items));
  } catch {
    // Local cache already updated; will sync on the next successful save.
  }
}
