export interface StoredReceipt {
  receiptId: string;
  studentId: string;
  studentName: string;
  amount: string;
  method: string;
  paymentDate: string;
  status: string;
  notes: string;
}

const KEY = "receipts";

export function loadReceipts(): StoredReceipt[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredReceipt[]) : [];
  } catch {
    return [];
  }
}

export function saveReceipts(receipts: StoredReceipt[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(receipts));
  } catch {}
}
