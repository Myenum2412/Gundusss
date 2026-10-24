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

// Appwrite (through the API) is the only source of truth. Nothing is cached in
// the browser, so a signed-in account can never read another account's copy.
export function loadReceipts(): Promise<StoredReceipt[]> {
  return getCollection<StoredReceipt>("receipts");
}

export async function saveReceipts(receipts: StoredReceipt[]): Promise<void> {
  try {
    await trackSync(replaceCollection("receipts", receipts));
  } catch (error) {
    console.error("Failed to save receipts", error);
  }
}
