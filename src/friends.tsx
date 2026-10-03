import { useCallback, useEffect, useMemo, useState } from "react";
import { Flame, UserPlus, Check, X, Clock, UserMinus } from "@phosphor-icons/react";
import { Card, Empty } from "./components";
import { shiftDay } from "./model";
import {
  FriendAction,
  Member,
  loadSocial,
  friendAction,
} from "./utils/repository";

const COLORS = ["#ec4899", "#5b73f0", "#f5a524", "#34d399", "#a78bfa", "#38bdf8"];
const colorFor = (id: string) =>
  COLORS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];
const nameOf = (m: Member) =>
  m.relation === "self" ? "You" : m.displayName.trim() || "Ashvi learner";
const initial = (m: Member) =>
  (m.displayName.trim() || (m.relation === "self" ? "Y" : "A"))[0].toUpperCase();
function isoWeek(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  const n = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - n);
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - jan1) / 86400000 + 1) / 7);
}
function friendsError(e: unknown) {
  const x = e as { code?: string; message?: string };
  if (x?.code === "PGRST202" || x?.code === "42883")
    return "Friends isn’t set up yet. Run supabase/migrations/202610030002_friends.sql in the Supabase SQL Editor, then reload.";
  if (x?.code === "42501" || x?.code === "PGRST301")
    return "Your session has expired. Sign in again to continue.";
  return x?.message || "Could not load friends. Check your connection and retry.";
}
function Avatar({ m }: { m: Member }) {
  return (
    <span className="friend-avatar" style={{ background: colorFor(m.id) }}>
      {initial(m)}
      {m.studyingNow && <i aria-label="Studying now" />}
    </span>
  );
}

export function FriendsPage({ today }: { today: string }) {
  const [members, setMembers] = useState<Member[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState<string | null>(null),
    [query, setQuery] = useState("");
  // Monday of the current week.
  const weekStart = useMemo(() => {
    const dow = (new Date(`${today}T12:00:00`).getDay() + 6) % 7;
    return shiftDay(today, -dow);
  }, [today]);
  const refresh = useCallback(async () => {
    try {
      setMembers(await loadSocial(today, weekStart));
      setError("");
    } catch (e) {
      setError(friendsError(e));
    }
  }, [today, weekStart]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  const act = async (m: Member, action: FriendAction) => {
    setBusy(m.id);
    try {
      await friendAction(m.id, action);
      await refresh();
    } catch (e) {
      setError(friendsError(e));
    } finally {
      setBusy(null);
    }
  };
  const board = (members || []).filter(
      (m) => m.relation === "self" || m.relation === "friend",
    ),
    ranked = [...board].sort((a, b) => (b.weekHours ?? 0) - (a.weekHours ?? 0)),
    studying = ranked.filter((m) => m.relation === "friend" && m.studyingNow),
    q = query.trim().toLowerCase(),
    others = (members || [])
      .filter((m) => m.relation !== "self")
      .filter((m) => !q || nameOf(m).toLowerCase().includes(q))
      .sort((a, b) => {
        const order = { incoming: 0, friend: 1, requested: 2, none: 3, self: 4 };
        return (
          order[a.relation] - order[b.relation] ||
          nameOf(a).localeCompare(nameOf(b))
        );
      });
  return (
    <div className="friends-grid">
      <Card className="friends-board">
        <span className="eyebrow friends-week">WEEK {String(isoWeek(today)).padStart(2, "0")}</span>
        <h2>Your friends keep you honest</h2>
        <p>Tracked hours on a shared board. Presence beats promises.</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {members && (
          <div className="friend-rows">
            {ranked.map((m, i) => (
              <div
                key={m.id}
                className={`friend-row inset ${m.relation === "self" ? "me" : ""}`}
              >
                <span className="friend-rank">{i + 1}</span>
                <Avatar m={m} />
                <strong className="friend-name">{nameOf(m)}</strong>
                <span className="friend-streak" title="Current streak (days)">
                  <Flame size={16} />
                  {m.streak ?? 0}
                </span>
                <span className="friend-hours">{(m.weekHours ?? 0).toFixed(1)}h</span>
              </div>
            ))}
          </div>
        )}
        {studying.length > 0 && (
          <p className="friend-live">
            {studying.map(nameOf).join(", ")}{" "}
            {studying.length === 1 ? "is" : "are"} studying right now.
          </p>
        )}
        {members && board.length === 1 && !error && (
          <p className="friend-hint">
            Add a friend from the list to see their streak and hours here.
          </p>
        )}
      </Card>
      <Card className="friends-people">
        <div className="card-heading">
          <h2>People on Ashvi</h2>
          <span>{others.length}</span>
        </div>
        <label className="sr-only" htmlFor="people-search">
          Search people
        </label>
        <input
          id="people-search"
          type="search"
          placeholder="Search by name"
          value={query}
          maxLength={100}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!members && !error && <p className="friend-hint">Loading people…</p>}
        {members && !others.length && (
          <Empty
            title={q ? "No matches" : "No one else yet"}
            description={
              q
                ? "Try a different name."
                : "When others join Ashvi they will appear here."
            }
          />
        )}
        <div className="people-list">
          {others.map((m) => (
            <div key={m.id} className="people-row inset">
              <Avatar m={m} />
              <div className="row-copy">
                <strong>{nameOf(m)}</strong>
                {m.relation === "friend" && (
                  <p>
                    <Flame size={13} /> {m.streak ?? 0}-day streak
                  </p>
                )}
                {m.relation === "incoming" && <p>Wants to be your friend</p>}
              </div>
              {m.relation === "none" && (
                <button
                  className="secondary small-action"
                  disabled={busy === m.id}
                  onClick={() => void act(m, "request")}
                >
                  <UserPlus size={16} />
                  Add friend
                </button>
              )}
              {m.relation === "requested" && (
                <button
                  className="secondary small-action"
                  disabled={busy === m.id}
                  aria-label={`Cancel request to ${nameOf(m)}`}
                  onClick={() => void act(m, "cancel")}
                >
                  <Clock size={16} />
                  Requested
                </button>
              )}
              {m.relation === "incoming" && (
                <>
                  <button
                    className="primary small-action"
                    disabled={busy === m.id}
                    onClick={() => void act(m, "accept")}
                  >
                    <Check size={16} />
                    Accept
                  </button>
                  <button
                    className="icon-button subtle"
                    disabled={busy === m.id}
                    aria-label={`Decline ${nameOf(m)}`}
                    onClick={() => void act(m, "decline")}
                  >
                    <X size={16} />
                  </button>
                </>
              )}
              {m.relation === "friend" && (
                <button
                  className="icon-button subtle"
                  disabled={busy === m.id}
                  aria-label={`Remove ${nameOf(m)} from friends`}
                  onClick={() => void act(m, "remove")}
                >
                  <UserMinus size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
