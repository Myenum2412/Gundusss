import assert from "node:assert/strict"
import { test } from "node:test"
import { calculateUnpaidDues } from "./unpaid-dues"

const paidReceipt = {
  receiptId: "RCP-001",
  studentId: "STU-001",
  studentName: "lokesh",
  amount: "10.00",
  status: "Paid",
  paymentDate: "2026-11-05",
}

const staleCheckout = (n: number) => ({
  orderId: `FEE-${n}`,
  studentId: "STU-001",
  studentName: "lokesh",
  amount: "5000.00",
  status: "INITIATED",
  gatewayStatus: "INITIATED",
  receiptId: null,
  createdAt: `2026-11-0${(n % 9) + 1}T00:00:00.000Z`,
})

test("a student with a paid receipt has no unpaid due despite stale checkouts", () => {
  const dues = calculateUnpaidDues({
    students: [
      { studentId: "STU-001", studentName: "lokesh", joiningDate: "2026-10-31" },
    ],
    receipts: [paidReceipt],
    orders: Array.from({ length: 8 }, (_, i) => staleCheckout(i + 1)),
    resolveFee: () => "10",
  })

  assert.deepEqual(dues, [])
})

test("repeated open checkouts for one student count once, never summed", () => {
  const dues = calculateUnpaidDues({
    students: [],
    receipts: [],
    orders: [
      {
        studentId: "STU-009",
        studentName: "Walk-in",
        amount: "5000",
        status: "INITIATED",
        createdAt: "2026-11-01T10:00:00.000Z",
      },
      {
        studentId: "STU-009",
        studentName: "Walk-in",
        amount: "5000",
        status: "INITIATED",
        createdAt: "2026-11-03T10:00:00.000Z",
      },
      {
        studentId: "STU-009",
        studentName: "Walk-in",
        amount: "5000",
        status: "INITIATED",
        createdAt: "2026-11-02T10:00:00.000Z",
      },
    ],
    resolveFee: () => "10",
  })

  assert.equal(dues.length, 1)
  assert.equal(dues[0].amount, 5000)
  assert.equal(dues[0].month, "2026-11")
})

test("an enrolled student without a paid receipt owes the resolved fee once", () => {
  const dues = calculateUnpaidDues({
    students: [
      { studentId: "STU-002", studentName: "Ravi", joiningDate: "2026-10-01" },
    ],
    receipts: [],
    orders: [
      {
        studentId: "STU-002",
        studentName: "Ravi",
        amount: "5000",
        status: "INITIATED",
        createdAt: "2026-11-01T10:00:00.000Z",
      },
      {
        studentId: "STU-002",
        studentName: "Ravi",
        amount: "5000",
        status: "INITIATED",
        createdAt: "2026-11-02T10:00:00.000Z",
      },
    ],
    resolveFee: () => "10",
  })

  assert.deepEqual(dues.map((d) => d.amount), [10])
})

test("terminal and settled checkouts never count as dues", () => {
  const dues = calculateUnpaidDues({
    students: [],
    receipts: [],
    orders: [
      {
        studentId: "STU-010",
        amount: "5000",
        status: "EXPIRED",
        createdAt: "2026-11-01T10:00:00.000Z",
      },
      {
        studentId: "STU-011",
        amount: "5000",
        status: "FAILED",
        createdAt: "2026-11-01T10:00:00.000Z",
      },
      {
        studentId: "STU-012",
        amount: "5000",
        status: "SUCCESS",
        createdAt: "2026-11-01T10:00:00.000Z",
      },
      {
        studentId: "STU-013",
        amount: "5000",
        status: "PROCESSING",
        gatewayStatus: "SUCCESS",
        createdAt: "2026-11-01T10:00:00.000Z",
      },
    ],
    resolveFee: () => "10",
  })

  assert.deepEqual(dues, [])
})
