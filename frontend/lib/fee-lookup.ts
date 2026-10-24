import type { StoredStudent } from "./students-store"
import type { StoredFeeStructure } from "./fee-structures-store"
import type { StoredGroup } from "./groups-store"

export interface StudentFeeResult {
  amount: string
  source: string
  frequency?: string
  feeType?: string
}

/**
 * Resolves the fee amount and fee schedule for a student based on:
 * 1. Direct Fee Structure assignment (by studentId)
 * 2. Student Group feeAmount (by student's assigned group or group name)
 * 3. Course / Group match in Fee Structures
 * 4. Default fallback
 */
export function resolveStudentFee(
  student: Pick<StoredStudent, "studentId"> & Partial<StoredStudent>,
  feeStructures: StoredFeeStructure[] = [],
  groups: StoredGroup[] = []
): StudentFeeResult {
  const studentId = student.studentId?.trim().toLowerCase()
  const studentGroup = student.group?.trim().toLowerCase()
  const studentCourse = student.course?.trim().toLowerCase()

  // 1. Direct studentId match in Fee Structures
  if (studentId) {
    for (const f of feeStructures) {
      if (f.studentIds && f.studentIds.some((id) => id.trim().toLowerCase() === studentId)) {
        return {
          amount: f.amount || "0",
          source: `Fee Structure: ${f.structureName || f.structureId}`,
          frequency: f.frequency,
          feeType: f.feeType,
        }
      }
    }
  }

  // 2. Student Group feeAmount match
  if (studentGroup) {
    for (const g of groups) {
      const gName = g.groupName?.trim().toLowerCase()
      const gId = g.groupId?.trim().toLowerCase()
      if ((gName && gName === studentGroup) || (gId && gId === studentGroup)) {
        if (g.feeAmount && Number(g.feeAmount) > 0) {
          return {
            amount: g.feeAmount,
            source: `Group: ${g.groupName} (${g.groupId})`,
            frequency: g.feeFrequency || "Monthly",
            feeType: "Tuition Fee",
          }
        }
      }
    }
  }

  // 3. Course / Group text match in Fee Structures
  for (const f of feeStructures) {
    const cg = (f.courseGroup || "").toLowerCase()
    if (studentGroup && cg.includes(studentGroup)) {
      return {
        amount: f.amount || "0",
        source: `Fee Structure for Group: ${f.structureName || f.courseGroup}`,
        frequency: f.frequency,
        feeType: f.feeType,
      }
    }
    if (studentCourse && cg.includes(studentCourse)) {
      return {
        amount: f.amount || "0",
        source: `Fee Structure for Course: ${f.structureName || f.courseGroup}`,
        frequency: f.frequency,
        feeType: f.feeType,
      }
    }
  }

  // 4. Default fallback if no specific fee is mapped
  return {
    amount: "4500",
    source: "Standard Academic Fee",
    frequency: "Monthly",
    feeType: "Tuition Fee",
  }
}
