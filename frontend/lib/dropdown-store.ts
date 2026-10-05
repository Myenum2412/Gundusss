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

const DEFAULTS: Record<DropdownKey, string[]> = {
  gender: ["Male", "Female", "Other"],
  classGroup: ["Class 1", "Class 2", "Class 3", "Group A", "Group B"],
  course: ["Science", "Commerce", "Arts", "General"],
  studentStatus: ["Active", "Inactive"],
  feeFrequency: ["Monthly", "Quarterly", "Half-Yearly", "Yearly", "One-Time"],
  feeType: [
    "Tuition Fee",
    "Admission Fee",
    "Exam Fee",
    "Transport Fee",
    "Library Fee",
    "Hostel Fee",
    "Other",
  ],
  paymentMethod: ["Cash", "UPI", "Bank Transfer"],
  receiptStatus: ["Paid", "Pending", "Cancelled"],
};

export type DropdownMap = Record<DropdownKey, string[]>;

const KEY = "dropdown_options";

function loadLocal(): DropdownMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<DropdownKey, string[]>>;
    const merged = { ...DEFAULTS };
    for (const k of DROPDOWN_KEYS) {
      if (Array.isArray(parsed[k]) && (parsed[k] as string[]).length > 0) {
        merged[k] = parsed[k] as string[];
      }
    }
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

function cacheLocal(d: DropdownMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {}
}

// Postgres-first; falls back to defaults/local cache when unreachable.
export async function loadDropdowns(): Promise<DropdownMap> {
  try {
    const remote = await getDropdowns();
    const merged = { ...DEFAULTS };
    for (const k of DROPDOWN_KEYS) {
      if (Array.isArray(remote[k]) && remote[k].length > 0) {
        merged[k] = remote[k];
      }
    }
    cacheLocal(merged);
    return merged;
  } catch {
    return loadLocal();
  }
}

export async function saveDropdowns(d: DropdownMap): Promise<void> {
  cacheLocal(d);
  try {
    await trackSync(saveDropdownsApi(d));
  } catch {
    // Local cache already updated; will sync on the next successful save.
  }
}

// Synchronous read of the last-known cache (for render paths that cannot
// suspend on the async Postgres load). The async loader refreshes it.
export function loadDropdownsSync(): DropdownMap {
  return loadLocal();
}
