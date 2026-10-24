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

// Appwrite (through the API) is the only source of truth. Nothing is cached in
// the browser, so a signed-in account can never read another account's copy.
export function loadFeeStructures(): Promise<StoredFeeStructure[]> {
  return getCollection<StoredFeeStructure>("fee-structures");
}

export async function saveFeeStructures(
  structures: StoredFeeStructure[]
): Promise<void> {
  try {
    await trackSync(replaceCollection("fee-structures", structures));
  } catch (error) {
    console.error("Failed to save fee structures", error);
  }
}
