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

// Appwrite (through the API) is the only source of truth. Nothing is cached in
// the browser, so a signed-in account can never read another account's copy.
export function loadStudents(): Promise<StoredStudent[]> {
  return getCollection<StoredStudent>("students");
}

export async function saveStudents(students: StoredStudent[]): Promise<void> {
  try {
    await trackSync(replaceCollection("students", students));
  } catch (error) {
    console.error("Failed to save students", error);
  }
}
