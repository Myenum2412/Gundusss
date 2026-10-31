import type { AttendanceDay } from "./attendance-store";
import { resolveStudentFee } from "./fee-lookup";
import type { StoredFeeStructure } from "./fee-structures-store";
import type { StoredGroup } from "./groups-store";
import type { StoredReceipt } from "./receipts-store";
import type { StoredStudent } from "./students-store";

export type PerformanceLabel =
  | "Excellent"
  | "Good"
  | "Needs attention"
  | "No data";

export type FeeStatus = "Paid" | "Partial" | "Unpaid" | "No fee";

export interface StudentPerformance {
  student: StoredStudent;
  sessions: number;
  present: number;
  absent: number;
  late: number;
  /** Present + late divided by all marked sessions. Null means no attendance yet. */
  attendanceRate: number | null;
  performance: PerformanceLabel;
  feeAmount: number;
  paid: number;
  balance: number;
  feeStatus: FeeStatus;
}

export interface PerformanceSummary {
  totalStudents: number;
  activeStudents: number;
  markedSessions: number;
  averageAttendance: number;
  atRisk: number;
  noAttendance: number;
  outstanding: number;
  studentsWithDues: number;
}

const PAID_RECEIPT_STATUSES = new Set(["paid", "success", "settled"]);

const EMPTY_TALLY = { sessions: 0, present: 0, absent: 0, late: 0 };

function amountOf(value: string | number | null | undefined): number {
  const amount =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function performanceFor(rate: number | null): PerformanceLabel {
  if (rate === null) return "No data";
  if (rate >= 90) return "Excellent";
  if (rate >= 75) return "Good";
  return "Needs attention";
}

function addReceipt(
  map: Map<string, StoredReceipt[]>,
  key: string,
  receipt: StoredReceipt
) {
  if (!key) return;
  const existing = map.get(key);
  if (existing) existing.push(receipt);
  else map.set(key, [receipt]);
}

/** Build one performance row per student from attendance and fee records. */
export function buildStudentPerformance(
  students: StoredStudent[],
  attendance: AttendanceDay[],
  groups: StoredGroup[],
  feeStructures: StoredFeeStructure[],
  receipts: StoredReceipt[]
): StudentPerformance[] {
  const tallies = new Map<string, typeof EMPTY_TALLY>();

  for (const day of attendance) {
    for (const entry of day.entries ?? []) {
      const key = (entry.studentId ?? "").trim().toLowerCase();
      if (!key) continue;
      const tally = tallies.get(key) ?? { ...EMPTY_TALLY };
      tally.sessions += 1;
      if (entry.status === "Present") tally.present += 1;
      else if (entry.status === "Absent") tally.absent += 1;
      else if (entry.status === "Late") tally.late += 1;
      tallies.set(key, tally);
    }
  }

  const paidReceipts = new Map<string, StoredReceipt[]>();
  for (const receipt of receipts) {
    const status = (receipt.status ?? "").trim().toLowerCase();
    if (!PAID_RECEIPT_STATUSES.has(status)) continue;
    const studentId = (receipt.studentId ?? "").trim().toLowerCase();
    const studentName = (receipt.studentName ?? "").trim().toLowerCase();
    if (studentId) addReceipt(paidReceipts, `id:${studentId}`, receipt);
    if (studentName) addReceipt(paidReceipts, `name:${studentName}`, receipt);
  }

  return students.map((student) => {
    const studentId = (student.studentId ?? "").trim().toLowerCase();
    const studentName = (student.studentName ?? "").trim().toLowerCase();
    const tally = tallies.get(studentId) ?? { ...EMPTY_TALLY };
    const attendanceRate =
      tally.sessions > 0
        ? Math.round(
            ((tally.present + tally.late) / tally.sessions) * 100
          )
        : null;

    const fee = resolveStudentFee(student, feeStructures, groups);
    const feeAmount = amountOf(fee.amount);

    // A receipt can match both the student ID and name. Deduplicate by receipt
    // ID before summing so one payment is never counted twice.
    const matchedReceipts = new Map<string, StoredReceipt>();
    for (const receipt of paidReceipts.get(`id:${studentId}`) ?? []) {
      matchedReceipts.set(
        receipt.receiptId ||
          `${receipt.studentId}:${receipt.paymentDate}:${receipt.amount}`,
        receipt
      );
    }
    for (const receipt of paidReceipts.get(`name:${studentName}`) ?? []) {
      matchedReceipts.set(
        receipt.receiptId ||
          `${receipt.studentName}:${receipt.paymentDate}:${receipt.amount}`,
        receipt
      );
    }
    const paid = [...matchedReceipts.values()].reduce(
      (sum, receipt) => sum + amountOf(receipt.amount),
      0
    );
    const balance = Math.max(0, feeAmount - paid);
    const feeStatus: FeeStatus =
      feeAmount <= 0
        ? "No fee"
        : paid <= 0
          ? "Unpaid"
          : balance > 0
            ? "Partial"
            : "Paid";

    return {
      student,
      sessions: tally.sessions,
      present: tally.present,
      absent: tally.absent,
      late: tally.late,
      attendanceRate,
      performance: performanceFor(attendanceRate),
      feeAmount,
      paid,
      balance,
      feeStatus,
    };
  });
}

export function summarizePerformance(
  rows: StudentPerformance[]
): PerformanceSummary {
  const markedSessions = rows.reduce((sum, row) => sum + row.sessions, 0);
  const attendedSessions = rows.reduce(
    (sum, row) => sum + row.present + row.late,
    0
  );

  return {
    totalStudents: rows.length,
    activeStudents: rows.filter((row) => row.student.status === "Active").length,
    markedSessions,
    averageAttendance: markedSessions
      ? Math.round((attendedSessions / markedSessions) * 100)
      : 0,
    atRisk: rows.filter(
      (row) => row.attendanceRate !== null && row.attendanceRate < 75
    ).length,
    noAttendance: rows.filter((row) => row.sessions === 0).length,
    outstanding: rows.reduce((sum, row) => sum + row.balance, 0),
    studentsWithDues: rows.filter((row) => row.balance > 0).length,
  };
}
