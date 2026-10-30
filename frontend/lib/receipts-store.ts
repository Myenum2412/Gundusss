import { getCollection, replaceCollection } from "./api";
import { apiFetch } from "./api-base";
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

// PostgreSQL (through the API) is the only source of truth. Nothing is cached in
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

export async function downloadReceiptPdf(receiptId: string): Promise<void> {
  let res = await apiFetch(`/api/receipts/${encodeURIComponent(receiptId)}/pdf`);
  if (!res.ok) {
    res = await apiFetch(`/api/public/receipts/${encodeURIComponent(receiptId)}/pdf`);
  }
  if (!res.ok) {
    res = await apiFetch(`/api/public/payments/${encodeURIComponent(receiptId)}/receipt/pdf`);
  }
  if (!res.ok) {
    throw new Error(`Failed to download PDF (${res.status})`);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Receipt-${receiptId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function viewReceiptPdf(receiptId: string): Promise<void> {
  let res = await apiFetch(`/api/receipts/${encodeURIComponent(receiptId)}/pdf`);
  if (!res.ok) {
    res = await apiFetch(`/api/public/receipts/${encodeURIComponent(receiptId)}/pdf`);
  }
  if (!res.ok) {
    res = await apiFetch(`/api/public/payments/${encodeURIComponent(receiptId)}/receipt/pdf`);
  }
  if (!res.ok) {
    throw new Error(`Failed to load PDF (${res.status})`);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank");
}

export async function sendReceiptPdfWhatsApp(
  receiptId: string,
  phone?: string
): Promise<{ ok: boolean; sentTo?: string; error?: string }> {
  const res = await apiFetch(
    `/api/receipts/${encodeURIComponent(receiptId)}/send-pdf`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || "Failed to send WhatsApp receipt");
  }
  return json;
}
