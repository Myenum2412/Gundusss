import { getDropdowns, saveDropdownsApi } from "./api";
import { trackSync } from "./live";

export type DropdownKey =
  | "gender"
  | "classGroup"
  | "course"
  | "studentStatus"
  | "feeFrequency"
  | "feeType"
  | "paymentMethod"
  | "receiptStatus";

export const DROPDOWN_LABELS: Record<DropdownKey, string> = {
  gender: "Gender",
  classGroup: "Group / Class",
  course: "Course",
  studentStatus: "Student Status",
  feeFrequency: "Fee Frequency",
  feeType: "Fee Type",
  paymentMethod: "Payment Method",
  receiptStatus: "Receipt Status",
};

export const DROPDOWN_KEYS = Object.keys(DROPDOWN_LABELS) as DropdownKey[];

export type DropdownMap = Record<DropdownKey, string[]>;

function emptyDropdowns(): DropdownMap {
  return DROPDOWN_KEYS.reduce((acc, key) => {
    acc[key] = [];
    return acc;
  }, {} as DropdownMap);
}

// PostgreSQL (through the API) is the only source of truth. Options are
// configured by an administrator in Settings — no built-in defaults are
// injected in the browser.
export async function loadDropdowns(): Promise<DropdownMap> {
  const remote = await getDropdowns();
  const merged = emptyDropdowns();
  for (const key of DROPDOWN_KEYS) {
    if (Array.isArray(remote[key])) {
      merged[key] = remote[key];
    }
  }
  return merged;
}

export async function saveDropdowns(dropdowns: DropdownMap): Promise<void> {
  try {
    await trackSync(saveDropdownsApi(dropdowns));
  } catch (error) {
    console.error("Failed to save dropdown options", error);
  }
}
