import { getCollection, replaceCollection } from "./api";
import { trackSync } from "./live";

export interface StoredGroup {
  groupId: string;
  groupName: string;
  course: string;
  batch: string;
  feeAmount: string;
  feeFrequency: string;
  startDate: string;
  endDate: string;
  description: string;
  studentIds: string[];
}

// PostgreSQL (through the API) is the only source of truth. Nothing is cached in
// the browser, so a signed-in account can never read another account's copy.
export function loadGroups(): Promise<StoredGroup[]> {
  return getCollection<StoredGroup>("student-groups");
}

export async function saveGroups(groups: StoredGroup[]): Promise<void> {
  try {
    await trackSync(replaceCollection("student-groups", groups));
  } catch (error) {
    console.error("Failed to save student groups", error);
  }
}
