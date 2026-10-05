import { getCollection, replaceCollection } from "./api";
import { trackSync } from "./live";

export interface StoredGroup {
  groupId: string;
  groupName: string;
  course: string;
  batch: string;
  feeAmount: string;
  feeFrequency: string;
  startDate: string;
  endDate: string;
  description: string;
  studentIds: string[];
}

const KEY = "student_groups";

function loadLocal(): StoredGroup[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredGroup[]) : [];
  } catch {
    return [];
  }
}

function cacheLocal(groups: StoredGroup[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(groups));
  } catch {}
}

// Postgres-first; falls back to the local cache when the API is unreachable.
export async function loadGroups(): Promise<StoredGroup[]> {
  try {
    const rows = await getCollection<StoredGroup>("student-groups");
    cacheLocal(rows);
    return rows;
  } catch {
    return loadLocal();
  }
}

export async function saveGroups(groups: StoredGroup[]): Promise<void> {
  cacheLocal(groups);
  try {
    await trackSync(replaceCollection("student-groups", groups));
  } catch {
    // Local cache already updated; will sync on the next successful save.
  }
}
