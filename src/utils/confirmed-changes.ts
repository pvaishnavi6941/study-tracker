import type { Data } from "../model";
function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [
          key,
          (key === "createdAt" || key === "completedAt") &&
          typeof v === "string"
            ? Date.parse(v)
            : normalized(v),
        ]),
    );
  return value;
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));
// If a response is lost after commit, a reload can confirm the intended diff.
// Compare just our changed rows so unrelated concurrent updates are retained.
export function changesConfirmed(
  before: Data,
  next: Data,
  actual: Data,
): boolean {
  for (const key of ["skills", "topics", "sessions", "plans"] as const) {
    const oldRows = new Map(before[key].map((row) => [row.id, row]));
    const newRows = new Map(next[key].map((row) => [row.id, row]));
    const serverRows = new Map(actual[key].map((row) => [row.id, row]));
    for (const [id, row] of newRows) {
      let actualRow = serverRows.get(id);
      if (key === "topics" && actualRow) {
        // The database assigns metadata for old backups/manual topic creation.
        // Compare only metadata supplied by the intended write.
        const intended = row as Data["topics"][number];
        actualRow = { ...actualRow };
        if (intended.priority === undefined)
          delete (actualRow as Data["topics"][number]).priority;
        if (intended.sortOrder === undefined)
          delete (actualRow as Data["topics"][number]).sortOrder;
        if (intended.stoppedAt === undefined)
          delete (actualRow as Data["topics"][number]).stoppedAt;
      }
      if (!equal(row, oldRows.get(id)) && !equal(row, actualRow)) return false;
    }
    for (const id of oldRows.keys())
      if (!newRows.has(id) && serverRows.has(id)) return false;
  }
  if (
    !equal(before.preferences, next.preferences) &&
    !equal(next.preferences, actual.preferences)
  )
    return false;
  if (!equal(before.timer, next.timer) && !equal(next.timer, actual.timer))
    return false;
  return true;
}
