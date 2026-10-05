import { getCollection, replaceCollection } from "./api";
import { trackSync } from "./live";

export interface StoredStudent {
  studentName: string;
  studentId: string;
  dob: string;
  gender: string;
  guardian: string;
  phone: string;
  email: string;
  address: string;
  group: string;
  course: string;
  joiningDate: string;
  status: string;
}

const KEY = "students";

function loadLocal(): StoredStudent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredStudent[]) : [];
  } catch {
    return [];
  }
}

function cacheLocal(students: StoredStudent[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(students));
  } catch {}
}

// Postgres-first; falls back to the local cache when the API is unreachable.
export async function loadStudents(): Promise<StoredStudent[]> {
  try {
    const rows = await getCollection<StoredStudent>("students");
    cacheLocal(rows);
    return rows;
  } catch {
    return loadLocal();
  }
}

export async function saveStudents(students: StoredStudent[]): Promise<void> {
  cacheLocal(students);
  try {
    await trackSync(replaceCollection("students", students));
  } catch {
    // Local cache already updated; will sync on the next successful save.
  }
}
