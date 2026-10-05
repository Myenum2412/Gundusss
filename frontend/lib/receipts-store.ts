import { getCollection, replaceCollection } from "./api";
import { trackSync } from "./live";

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

function loadLocal(): StoredReceipt[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredReceipt[]) : [];
  } catch {
    return [];
  }
}

function cacheLocal(receipts: StoredReceipt[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(receipts));
  } catch {}
}

// Postgres-first; falls back to the local cache when the API is unreachable.
export async function loadReceipts(): Promise<StoredReceipt[]> {
  try {
    const rows = await getCollection<StoredReceipt>("receipts");
    cacheLocal(rows);
    return rows;
  } catch {
    return loadLocal();
  }
}

export async function saveReceipts(receipts: StoredReceipt[]): Promise<void> {
  cacheLocal(receipts);
  try {
    await trackSync(replaceCollection("receipts", receipts));
  } catch {
    // Local cache already updated; will sync on the next successful save.
  }
}
