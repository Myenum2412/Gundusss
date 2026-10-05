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

export function loadStudents(): StoredStudent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredStudent[]) : [];
  } catch {
    return [];
  }
}

export function saveStudents(students: StoredStudent[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(students));
  } catch {}
}
