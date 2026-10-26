import assert from "node:assert/strict"
import { test } from "node:test"

import {
  decideReminderCheckout,
  generateReminderText,
  getStudentSpecificPaymentUrl,
} from "./reminder-message"

const cancelledUrl =
  "https://pay.myenum.in/checkout/3499aabc-0fd4-4dc5-8feb-b81a7abc59ca"
const freshUrl =
  "https://pay.myenum.in/checkout/1dca3b94-6bc6-4c33-94a6-9dc4ccae07cf"

const record = {
  orderId: "FEE-1792985830499-2f99194e",
  studentId: "STU-001",
  studentName: "Diagnostic Test",
  course: "General",
  group: "Regular",
  amount: "1.00",
  status: "INITIATED",
  paymentUrl: cancelledUrl,
}

test("a local INITIATED order with a cancelled gateway session is never reused", () => {
  assert.deepEqual(
    decideReminderCheckout({
      isPaid: false,
      localStatus: "INITIATED",
      gatewayStatus: "CANCELLED",
      cachedPaymentUrl: cancelledUrl,
    }),
    { kind: "fresh-checkout" }
  )
})

test("paid records only get an acknowledgment", () => {
  assert.deepEqual(
    decideReminderCheckout({
      isPaid: true,
      localStatus: "SUCCESS",
      gatewayStatus: "SUCCESS",
      cachedPaymentUrl: cancelledUrl,
    }),
    { kind: "acknowledgment" }
  )
})

test("the reminder body uses the freshly minted checkout, not the cached URL", () => {
  const message = generateReminderText({
    record,
    companyName: "MyFees",
    paymentUrl: freshUrl,
  })

  assert.match(message, new RegExp(freshUrl))
  assert.doesNotMatch(message, new RegExp(cancelledUrl))
})

test("a missing fresh URL never falls back to the cached checkout", () => {
  const message = generateReminderText({
    record,
    companyName: "MyFees",
    paymentUrl: "",
  })

  assert.doesNotMatch(message, new RegExp(cancelledUrl))
  assert.doesNotMatch(message, /Click to Pay Now/)
})

test("student id is appended exactly once for the recipient link", () => {
  const withStudent = getStudentSpecificPaymentUrl(freshUrl, "STU-001")
  assert.equal(withStudent, `${freshUrl}?student=STU-001`)
  assert.equal(
    getStudentSpecificPaymentUrl(withStudent, "STU-001"),
    withStudent
  )
})
