import { useCallback, useEffect, useRef, useState } from "react";
import { Data, emptyData, STORAGE_KEY, validateData } from "./model";
import { supabase } from "./utils/supabase";
import { changesConfirmed } from "./utils/confirmed-changes";
import {
  cloudError,
  loadSnapshot,
  saveSnapshot,
  Snapshot,
} from "./utils/repository";

// Read-only access to the original local store. Never auto-upload or erase it.
export function readLegacyData(): {
  data: Data;
  error: string;
  raw: string | null;
} {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    return {
      raw,
      data: raw ? validateData(JSON.parse(raw)) : emptyData(),
      error: "",
    };
  } catch {
    return {
      raw,
      data: emptyData(),
      error:
        "Your local backup could not be read. Download the original file before trying to repair or import it.",
    };
  }
}
export type StudyUpdate = (
  change: (data: Data) => Data,
  recovery?: boolean,
) => Promise<boolean>;
export function useStudyData(userId: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const current = useRef<Snapshot | null>(null),
    busy = useRef(false),
    lifetime = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || busy.current) return;
    try {
      const latest = await loadSnapshot(userId, controller.signal);
      if (controller.signal.aborted) return;
      if (!current.current || latest.revision >= current.current.revision) {
        current.current = latest;
        setSnapshot(latest);
      }
      setError("");
    } catch (e) {
      if (!controller.signal.aborted) setError(cloudError(e));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    current.current = null;
    setSnapshot(null);
    setLoading(true);
    setError("");
    void refresh();
    const onFocus = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    const poll = setInterval(onFocus, 15000);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const channel = supabase
      ?.channel(`cadence:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      controller.abort();
      current.current = null;
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [userId, refresh]);
  const update: StudyUpdate = async (change) => {
    const previous = current.current,
      controller = lifetime.current;
    if (!previous || !controller || controller.signal.aborted) {
      setError("Your account data is still loading. Retry once it has loaded.");
      return false;
    }
    if (busy.current) {
      setError("A save is in progress. Wait for it to finish, then retry.");
      return false;
    }
    busy.current = true;
    setSaving(true);
    setError("");
    let next: Data | null = null;
    try {
      next = change(previous.data);
      const saved = await saveSnapshot(
        userId,
        previous,
        next,
        controller.signal,
      );
      if (controller.signal.aborted) return false;
      current.current = saved;
      setSnapshot(saved);
      return true;
    } catch (e) {
      if (controller.signal.aborted) return false;
      // Reload after uncertain network errors too: the server may have committed.
      try {
        const latest = await loadSnapshot(userId, controller.signal);
        if (!controller.signal.aborted) {
          current.current = latest;
          setSnapshot(latest);
          if (next && changesConfirmed(previous.data, next, latest.data)) {
            setError("");
            return true;
          }
        }
      } catch {
        /* Keep the previous confirmed state and the form. */
      }
      if (!controller.signal.aborted) setError(cloudError(e));
      return false;
    } finally {
      busy.current = false;
      if (!controller.signal.aborted) setSaving(false);
    }
  };
  return {
    data: snapshot?.data || emptyData(),
    profile: snapshot?.profile || null,
    topicImportReady: snapshot?.topicImportReady === true,
    update,
    error,
    loading,
    saving,
    readBlocked: !snapshot,
    refresh,
  };
}
