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

export function loadDropdowns(): DropdownMap {
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

export function saveDropdowns(d: DropdownMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {}
}
