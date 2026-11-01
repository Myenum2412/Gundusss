import assert from "node:assert/strict"
import { test } from "node:test"
import {
  calculateMonthlyAttendance,
  type AttendanceDay,
} from "./attendance-utils"

const sampleDays: AttendanceDay[] = [
  {
    date: "2026-11-01",
    entries: [
      { studentId: "STU-001", studentName: "Alice", group: "G1", status: "Present" },
      { studentId: "STU-002", studentName: "Bob", group: "G1", status: "Absent" },
      { studentId: "STU-003", studentName: "Charlie", group: "G2", status: "Late" },
    ],
  },
  {
    date: "2026-11-02",
    entries: [
      { studentId: "STU-001", studentName: "Alice", group: "G1", status: "Present" },
      { studentId: "STU-002", studentName: "Bob", group: "G1", status: "Present" },
    ],
  },
  {
    date: "2026-11-03",
    entries: [
      { studentId: "STU-001", studentName: "Alice", group: "G1", status: "Absent" },
      { studentId: "STU-002", studentName: "Bob", group: "G1", status: "Absent" },
    ],
  },
  // Day from another month (October)
  {
    date: "2026-10-31",
    entries: [
      { studentId: "STU-001", studentName: "Alice", group: "G1", status: "Present" },
      { studentId: "STU-002", studentName: "Bob", group: "G1", status: "Present" },
    ],
  },
]

test("calculateMonthlyAttendance computes tallies for the selected month only", () => {
  const result = calculateMonthlyAttendance(sampleDays, "2026-11")

  // Alice: 2 present, 1 absent in Nov
  const alice = result.studentTallies.get("STU-001")
  assert.equal(alice?.present, 2)
  assert.equal(alice?.absent, 1)
  assert.equal(alice?.late, 0)
  assert.equal(alice?.total, 3)

  // Bob: 1 present, 2 absent in Nov
  const bob = result.studentTallies.get("STU-002")
  assert.equal(bob?.present, 1)
  assert.equal(bob?.absent, 2)
  assert.equal(bob?.late, 0)
  assert.equal(bob?.total, 3)

  // Charlie: 0 present, 0 absent, 1 late
  const charlie = result.studentTallies.get("STU-003")
  assert.equal(charlie?.present, 0)
  assert.equal(charlie?.absent, 0)
  assert.equal(charlie?.late, 1)
  assert.equal(charlie?.total, 1)

  // Aggregates:
  // Total present: 2 (Alice) + 1 (Bob) = 3
  assert.equal(result.totalPresent, 3)
  // Total absent: 1 (Alice) + 2 (Bob) = 3
  assert.equal(result.totalAbsent, 3)
  // Total late: 1 (Charlie)
  assert.equal(result.totalLate, 1)
  // Marked days count in Nov: 3 days
  assert.equal(result.markedDaysCount, 3)
})

test("calculateMonthlyAttendance respects student filter", () => {
  const result = calculateMonthlyAttendance(sampleDays, "2026-11", new Set(["STU-001"]))

  assert.equal(result.studentTallies.size, 1)
  assert.equal(result.totalPresent, 2)
  assert.equal(result.totalAbsent, 1)
  assert.equal(result.totalLate, 0)
})

test("calculateMonthlyAttendance for another month filters correctly", () => {
  const result = calculateMonthlyAttendance(sampleDays, "2026-10")

  assert.equal(result.totalPresent, 2)
  assert.equal(result.totalAbsent, 0)
  assert.equal(result.markedDaysCount, 1)
})
