// Test-only Supabase repository boundary. No test account/data enters production.
import { vi } from "vitest";
import { emptyData, Data } from "./model";
const initial = () => ({
  topicImportReady: true,
  revision: 0,
  profile: { id: "test-user-a", displayName: "User A", avatarUrl: null },
  data: emptyData(),
});
export const testCloud = {
  snapshot: initial(),
  loadError: null as Error | null,
  saveError: null as Error | null,
};
export const load = vi.fn(async (userId: string) => {
  if (testCloud.loadError) throw testCloud.loadError;
  return {
    ...structuredClone(testCloud.snapshot),
    profile: { ...testCloud.snapshot.profile, id: userId },
  };
});
export const save = vi.fn(
  async (userId: string, previous: { revision: number }, next: Data) => {
    if (testCloud.saveError) throw testCloud.saveError;
    testCloud.snapshot = {
      topicImportReady: true,
      revision: previous.revision + 1,
      profile: { ...testCloud.snapshot.profile, id: userId },
      data: structuredClone(next),
    };
    return structuredClone(testCloud.snapshot);
  },
);
export function resetTestCloud() {
  testCloud.snapshot = initial();
  testCloud.loadError = null;
  testCloud.saveError = null;
  load.mockClear();
  save.mockClear();
}
