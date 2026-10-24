import { getCollection, replaceCollection } from "./api";
import { trackSync } from "./live";

export interface StoredBranch {
  branchId: string;
  branchName: string;
  code: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  managerName: string;
  status: string;
  isHeadBranch: boolean;
  capacity: string;
}

// Appwrite (through the API) is the only source of truth. Nothing is cached in
// the browser, so a signed-in account can never read another account's copy.
export function loadBranches(): Promise<StoredBranch[]> {
  return getCollection<StoredBranch>("branches");
}

export async function saveBranches(branches: StoredBranch[]): Promise<void> {
  try {
    await trackSync(replaceCollection("branches", branches));
  } catch (error) {
    console.error("Failed to save branches", error);
  }
}
