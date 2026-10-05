import { getCollection, replaceCollection } from "./api";
import { trackSync } from "./live";

export interface StoredFeeStructure {
  structureId: string;
  structureName: string;
  courseGroup: string;
  feeType: string;
  amount: string;
  frequency: string;
  dueDate: string;
  lateFee: string;
  paymentMethods: string[];
  status: string;
  description: string;
  studentIds: string[];
}

const KEY = "fee_structures";

function loadLocal(): StoredFeeStructure[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredFeeStructure[]) : [];
  } catch {
    return [];
  }
}

function cacheLocal(structures: StoredFeeStructure[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(structures));
  } catch {}
}

// Postgres-first; falls back to the local cache when the API is unreachable.
export async function loadFeeStructures(): Promise<StoredFeeStructure[]> {
  try {
    const rows = await getCollection<StoredFeeStructure>("fee-structures");
    cacheLocal(rows);
    return rows;
  } catch {
    return loadLocal();
  }
}

export async function saveFeeStructures(structures: StoredFeeStructure[]): Promise<void> {
  cacheLocal(structures);
  try {
    await trackSync(replaceCollection("fee-structures", structures));
  } catch {
    // Local cache already updated; will sync on the next successful save.
  }
}
