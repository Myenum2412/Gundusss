import { getCollection, replaceCollection } from "./api";
import { trackSync } from "./live";

export type AttendanceStatus = "Present" | "Absent" | "Late";

export interface AttendanceEntry {
  studentId: string;
  studentName: string;
  group: string;
  status: AttendanceStatus;
  note?: string;
}

/** One row per calendar day; entries hold that day's student snapshots. */
export interface AttendanceDay {
  date: string;
  entries: AttendanceEntry[];
  updatedAt?: string;
}

// Database (through the API) is the only source of truth. Nothing is cached in
// the browser, so a signed-in account can never read another account's copy.
export function loadAttendance(): Promise<AttendanceDay[]> {
  return getCollection<AttendanceDay>("attendance");
}

// Attendance is marked in quick bursts (many students in a row). Serialize
// writes so an older request can never land after a newer one and undo marks.
let saveQueue: Promise<void> = Promise.resolve();
let pendingWrites = 0;

/** True while a local attendance change is still waiting to reach the database. */
export function isAttendanceSavePending(): boolean {
  return pendingWrites > 0;
}

export function saveAttendance(days: AttendanceDay[]): Promise<void> {
  pendingWrites += 1;
  saveQueue = saveQueue
    .then(async () => {
      try {
        await trackSync(replaceCollection("attendance", days));
      } catch (error) {
        console.error("Failed to save attendance", error);
      }
    })
    .finally(() => {
      pendingWrites -= 1;
    });
  return saveQueue;
}
