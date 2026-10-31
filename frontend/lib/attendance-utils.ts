import type { StoredGroup } from "./groups-store";
import type { StoredStudent } from "./students-store";
import type {
  AttendanceDay,
  AttendanceEntry,
  AttendanceStatus,
} from "./attendance-store";

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "Present",
  "Absent",
  "Late",
];

/** Today in IST, matching the app's billing/reminder timezone. */
export function todayIso(): string {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

export function entriesForDay(
  days: AttendanceDay[],
  date: string
): Map<string, AttendanceEntry> {
  const day = days.find((row) => row.date === date);
  return new Map((day?.entries ?? []).map((entry) => [entry.studentId, entry]));
}

export interface AttendanceGroup {
  groupId: string;
  groupName: string;
  course: string;
  batch: string;
  members: StoredStudent[];
}

/** Groups from the groups store plus any ad-hoc group names on students. */
export function buildAttendanceGroups(
  groups: StoredGroup[],
  students: StoredStudent[]
): AttendanceGroup[] {
  const active = students.filter((student) => student.status !== "Inactive");
  const byName = new Map<string, AttendanceGroup>();

  for (const group of groups) {
    const memberIds = new Set(group.studentIds ?? []);
    byName.set(group.groupName, {
      groupId: group.groupId,
      groupName: group.groupName,
      course: group.course ?? "",
      batch: group.batch ?? "",
      members: active.filter(
        (student) =>
          memberIds.has(student.studentId) || student.group === group.groupName
      ),
    });
  }

  for (const student of active) {
    const name = (student.group ?? "").trim();
    if (!name || byName.has(name)) continue;
    byName.set(name, {
      groupId: name,
      groupName: name,
      course: student.course ?? "",
      batch: "",
      members: active.filter((row) => row.group === name),
    });
  }

  const ungrouped = active.filter((student) => !(student.group ?? "").trim());
  if (ungrouped.length > 0) {
    byName.set("Ungrouped", {
      groupId: "__ungrouped",
      groupName: "Ungrouped",
      course: "",
      batch: "",
      members: ungrouped,
    });
  }

  return [...byName.values()].sort((a, b) =>
    a.groupName.localeCompare(b.groupName)
  );
}

/** Apply one status to the given students, or clear it when `clear` is true. */
export function markStudents(
  days: AttendanceDay[],
  date: string,
  students: Pick<StoredStudent, "studentId" | "studentName" | "group">[],
  status: AttendanceStatus,
  clear = false
): AttendanceDay[] {
  if (students.length === 0) return days;

  const uniqueStudents = [
    ...new Map(students.map((student) => [student.studentId, student])).values(),
  ];
  const targetIds = new Set(uniqueStudents.map((student) => student.studentId));
  const existing = days.find((row) => row.date === date);
  const kept = (existing?.entries ?? []).filter(
    (entry) => !targetIds.has(entry.studentId)
  );
  const added: AttendanceEntry[] = clear
    ? []
    : uniqueStudents.map((student) => ({
        studentId: student.studentId,
        studentName: student.studentName,
        group: student.group ?? "",
        status,
      }));

  const entries = [...kept, ...added].sort((a, b) =>
    a.studentName.localeCompare(b.studentName)
  );
  const rest = days.filter((row) => row.date !== date);
  if (entries.length === 0) {
    return rest.sort((a, b) => a.date.localeCompare(b.date));
  }

  return [
    ...rest,
    { date, entries, updatedAt: new Date().toISOString() },
  ].sort((a, b) => a.date.localeCompare(b.date));
}
