import { requireSupabase } from "./supabase";
import { Data, validateData } from "../model";
import type { Json } from "./database.types";
export type Profile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};
export type Snapshot = { revision: number; profile: Profile; data: Data; topicImportReady?: boolean };
export type RowChanges<T> = { upsert: T[]; delete: string[] };
export type Changes = {
  skills: RowChanges<Data["skills"][number]>;
  topics: RowChanges<Data["topics"][number]>;
  sessions: RowChanges<Data["sessions"][number] & { startedAt: string }>;
  plans: RowChanges<Data["plans"][number]>;
  preferences?: Data["preferences"];
  timer?: Data["timer"];
};
function rows<T extends { id: string }>(
  before: T[],
  after: T[],
): RowChanges<T> {
  const previous = new Map(before.map((row) => [row.id, JSON.stringify(row)]));
  const ids = new Set(after.map((row) => row.id));
  return {
    upsert: after.filter((row) => JSON.stringify(row) !== previous.get(row.id)),
    delete: before.filter((row) => !ids.has(row.id)).map((row) => row.id),
  };
}
export function diffData(before: Data, after: Data): Changes {
  const sessions = rows(before.sessions, after.sessions);
  const changes: Changes = {
    skills: rows(before.skills, after.skills),
    topics: rows(before.topics, after.topics),
    sessions: {
      ...sessions,
      upsert: sessions.upsert.map((s) => ({
        ...s,
        startedAt: new Date(`${s.date}T${s.time}:00`).toISOString(),
      })),
    },
    plans: rows(before.plans, after.plans),
  };
  if (JSON.stringify(before.preferences) !== JSON.stringify(after.preferences))
    changes.preferences = after.preferences;
  if (JSON.stringify(before.timer) !== JSON.stringify(after.timer))
    changes.timer = after.timer;
  return changes;
}
export function parseSnapshot(raw: unknown, userId: string): Snapshot {
  if (!raw || typeof raw !== "object")
    throw new Error(
      "Your Cadence profile is missing. Apply the Cadence database migration to this Supabase project.",
    );
  const s = raw as Snapshot;
  if (
    !Number.isSafeInteger(s.revision) ||
    s.revision < 0 ||
    s.profile?.id !== userId ||
    typeof s.profile.displayName !== "string"
  )
    throw new Error("The server returned an invalid account snapshot.");
  return { ...s, data: validateData(s.data) };
}
export function cloudError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e?.code === "40001")
    return "Your data changed on another device. The latest data has been loaded. Please retry your change.";
  if (e?.code === "PGRST202" || e?.code === "PGRST205" || e?.code === "42P01")
    return "Cadence’s database schema is not installed yet. Apply supabase/migrations/202610030001_cadence.sql in your Supabase project, then retry.";
  if (e?.code === "42501" || e?.code === "PGRST301" || e?.code === "PGRST303")
    return "Your session has expired or access was denied. Sign in again to continue.";
  return e?.message
    ? `Could not sync with Supabase: ${e.message}`
    : "Could not reach Supabase. Check your connection and retry. Your unsaved form has been kept.";
}
export async function loadSnapshot(
  userId: string,
  signal?: AbortSignal,
): Promise<Snapshot> {
  const controller = new AbortController(),
    abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 20000);
  try {
    const { data, error } = await requireSupabase()
      .rpc("cadence_snapshot")
      .abortSignal(controller.signal);
    if (error) throw error;
    return parseSnapshot(data, userId);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
export async function saveSnapshot(
  userId: string,
  previous: Snapshot,
  next: Data,
  signal?: AbortSignal,
): Promise<Snapshot> {
  const changes = diffData(previous.data, validateData(next));
  const controller = new AbortController(),
    abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 20000);
  try {
    const { data, error } = await requireSupabase()
      .rpc("cadence_apply_changes", {
        expected_revision: previous.revision,
        changes: JSON.parse(JSON.stringify(changes)) as Json,
      })
      .abortSignal(controller.signal);
    if (error) throw error;
    return parseSnapshot(data, userId);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
