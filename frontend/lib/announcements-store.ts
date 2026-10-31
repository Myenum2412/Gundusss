import { getCollection, replaceCollection } from "./api";
import { trackSync } from "./live";

export interface StoredAnnouncement {
  announcementId: string;
  title: string;
  message: string;
  recipientIds: string[];
  recipientNames: string[];
  /** Files delivered with the message (names only — data is not stored). */
  attachments?: { name: string; mime: string }[];
  sentCount: number;
  failedCount: number;
  status: "Sent" | "Partial" | "Failed";
  createdAt: string;
}

// Appwrite (through the API) is the only source of truth. Nothing is cached in
// the browser, so a signed-in account can never read another account's copy.
export function loadAnnouncements(): Promise<StoredAnnouncement[]> {
  return getCollection<StoredAnnouncement>("announcements");
}

export async function saveAnnouncements(
  items: StoredAnnouncement[]
): Promise<void> {
  try {
    await trackSync(replaceCollection("announcements", items));
  } catch (error) {
    console.error("Failed to save announcements", error);
  }
}
