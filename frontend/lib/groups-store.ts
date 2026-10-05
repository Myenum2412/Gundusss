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

export function loadGroups(): StoredGroup[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredGroup[]) : [];
  } catch {
    return [];
  }
}

export function saveGroups(groups: StoredGroup[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(groups));
  } catch {}
}
