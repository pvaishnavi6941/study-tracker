import { useEffect, useState, FormEvent, ReactNode } from "react";
import {
  SquaresFour,
  Stack,
  PlusSquare,
  Flame,
  UsersThree,
  ChartBar,
  GearSix,
  Plus,
  Minus,
  Play,
  Pause,
  Check,
  PencilSimple,
  Trash,
  DownloadSimple,
  UploadSimple,
  ArrowRight,
  Timer as TimerIcon,
} from "@phosphor-icons/react";
import {
  Data,
  Skill,
  Session,
  Plan,
  COLORS,
  uid,
  dayKey,
  shiftDay,
  minutesLabel,
  hoursLabel,
  sumMinutes,
  isTopicComplete,
  incompleteTopics,
  skillStats,
  isVideoSkill,
  videoProgress,
  streakStats,
  chartBuckets,
  progressHistory,
  timerSeconds,
  emptyData,
  validateData,
} from "./model";
import { useStudyData, readLegacyData } from "./store";
import { useAuth } from "./auth/AuthProvider";
import { AccountPanel } from "./auth/AccountPanel";
import { prepareImport } from "./utils/import-data";
import { TopicImport, TemplateHelp } from "./TopicImport";
import { TopicFocus } from "./TopicFocus";
import {
  Card,
  Empty,
  Progress,
  Ring,
  Modal,
  HoursChart,
  LearningChart,
} from "./components";
import {
  Setup,
  SkillForm,
  TopicManager,
  PlanForm,
  Confirm,
  FinishSession,
  VideoPositionForm,
  formatSeconds,
} from "./forms";
import { SessionRow, History, Heatmap } from "./history";
import { FriendsPage } from "./friends";
type Page =
  | "Today"
  | "Skills"
  | "Log"
  | "Streak"
  | "Friends"
  | "Analytics"
  | "Settings";
type Dialog =
  | { kind: "topic-import"; skillId?: string }
  | {
      kind: "setup";
    }
  | {
      kind: "skill";
      skill?: Skill;
    }
  | {
      kind: "topics";
      skill: Skill;
    }
  | {
      kind: "plan";
    }
  | {
      kind: "confirm";
      title: string;
      description: string;
      action: () => boolean | Promise<boolean>;
      strong?: boolean;
    }
  | {
      kind: "video";
      skill: Skill;
    }
  | {
      kind: "finish";
    };
type SessionDraft = {
  id?: string;
  skillId: string;
  topicId: string;
  topic: string;
  minutes: number;
  date: string;
  time: string;
  notes: string;
  completed: boolean;
};
const nav = [
  {
    name: "Today",
    icon: SquaresFour,
  },
  {
    name: "Skills",
    icon: Stack,
  },
  {
    name: "Log",
    icon: PlusSquare,
  },
  {
    name: "Streak",
    icon: Flame,
  },
  {
    name: "Friends",
    icon: UsersThree,
  },
  {
    name: "Analytics",
    icon: ChartBar,
  },
] as const;
const newDraft = (skillId = ""): SessionDraft => ({
  skillId,
  topicId: "",
  topic: "",
  minutes: 45,
  date: dayKey(),
  time: new Date().toTimeString().slice(0, 5),
  notes: "",
  completed: false,
});
function download(content: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([content], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function App({ userId }: { userId: string }) {
  const {
    data,
    profile,
    update,
    error,
    readBlocked,
    loading,
    saving,
    refresh,
    topicImportReady,
  } = useStudyData(userId);
  const auth = useAuth();
  const [legacy] = useState(readLegacyData);
  const initialPage = (): Page => {
    const p = window.location.hash.slice(1);
    return [
      "Today",
      "Skills",
      "Log",
      "Streak",
      "Friends",
      "Analytics",
      "Settings",
    ].includes(p)
      ? (p as Page)
      : "Today";
  };
  const [page, setPage] = useState<Page>(initialPage),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [draft, setDraft] = useState<SessionDraft>(() => newDraft()),
    [mode, setMode] = useState<"Daily" | "Weekly" | "Monthly">("Daily"),
    [historyMode, setHistoryMode] = useState<"Daily" | "Weekly">("Daily"),
    [now, setNow] = useState(Date.now()),
    [toast, setToast] = useState(""),
    [formError, setFormError] = useState("");
  const today = dayKey(new Date(now)),
    stats = streakStats(data, today);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), data.timer ? 1000 : 30000);
    return () => clearInterval(id);
  }, [!!data.timer]);
  useEffect(() => {
    const handle = () => setPage(initialPage());
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);
  useEffect(() => {
    if (!data.preferences.onboardingDone && !readBlocked)
      setDialog({
        kind: "setup",
      });
  }, [data.preferences.onboardingDone, readBlocked]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(id);
    }
  }, [toast]);
  useEffect(() => {
    if (!data.timer) return;
    const handle = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handle);
    return () => window.removeEventListener("beforeunload", handle);
  }, [data.timer]);
  const go = (next: Page) => {
    window.location.hash = next;
    setPage(next);
    setFormError("");
  };
  const notify = (message: string) => setToast(message);
  const ask = (
    title: string,
    description: string,
    action: () => boolean | Promise<boolean>,
    strong = false,
  ) =>
    setDialog({
      kind: "confirm",
      title,
      description,
      action,
      strong,
    });
  const logSkill = (skillId: string) => {
    setDraft(newDraft(skillId));
    go("Log");
  };
  const planStudy = () => {
    if (data.topics.length)
      setDialog({
        kind: "plan",
      });
    else if (data.skills.length) go("Skills");
    else
      setDialog({
        kind: "skill",
      });
  };
  const todaySessions = data.sessions.filter((s) => s.date === today),
    studied = sumMinutes(todaySessions),
    target = data.preferences.dailyTarget,
    remaining = Math.max(0, target - studied);
  const topicsDone = data.topics.filter((t) => isTopicComplete(data, t)).length,
    overall = data.topics.length
      ? Math.round((topicsDone / data.topics.length) * 100)
      : 0,
    totalMinutes = sumMinutes(data.sessions),
    totalHoursTarget = data.skills.reduce((sum, s) => sum + s.targetHours, 0);
  const todaysPlans = data.plans.filter((p) => p.date === today),
    pendingPlans = todaysPlans.filter(
      (p) =>
        !p.sessionId &&
        !isTopicComplete(data, data.topics.find((t) => t.id === p.topicId)!),
    ),
    plannedMinutes = pendingPlans.reduce((sum, p) => sum + p.minutes, 0);
  const focusTopics = incompleteTopics(data).slice(0, 3);
  const weekStart = shiftDay(today, -new Date(`${today}T12:00:00`).getDay());
  const weekPoints = Array.from(
    {
      length: 7,
    },
    (_, i) => {
      const date = shiftDay(weekStart, i);
      return {
        date,
        label:
          date === today
            ? "Today"
            : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
                weekday: "short",
              }),
        hours: sumMinutes(data.sessions.filter((s) => s.date === date)) / 60,
      };
    },
  );
  const weekMinutes = weekPoints.reduce((sum, p) => sum + p.hours * 60, 0);
  const start = async (
    skillId: string,
    topicId: string | null,
    topic: string,
    planId: string | null = null,
  ) => {
    if (data.timer) {
      notify(
        "A session is already active. Finish or cancel it before starting another.",
      );
      return;
    }
    if (!skillId || !topic.trim()) {
      setFormError("Choose a skill and enter a topic before starting.");
      return;
    }
    if (
      await update((d) => ({
        ...d,
        timer: {
          skillId,
          topicId,
          topic: topic.trim(),
          planId,
          elapsed: 0,
          startedAt: Date.now(),
          date: dayKey(),
          time: new Date().toTimeString().slice(0, 5),
        },
      }))
    )
      notify("Session started. You can navigate while the timer runs.");
  };
  const startPlan = (plan: Plan) => {
    const topic = data.topics.find((t) => t.id === plan.topicId);
    if (topic) start(topic.skillId, topic.id, topic.name, plan.id);
  };
  const saveDraft = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (
      !data.skills.some((s) => s.id === draft.skillId) ||
      !draft.topic.trim() ||
      draft.topic.trim().length > 200 ||
      !Number.isFinite(draft.minutes) ||
      draft.minutes <= 0 ||
      draft.minutes > 1440 ||
      draft.date > today
    ) {
      setFormError(
        "Choose a skill, enter a topic, and use a duration greater than zero and at most 1,440 minutes with a date no later than today.",
      );
      return;
    }
    const session: Session = {
      id: draft.id || uid(),
      skillId: draft.skillId,
      topicId: draft.topicId || null,
      topic: draft.topic.trim(),
      minutes: draft.minutes,
      date: draft.date,
      time: draft.time,
      notes: draft.notes,
      completed: draft.completed,
      createdAt:
        data.sessions.find((s) => s.id === draft.id)?.createdAt ||
        new Date().toISOString(),
    };
    const saved = await update((d) => {
      let topics = d.topics;
      if (!session.topicId) {
        const existing = topics.find(
          (t) =>
            t.skillId === session.skillId &&
            t.name.toLowerCase() === session.topic.toLowerCase(),
        );
        session.topicId = existing?.id || uid();
        if (!existing)
          topics = [
            ...topics,
            {
              id: session.topicId,
              skillId: session.skillId,
              name: session.topic,
              createdAt: new Date(
                `${session.date}T${session.time}:00`,
              ).toISOString(),
              completedAt: null,
            },
          ];
      }
      const matchingPlan = d.plans.find(
        (p) =>
          !p.sessionId &&
          p.topicId === session.topicId &&
          p.date === session.date,
      );
      return {
        ...d,
        topics,
        sessions: draft.id
          ? d.sessions.map((s) => (s.id === draft.id ? session : s))
          : [...d.sessions, session],
        plans: d.plans.map((p) =>
          p.sessionId === session.id &&
          (p.topicId !== session.topicId || p.date !== session.date)
            ? {
                ...p,
                sessionId: null,
              }
            : p.id === matchingPlan?.id
              ? {
                  ...p,
                  sessionId: session.id,
                }
              : p,
        ),
      };
    });
    if (saved) {
      setDraft(newDraft(draft.skillId));
      notify(
        draft.id
          ? "Session updated. All totals recalculated."
          : "Study session saved. Nice work.",
      );
    }
  };
  const deleteSession = (s: Session) =>
    ask(
      "Delete this session?",
      `Remove “${s.topic}” and ${minutesLabel(s.minutes)} from your study history? All statistics will recalculate.`,
      async () =>
        await update((d) => ({
          ...d,
          sessions: d.sessions.filter((x) => x.id !== s.id),
          plans: d.plans.map((p) =>
            p.sessionId === s.id
              ? {
                  ...p,
                  sessionId: null,
                }
              : p,
          ),
        })),
    );
  const completePlan = (p: Plan) =>
    ask(
      "Log this focus block?",
      `Record ${minutesLabel(p.minutes)} and complete this topic. Use Start if you would prefer to time your actual study.`,
      async () => {
        const t = data.topics.find((t) => t.id === p.topicId);
        if (!t) return false;
        const s: Session = {
          id: uid(),
          skillId: t.skillId,
          topicId: t.id,
          topic: t.name,
          minutes: p.minutes,
          date: today,
          time: new Date().toTimeString().slice(0, 5),
          notes: "",
          completed: true,
          createdAt: new Date().toISOString(),
        };
        return await update((d) => ({
          ...d,
          sessions: [...d.sessions, s],
          plans: d.plans.map((x) =>
            x.id === p.id
              ? {
                  ...x,
                  sessionId: s.id,
                }
              : x,
          ),
        }));
      },
    );
  const importFile = async (file: File) => {
    try {
      if (file.size > 25 * 1024 * 1024)
        throw new Error(
          "The backup is too large. Choose a file smaller than 25 MB.",
        );
      const imported = prepareImport(JSON.parse(await file.text()));
      ask(
        "Restore this backup?",
        `This replaces your current data with ${imported.skills.length} skills, ${imported.topics.length} topics, and ${imported.sessions.length} sessions. Export a backup first if you want to keep your current data.`,
        async () => {
          const ok = await update(() => imported, true);
          if (ok) notify("Backup restored.");
          return ok;
        },
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not read this backup.");
    }
  };
  const heading: Record<
    Page,
    {
      title: string;
      description: string;
    }
  > = {
    Today: {
      title:
        new Date(now).getHours() < 12
          ? "Good morning"
          : new Date(now).getHours() < 18
            ? "Good afternoon"
            : "Good evening",
      description: "Here is what to study today.",
    },
    Skills: {
      title: "Skills",
      description: `${data.skills.length} skills · ${overall}% overall · ${hoursLabel(totalMinutes)} invested`,
    },
    Log: {
      title: "Daily study",
      description:
        "Log what you studied. Even ten minutes keeps the streak alive.",
    },
    Streak: {
      title: "Streak & calendar",
      description: stats.totals.has(today)
        ? "Today counts. Keep it going tomorrow."
        : "A little progress today goes a long way.",
    },
    Friends: {
      title: "Friends",
      description: "Study alongside people on Ashvi and keep each other going.",
    },
    Analytics: {
      title: "Analytics",
      description: "How your hours, skills and consistency add up.",
    },
    Settings: {
      title: "Settings",
      description: "Make Ashvi yours. Keep your learning history safe.",
    },
  };
  const emptySessions = (action?: ReactNode) => (
    <Empty
      title="No study sessions yet"
      description="Your learning journey starts here. Log a session to see your progress."
      action={action}
    />
  );
  if (loading)
    return (
      <div className="auth-shell">
        <Card className="auth-card account-loading">
          <img src="/assets/ashvi.png" alt="" />
          <h2>Loading your study space</h2>
          <p role="status">Fetching your account’s progress from Supabase…</p>
          <span className="loading-line" />
        </Card>
      </div>
    );
  if (readBlocked)
    return (
      <div className="auth-shell">
        <Card className="auth-card">
          <h2>Your study space could not load</h2>
          <p className="form-error" role="alert">
            {error}
          </p>
          <button className="primary full" onClick={() => void refresh()}>
            Retry
          </button>
          <button
            className="secondary full"
            onClick={() => void auth.signOut()}
          >
            Sign out
          </button>
        </Card>
      </div>
    );
  return (
    <div className="app-shell">
      <fieldset className="app-fieldset" disabled={saving}>
        <header className="brand-row">
          <a className="brand" href="#Today" onClick={() => go("Today")}>
            <img src="/assets/ashvi.png" alt="" />
            <div>
              <strong>Ashvi</strong>
              <span>
                {new Date(now).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          </a>
          <div className="header-actions">
            <button className="streak-pill" onClick={() => go("Streak")}>
              <Flame size={18} color="#ffbe6a" />
              {stats.current}-day streak
            </button>
            <button
              className={`icon-button settings-button ${page === "Settings" ? "selected" : ""}`}
              aria-label="Settings"
              onClick={() => go("Settings")}
            >
              <GearSix size={22} />
            </button>
          </div>
        </header>
        <nav className="pill-nav" aria-label="Main navigation">
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={page === name ? "active" : ""}
              aria-current={page === name ? "page" : undefined}
              onClick={() => go(name)}
            >
              <Icon size={20} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        <main>
          <div className="page-heading">
            <div>
              <h1>{heading[page].title}</h1>
              <p>{heading[page].description}</p>
            </div>
            {page === "Skills" && (
              <button
                className="primary small"
                onClick={() =>
                  setDialog({
                    kind: "skill",
                  })
                }
              >
                <Plus size={18} />
                Add skill
              </button>
            )}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button className="text-button" onClick={() => go("Settings")}>
                Open Settings
              </button>
            </div>
          )}
          {page === "Today" && (
            <>
              <Card className="hero-card">
                <div className="hero-summary">
                  <span className="eyebrow">LEFT TO STUDY TODAY</span>
                  <div className="hero-number">{minutesLabel(remaining)}</div>
                  <p>
                    {pendingPlans.length
                      ? `You have ${pendingPlans.length} focus ${pendingPlans.length === 1 ? "block" : "blocks"} lined up, ${minutesLabel(plannedMinutes)} in total.`
                      : "Make a little room for something worth learning."}
                  </p>
                  <Progress value={(studied / target) * 100} />
                  <div className="progress-caption">
                    <span>
                      {Math.round((studied / target) * 100)}% of today’s target
                    </span>
                    <span>Target {minutesLabel(target)}</span>
                  </div>
                  <div className="mini-stats">
                    <div className="inset">
                      <span className="eyebrow">TARGET</span>
                      <div className="target-controls">
                        <button
                          className="icon-button"
                          aria-label="Decrease daily target by 15 minutes"
                          disabled={target <= 15}
                          onClick={async () =>
                            await update((d) => ({
                              ...d,
                              preferences: {
                                ...d.preferences,
                                dailyTarget: Math.max(15, target - 15),
                              },
                            }))
                          }
                        >
                          <Minus size={17} />
                        </button>
                        <strong>{minutesLabel(target)}</strong>
                        <button
                          className="icon-button"
                          aria-label="Increase daily target by 15 minutes"
                          disabled={target >= 1440}
                          onClick={async () =>
                            await update((d) => ({
                              ...d,
                              preferences: {
                                ...d.preferences,
                                dailyTarget: Math.min(1440, target + 15),
                              },
                            }))
                          }
                        >
                          <Plus size={17} />
                        </button>
                      </div>
                    </div>
                    <div className="inset">
                      <span className="eyebrow">STUDIED</span>
                      <strong>{minutesLabel(studied)}</strong>
                    </div>
                    <div className="inset">
                      <span className="eyebrow">REMAINING</span>
                      <strong>{minutesLabel(remaining)}</strong>
                    </div>
                  </div>
                </div>
                <div className="up-next inset">
                  <span className="eyebrow">UP NEXT</span>
                  {focusTopics[0] ? (
                    (() => {
                      const topic = focusTopics[0],
                        skill = data.skills.find(
                          (s) => s.id === topic.skillId,
                        )!;
                      return (
                        <>
                          <div className="skill-line">
                            <span
                              className="dot"
                              style={{ background: skill.color }}
                            />
                            {skill.name}
                            <span className="badge">
                              {topic.priority || "Medium"}
                            </span>
                          </div>
                          <h2>{topic.name}</h2>
                          <p>
                            Study at your own pace. Save the time you actually
                            spend.
                          </p>
                          <button
                            className="primary"
                            onClick={() =>
                              start(topic.skillId, topic.id, topic.name)
                            }
                          >
                            <Play weight="fill" size={17} />
                            Start session
                          </button>
                          <p className="next-hint">
                            {focusTopics[1]
                              ? "Then " + focusTopics[1].name
                              : "One topic, one step forward."}
                          </p>
                        </>
                      );
                    })()
                  ) : (
                    <Empty
                      title={
                        data.topics.length
                          ? "All topics complete"
                          : "A fresh start awaits"
                      }
                      description="Add or import topics to choose your next step."
                      action={
                        <button
                          className="primary"
                          onClick={() => {
                            go("Skills");
                            setDialog({ kind: "topic-import" });
                          }}
                        >
                          Import Topics
                        </button>
                      }
                    />
                  )}
                </div>
              </Card>
              <div className="dashboard-grid">
                <Card>
                  <div className="card-heading">
                    <h2>Today’s Focus</h2>
                    <span>{focusTopics.length} topics ready</span>
                  </div>
                  <TopicFocus
                    data={data}
                    topics={focusTopics}
                    onStart={(topic) => {
                      void start(topic.skillId, topic.id, topic.name);
                    }}
                    onLog={(topic) => {
                      setDraft({
                        ...newDraft(topic.skillId),
                        topicId: topic.id,
                        topic: topic.name,
                        completed: false,
                      });
                      go("Log");
                    }}
                    onPlan={planStudy}
                  />
                  {pendingPlans.length ? (
                    <div className="focus-list">
                      {pendingPlans.map((p, i) => {
                        const t = data.topics.find((t) => t.id === p.topicId)!;
                        const s = data.skills.find((s) => s.id === t.skillId)!;
                        return (
                          <div
                            key={p.id}
                            className={`focus-row inset ${p.sessionId ? "done" : ""}`}
                          >
                            <span
                              className="focus-index"
                              style={{
                                borderColor: s.color,
                              }}
                            >
                              {p.sessionId ? <Check /> : i + 1}
                            </span>
                            <div className="row-copy">
                              <strong>{t.name}</strong>
                              <p>
                                {s.name} ·{" "}
                                {p.sessionId
                                  ? "Session logged"
                                  : `last studied ${skillStats(data, s, today).lastLabel.toLowerCase()}`}
                              </p>
                            </div>
                            <span className="badge">
                              {minutesLabel(p.minutes)}
                            </span>
                            {!p.sessionId && (
                              <>
                                <button
                                  className="icon-button"
                                  aria-label={`Complete ${t.name}`}
                                  onClick={() => completePlan(p)}
                                >
                                  <Check size={18} />
                                </button>
                                <button
                                  className="play-button"
                                  aria-label={`Start ${t.name}`}
                                  onClick={() => startPlan(p)}
                                >
                                  <Play weight="fill" size={17} />
                                </button>
                                <button
                                  className="icon-button subtle"
                                  aria-label={`Remove plan ${t.name}`}
                                  onClick={() =>
                                    ask(
                                      "Remove this plan?",
                                      "This removes the planned focus block. Your topic and study history will be kept.",
                                      async () =>
                                        await update((d) => ({
                                          ...d,
                                          plans: d.plans.filter(
                                            (x) => x.id !== p.id,
                                          ),
                                        })),
                                    )
                                  }
                                >
                                  <Trash size={17} />
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                      <button
                        className="secondary full"
                        onClick={() =>
                          setDialog({
                            kind: "plan",
                          })
                        }
                      >
                        <Plus size={16} />
                        Plan another focus block
                      </button>
                    </div>
                  ) : null}
                </Card>
                <Card className="dashboard-streak">
                  <span className="eyebrow">CURRENT STREAK</span>
                  <div className="stat-number">
                    {stats.current}
                    <small>days</small>
                  </div>
                  <p>
                    {stats.totals.has(today)
                      ? "Today counts. Keep it going tomorrow."
                      : "Start a session to make today count."}
                  </p>
                  <div className="week-dots">
                    {Array.from(
                      {
                        length: 7,
                      },
                      (_, i) => {
                        const date = shiftDay(today, -6 + i);
                        return (
                          <div key={date}>
                            <span
                              className={
                                stats.totals.has(date) ? "studied" : ""
                              }
                              title={`${date}: ${minutesLabel(stats.totals.get(date) || 0)}`}
                            >
                              {stats.totals.has(date) && <Check size={16} />}
                            </span>
                            <small>
                              {i === 6
                                ? "Today"
                                : new Date(
                                    `${date}T12:00:00`,
                                  ).toLocaleDateString(undefined, {
                                    weekday: "short",
                                  })}
                            </small>
                          </div>
                        );
                      },
                    )}
                  </div>
                  <div className="card-footer">
                    <span>
                      Longest <strong>{stats.longest} days</strong>
                    </span>
                    <button className="secondary" onClick={() => go("Streak")}>
                      View calendar
                    </button>
                  </div>
                </Card>
                <Card>
                  <div className="card-heading">
                    <h2>This week</h2>
                    <span>
                      <strong>{hoursLabel(weekMinutes)}</strong> of{" "}
                      {hoursLabel(target * 7)} goal
                    </span>
                  </div>
                  {data.sessions.length ? (
                    <HoursChart points={weekPoints} target={target / 60} />
                  ) : (
                    emptySessions(
                      <button className="text-button" onClick={() => go("Log")}>
                        Start your first session
                        <ArrowRight size={16} />
                      </button>,
                    )
                  )}
                  <p className="footnote">Dashed line is your daily target.</p>
                </Card>
                <Card className="overall-card">
                  <h2>Overall learning</h2>
                  <div className="overall-content">
                    <Ring value={overall} />
                    <div>
                      <strong>{hoursLabel(totalMinutes)}</strong>
                      <p>of {totalHoursTarget}h planned</p>
                      <strong>
                        {topicsDone}/{data.topics.length}
                      </strong>
                      <p>topics covered</p>
                    </div>
                  </div>
                  <button
                    className="secondary full"
                    onClick={() => go("Skills")}
                  >
                    See all skills
                  </button>
                </Card>
                {todaySessions.length > 0 && (
                  <Card className="wide">
                    <div className="card-heading">
                      <h2>Studied today</h2>
                      <span>
                        {todaySessions.length} sessions ·{" "}
                        {minutesLabel(studied)}
                      </span>
                    </div>
                    {todaySessions.map((s) => (
                      <SessionRow
                        key={s.id}
                        session={s}
                        data={data}
                        onEdit={() => {
                          setDraft({
                            ...s,
                            topicId: s.topicId || "",
                          });
                          go("Log");
                        }}
                        onDelete={() => deleteSession(s)}
                      />
                    ))}
                  </Card>
                )}
              </div>
            </>
          )}
          {page === "Skills" && (
            <>
              <Card className="topic-import-tools">
                <div className="card-heading">
                  <h2>Build your topic list</h2>
                  <button
                    className="primary small"
                    onClick={() => setDialog({ kind: "topic-import" })}
                  >
                    <UploadSimple size={17} />
                    Import Topics
                  </button>
                </div>
                <TemplateHelp />
              </Card>
              {data.skills.length ? (
                <div className="skills-grid">
                  {data.skills.map((skill) => {
                    const s = skillStats(data, skill, today);
                    return (
                      <Card key={skill.id} className="skill-card">
                        <div className="card-heading">
                          <h2>
                            <span
                              className="dot glow"
                              style={{
                                background: skill.color,
                              }}
                            />
                            {skill.name}
                          </h2>
                          <span
                            className={`status ${s.status === "Needs revisit" ? "revisit" : ""}`}
                          >
                            {s.status}
                          </span>
                        </div>
                        <div className="skill-progress">
                          <strong>{s.progress}%</strong>
                          <span>
                            {isVideoSkill(skill)
                              ? `${minutesLabel(videoProgress(skill).position)} of ${minutesLabel(videoProgress(skill).total)} watched`
                              : `${s.completed} of ${s.topics.length} topics`}
                          </span>
                        </div>
                        <Progress value={s.progress} color={skill.color} />
                        <div className="skill-details">
                          <div>
                            <span>Invested</span>
                            <strong>
                              {hoursLabel(s.minutes)} of {skill.targetHours}h
                            </strong>
                          </div>
                          <div>
                            <span>Last studied</span>
                            <strong>{s.lastLabel}</strong>
                          </div>
                        </div>
                        <button
                          className="secondary full"
                          onClick={() => logSkill(skill.id)}
                        >
                          Log a session
                        </button>
                        {isVideoSkill(skill) && (
                          <button
                            className="secondary full"
                            onClick={() => setDialog({ kind: "video", skill })}
                          >
                            Update video progress
                          </button>
                        )}
                        <div className="skill-tools">
                          <button
                            className="text-button"
                            onClick={() =>
                              setDialog({
                                kind: "topics",
                                skill,
                              })
                            }
                          >
                            Manage topics ({s.topics.length})
                          </button>
                          <button
                            className="icon-button subtle"
                            aria-label={`Edit ${skill.name}`}
                            onClick={() =>
                              setDialog({
                                kind: "skill",
                                skill,
                              })
                            }
                          >
                            <PencilSimple size={17} />
                          </button>
                          <button
                            className="icon-button subtle"
                            aria-label={`Delete ${skill.name}`}
                            onClick={() =>
                              ask(
                                `Delete ${skill.name}?`,
                                "This deletes the skill, its topics, plans, and all associated sessions. This cannot be undone.",
                                async () => {
                                  if (data.timer?.skillId === skill.id) {
                                    notify(
                                      "Finish or cancel this skill’s active session first.",
                                    );
                                    return false;
                                  }
                                  return await update((d) => {
                                    const ids = new Set(
                                      d.topics
                                        .filter((t) => t.skillId === skill.id)
                                        .map((t) => t.id),
                                    );
                                    return {
                                      ...d,
                                      skills: d.skills.filter(
                                        (s) => s.id !== skill.id,
                                      ),
                                      topics: d.topics.filter(
                                        (t) => t.skillId !== skill.id,
                                      ),
                                      sessions: d.sessions.filter(
                                        (s) => s.skillId !== skill.id,
                                      ),
                                      plans: d.plans.filter(
                                        (p) => !ids.has(p.topicId),
                                      ),
                                    };
                                  });
                                },
                              )
                            }
                          >
                            <Trash size={17} />
                          </button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <Empty
                    title="Your learning journey starts here"
                    description="Add a skill, set a target, and break it into topics. Every step will start at zero."
                    action={
                      <button
                        className="primary small"
                        onClick={() =>
                          setDialog({
                            kind: "skill",
                          })
                        }
                      >
                        <Plus size={18} />
                        Add your first skill
                      </button>
                    }
                  />
                </Card>
              )}
            </>
          )}
          {page === "Log" && (
            <div className="log-grid">
              <Card className="session-form">
                <div className="card-heading">
                  <h2>
                    {draft.id ? "Edit study session" : "Add study session"}
                  </h2>
                  {draft.id && (
                    <button
                      className="text-button"
                      onClick={() => setDraft(newDraft())}
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
                {data.skills.length ? (
                  <form onSubmit={saveDraft}>
                    <label className="field-label">SKILL</label>
                    <div className="skill-chips">
                      {data.skills.map((s) => (
                        <button
                          type="button"
                          key={s.id}
                          className={`chip ${draft.skillId === s.id ? "chosen" : ""}`}
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              skillId: s.id,
                              topicId: "",
                              topic: "",
                            }))
                          }
                        >
                          <span
                            className="dot"
                            style={{
                              background: s.color,
                            }}
                          />
                          {s.name}
                        </button>
                      ))}
                    </div>
                    <label className="field-label" htmlFor="session-topic">
                      TOPIC
                    </label>
                    <input
                      id="session-topic"
                      required
                      maxLength={200}
                      placeholder="What did you work on?"
                      value={draft.topic}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          topic: e.target.value,
                          topicId: "",
                        }))
                      }
                    />
                    <div className="topic-chips">
                      {data.topics
                        .filter((t) => t.skillId === draft.skillId)
                        .map((t) => (
                          <button
                            className={`chip ${draft.topicId === t.id ? "chosen" : ""}`}
                            type="button"
                            key={t.id}
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                topicId: t.id,
                                topic: t.name,
                              }))
                            }
                          >
                            {t.name}
                            {isTopicComplete(data, t) && <Check size={14} />}
                          </button>
                        ))}
                    </div>
                    <label className="field-label" htmlFor="duration">
                      DURATION
                    </label>
                    <div className="duration-presets">
                      {[15, 30, 45, 60, 90].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`chip ${draft.minutes === n ? "chosen" : ""}`}
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              minutes: n,
                            }))
                          }
                        >
                          {n} min
                        </button>
                      ))}
                    </div>
                    <div className="duration-custom">
                      <input
                        id="duration"
                        type="number"
                        min="0.001"
                        max="1440"
                        step="any"
                        required
                        value={draft.minutes || ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            minutes: Number(e.target.value),
                          }))
                        }
                      />
                      <span>min</span>
                    </div>
                    <div className="form-columns">
                      <div>
                        <label className="field-label" htmlFor="session-date">
                          DATE
                        </label>
                        <input
                          type="date"
                          id="session-date"
                          required
                          max={today}
                          value={draft.date}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              date: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="field-label" htmlFor="session-time">
                          TIME
                        </label>
                        <input
                          type="time"
                          id="session-time"
                          required
                          value={draft.time}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              time: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <label className="field-label" htmlFor="session-notes">
                      NOTES
                    </label>
                    <textarea
                      id="session-notes"
                      maxLength={10000}
                      placeholder="What clicked? What needs another look?"
                      value={draft.notes}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          notes: e.target.value,
                        }))
                      }
                    />
                    <label className="switch-row inset">
                      <span>Mark topic complete</span>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={draft.completed}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            completed: e.target.checked,
                          }))
                        }
                      />
                    </label>
                    {formError && (
                      <p className="form-error" role="alert">
                        {formError}
                      </p>
                    )}
                    <button className="primary full" type="submit">
                      {draft.id
                        ? "Save changes"
                        : `Add ${minutesLabel(draft.minutes)}${data.skills.find((s) => s.id === draft.skillId) ? ` of ${data.skills.find((s) => s.id === draft.skillId)?.name}` : ""}`}
                    </button>
                    {!draft.id && (
                      <button
                        className="secondary full timer-start"
                        type="button"
                        disabled={!!data.timer}
                        onClick={() =>
                          start(
                            draft.skillId,
                            draft.topicId || null,
                            draft.topic,
                          )
                        }
                      >
                        <TimerIcon size={18} />
                        Start a timed session
                      </button>
                    )}
                  </form>
                ) : (
                  <Empty
                    title="First, choose what to learn"
                    description="Create a skill to start recording your study sessions."
                    action={
                      <button
                        className="primary small"
                        onClick={() =>
                          setDialog({
                            kind: "skill",
                          })
                        }
                      >
                        Add a skill
                      </button>
                    }
                  />
                )}
              </Card>
              <Card className="history-card">
                <div className="card-heading">
                  <h2>History</h2>
                  <div className="segmented">
                    {(["Daily", "Weekly"] as const).map((m) => (
                      <button
                        key={m}
                        className={historyMode === m ? "active" : ""}
                        onClick={() => setHistoryMode(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                {data.sessions.length ? (
                  <History
                    data={data}
                    today={today}
                    mode={historyMode}
                    onEdit={(s) => {
                      setDraft({
                        ...s,
                        topicId: s.topicId || "",
                      });
                      setFormError("");
                      document.getElementById("session-topic")?.focus();
                      window.scrollTo({
                        top: 0,
                        behavior: "smooth",
                      });
                    }}
                    onDelete={deleteSession}
                  />
                ) : (
                  emptySessions()
                )}
              </Card>
            </div>
          )}
          {page === "Streak" && (
            <>
              <div className="stats-grid">
                <Card>
                  <span className="eyebrow">CURRENT STREAK</span>
                  <div className="stat-number">
                    {stats.current}
                    <small>days</small>
                  </div>
                </Card>
                <Card>
                  <span className="eyebrow">LONGEST STREAK</span>
                  <div className="stat-number">
                    {stats.longest}
                    <small>days</small>
                  </div>
                </Card>
                <Card>
                  <span className="eyebrow">CONSISTENCY, 30 DAYS</span>
                  <div className="stat-number">{stats.consistency(30)}%</div>
                  <p>
                    {stats.days.filter((d) => d >= shiftDay(today, -29)).length}{" "}
                    of the last 30 days
                  </p>
                </Card>
              </div>
              <Card className="heatmap-card">
                <div className="card-heading">
                  <h2>Last 26 weeks</h2>
                  <span>
                    {
                      stats.days.filter((d) => d >= shiftDay(today, -181))
                        .length
                    }{" "}
                    study days in the last 26 weeks
                  </span>
                </div>
                <div className="heatmap-layout">
                  <Heatmap totals={stats.totals} today={today} />
                  <div className="heatmap-stats">
                    <div className="inset">
                      <span className="eyebrow">DAYS STUDIED</span>
                      <strong>
                        {
                          stats.days.filter((d) => d >= shiftDay(today, -181))
                            .length
                        }
                      </strong>
                    </div>
                    <div className="inset">
                      <span className="eyebrow">AVG ON STUDY DAYS</span>
                      <strong>
                        {hoursLabel(
                          stats.days.length
                            ? [...stats.totals.values()].reduce(
                                (sum, minutes) => sum + minutes,
                                0,
                              ) / stats.days.length
                            : 0,
                        )}
                      </strong>
                    </div>
                    <div className="inset">
                      <span className="eyebrow">BEST DAY</span>
                      <strong>{hoursLabel(stats.best)}</strong>
                    </div>
                  </div>
                </div>
                <p className="footnote">
                  A study day has at least one completed session. Pending
                  sessions still count toward study time.
                </p>
              </Card>
              <Card>
                <div className="card-heading">
                  <h2>Milestones</h2>
                  <span>
                    {[3, 7, 14, 30, 60, 100].find((n) => n > stats.current)
                      ? `${[3, 7, 14, 30, 60, 100].find((n) => n > stats.current)! - stats.current} more days to your next mark`
                      : "Every day is another step forward"}
                  </span>
                </div>
                <div className="milestones">
                  {[3, 7, 14, 30, 60, 100].map((n) => (
                    <div
                      key={n}
                      className={`inset milestone ${stats.longest >= n ? "earned" : ""}`}
                    >
                      <div className="milestone-copy">
                        <span className="milestone-number">{n}</span>
                        <div>
                          <strong>{n}-day streak</strong>
                          <p>
                            {stats.longest >= n
                              ? "Earned"
                              : `${stats.current} of ${n} days`}
                          </p>
                        </div>
                      </div>
                      <Progress
                        value={
                          stats.longest >= n ? 100 : (stats.current / n) * 100
                        }
                      />
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
          {page === "Friends" && <FriendsPage today={today} />}
          {page === "Analytics" && (
            <>
              <Card className="analytics-hours">
                <div className="card-heading">
                  <div>
                    <h2>Study hours</h2>
                    <p>
                      {hoursLabel(
                        sumMinutes(
                          data.sessions.filter(
                            (s) =>
                              s.date >= chartBuckets(data, mode, today)[0].date,
                          ),
                        ),
                      )}{" "}
                      over the last{" "}
                      {mode === "Daily"
                        ? "14 days"
                        : mode === "Weekly"
                          ? "12 weeks"
                          : "6 months"}
                    </p>
                  </div>
                  <div className="segmented">
                    {(["Daily", "Weekly", "Monthly"] as const).map((m) => (
                      <button
                        key={m}
                        className={mode === m ? "active" : ""}
                        onClick={() => setMode(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                {data.sessions.length ? (
                  <HoursChart points={chartBuckets(data, mode, today)} />
                ) : (
                  emptySessions(
                    <button className="secondary" onClick={() => go("Log")}>
                      Log your first session
                    </button>,
                  )
                )}
              </Card>
              <div className="analytics-grid">
                <Card className="hours-by-skill">
                  <h2>Hours by skill</h2>
                  {data.skills.length && data.sessions.length ? (
                    <div className="skill-bars">
                      {[...data.skills]
                        .sort(
                          (a, b) =>
                            skillStats(data, b).minutes -
                            skillStats(data, a).minutes,
                        )
                        .map((s) => {
                          const minutes = skillStats(data, s).minutes,
                            max = Math.max(
                              ...data.skills.map(
                                (s) => skillStats(data, s).minutes,
                              ),
                              1,
                            );
                          return (
                            <div key={s.id}>
                              <div className="bar-label">
                                <strong>{s.name}</strong>
                                <span>{hoursLabel(minutes)}</span>
                              </div>
                              <Progress
                                value={(minutes / max) * 100}
                                color={s.color}
                              />
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <Empty
                      title="See where your time goes"
                      description="Hours by skill will appear after your first study session."
                    />
                  )}
                </Card>
                <div className="analytics-right">
                  <Card>
                    <h2>Completed vs pending</h2>
                    <div className="completion-content">
                      <Ring value={overall} />
                      <div>
                        <p>
                          <span
                            className="dot"
                            style={{
                              background: "#60e4cb",
                            }}
                          />
                          <strong>{topicsDone}</strong> topics completed
                        </p>
                        <p>
                          <span
                            className="dot"
                            style={{
                              background: "#687aab",
                            }}
                          />
                          <strong>{data.topics.length - topicsDone}</strong>{" "}
                          topics pending
                        </p>
                      </div>
                    </div>
                    <p className="footnote">
                      {data.topics.length
                        ? "Completion follows your topic checkmarks and completed sessions."
                        : "Add topics to start tracking learning progress."}
                    </p>
                  </Card>
                  <Card>
                    <h2>Consistency</h2>
                    <div className="consistency-grid">
                      {[7, 30, 90].map((n) => (
                        <div key={n} className="inset">
                          <span className="eyebrow">{n} DAYS</span>
                          <strong>{stats.consistency(n)}%</strong>
                        </div>
                      ))}
                    </div>
                    <p className="footnote">
                      Share of days with at least one completed session.
                    </p>
                  </Card>
                </div>
              </div>
              <Card>
                <div className="card-heading">
                  <h2>Learning progress over time</h2>
                  <span>{overall}% of current topics completed</span>
                </div>
                {data.topics.length ? (
                  <LearningChart points={progressHistory(data, today)} />
                ) : (
                  <Empty
                    title="Every topic is a step forward"
                    description="Add topics and complete them to see your learning journey over time."
                  />
                )}
                <p className="footnote">
                  Calculated from the creation and completion dates of your
                  current topics.
                </p>
              </Card>
            </>
          )}
          {page === "Settings" && (
            <div className="settings-grid">
              <Card>
                <AccountPanel
                  profile={profile}
                  onRefresh={refresh}
                  onSignOut={() => void auth.signOut()}
                />
                <h2>Study preferences</h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    const value = Number(form.get("target"));
                    if (
                      value >= 1 &&
                      value <= 1440 &&
                      (await update((d) => ({
                        ...d,
                        preferences: {
                          ...d.preferences,
                          dailyTarget: value,
                        },
                      })))
                    )
                      notify("Daily target updated.");
                  }}
                >
                  <label className="field-label" htmlFor="settings-target">
                    DAILY STUDY TARGET (MINUTES)
                  </label>
                  <input
                    key={target}
                    id="settings-target"
                    name="target"
                    type="number"
                    required
                    min="1"
                    max="1440"
                    defaultValue={target}
                  />
                  <p className="footnote">
                    A daily goal is a direction, not a deadline. Adjust it
                    whenever you need.
                  </p>
                  <button className="primary small">Save preferences</button>
                </form>
                <div className="settings-divider" />
                <h2>Skills & topics</h2>
                <p>Build a curriculum that fits your goals.</p>
                <button className="secondary full" onClick={() => go("Skills")}>
                  Manage skills & topics
                  <ArrowRight size={17} />
                </button>
                <div className="settings-divider" />
                <h2>Streak rules</h2>
                <p>
                  A completed study session counts as a study day. Sessions
                  marked pending still contribute study time. Multiple sessions
                  on one date count as one day. Your current streak includes
                  yesterday until today is over.
                </p>
                <p className="footnote">
                  Calendar dates use your device’s local timezone:{" "}
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                </p>
              </Card>
              <Card>
                <h2>Your data, in your hands</h2>
                <p>
                  Your study data is saved to your Supabase account and syncs
                  across devices. Export a backup whenever you want a personal
                  copy.
                </p>
                <div className="backup-actions">
                  <button
                    className="secondary full"
                    onClick={() => {
                      download(
                        JSON.stringify(data, null, 2),
                        `cadence-backup-${today}.json`,
                      );
                      notify("Backup exported.");
                    }}
                  >
                    <DownloadSimple size={20} />
                    Export data as JSON
                  </button>
                  <label className="secondary full upload-button">
                    <UploadSimple size={20} />
                    Import JSON backup
                    <input
                      type="file"
                      accept=".json,application/json"
                      aria-label="Import JSON backup"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void importFile(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <p className="footnote">
                  Imports are validated before replacing data. A backup includes
                  your skills, topics, sessions, plans, preferences, and active
                  timer.
                </p>
                {legacy.raw && (
                  <>
                    <div className="settings-divider" />
                    <h2>Bring your local history along</h2>
                    <p>
                      Your previous browser data is still here. Download it as a
                      backup or explicitly import it into this account. Import
                      replaces this account’s study data; the local original
                      stays untouched.
                    </p>
                    {legacy.error && (
                      <p className="form-error" role="alert">
                        {legacy.error}
                      </p>
                    )}
                    <button
                      className="secondary full"
                      onClick={() =>
                        download(
                          legacy.raw!,
                          `cadence-original-local-${today}.json`,
                        )
                      }
                    >
                      Download original local backup
                    </button>
                    <button
                      className="secondary full"
                      disabled={!!legacy.error}
                      onClick={() =>
                        ask(
                          "Import local data into this account?",
                          `Replace this account’s study data with ${legacy.data.skills.length} local skills and ${legacy.data.sessions.length} local sessions? Your original browser data will remain untouched.`,
                          () => update(() => prepareImport(legacy.data)),
                        )
                      }
                    >
                      Import local data into my account
                    </button>
                  </>
                )}
                <div className="settings-divider" />
                <h2>Fresh start</h2>
                <p>
                  Delete your study history, or reset Ashvi and start setup
                  again. Export a backup before continuing.
                </p>
                <button
                  className="danger full"
                  onClick={() =>
                    ask(
                      "Delete all study data?",
                      "This permanently deletes all skills, topics, plans, sessions, and the active timer. Your daily target will be kept. Type DELETE to continue.",
                      async () =>
                        await update(
                          () => ({
                            ...emptyData(),
                            preferences: {
                              ...data.preferences,
                              onboardingDone: true,
                            },
                          }),
                          true,
                        ),
                      true,
                    )
                  }
                >
                  Delete all data
                </button>
                <button
                  className="text-button danger-text"
                  onClick={() =>
                    ask(
                      "Reset Ashvi?",
                      "This removes all data and preferences and restarts onboarding. Type DELETE to continue.",
                      async () => await update(() => emptyData(), true),
                      true,
                    )
                  }
                >
                  Reset application
                </button>
              </Card>
            </div>
          )}
        </main>
        <footer className="app-footer">
          A little every day adds up.<span>Ashvi</span>
        </footer>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
        {data.timer && (
          <div
            className="timer-dock"
            role="region"
            aria-label="Active study session"
          >
            <div className="timer-identity">
              <TimerIcon size={24} />
              <div>
                <strong>{data.timer.topic}</strong>
                <span>
                  {data.skills.find((s) => s.id === data.timer?.skillId)?.name}{" "}
                  · {data.timer.startedAt === null ? "Paused" : "Focusing"}
                </span>
              </div>
            </div>
            <strong className="timer-clock">
              {formatSeconds(timerSeconds(data.timer, now))}
            </strong>
            <button
              className="secondary"
              aria-label={
                data.timer.startedAt === null
                  ? "Resume session"
                  : "Pause session"
              }
              onClick={async () =>
                await update((d) => ({
                  ...d,
                  timer: d.timer
                    ? {
                        ...d.timer,
                        elapsed: timerSeconds(d.timer),
                        startedAt:
                          d.timer.startedAt === null ? Date.now() : null,
                      }
                    : null,
                }))
              }
            >
              {data.timer.startedAt === null ? (
                <Play size={18} />
              ) : (
                <Pause size={18} />
              )}
              <span>{data.timer.startedAt === null ? "Resume" : "Pause"}</span>
            </button>
            <button
              className="primary small"
              onClick={() =>
                setDialog({
                  kind: "finish",
                })
              }
            >
              <Check size={18} />
              Finish
            </button>
            <button
              className="icon-button"
              aria-label="Cancel active session"
              onClick={() =>
                ask(
                  "Discard your active session?",
                  "The time recorded by this timer will be lost. Your plans and saved history will be kept.",
                  async () =>
                    await update((d) => ({
                      ...d,
                      timer: null,
                    })),
                )
              }
            >
              <Trash size={20} />
            </button>
          </div>
        )}
        {dialog && (
          <Modal
            title={
              dialog.kind === "topic-import"
                ? "Import topics"
                : dialog.kind === "setup"
                  ? "Find your learning rhythm"
                  : dialog.kind === "skill"
                    ? dialog.skill
                      ? "Edit skill"
                      : "Add a skill"
                    : dialog.kind === "topics"
                      ? dialog.skill.name
                      : dialog.kind === "video"
                        ? "Video progress"
                        : dialog.kind === "plan"
                        ? "Plan your study"
                        : dialog.kind === "finish"
                          ? "Finish your session"
                          : dialog.title
            }
            onClose={async () => {
              if (saving) return;
              if (dialog.kind === "setup") {
                if (
                  await update((d) => ({
                    ...d,
                    preferences: {
                      ...d.preferences,
                      onboardingDone: true,
                    },
                  }))
                )
                  setDialog(null);
              } else setDialog(null);
            }}
          >
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            {saving && (
              <p role="status" className="sync-notice">
                Saving to your account…
              </p>
            )}
            {dialog.kind === "topic-import" && (
              <TopicImport
                data={data}
                initialSkillId={dialog.skillId}
                ready={topicImportReady}
                update={update}
                onCancel={() => setDialog(null)}
                onDone={(skillId, count) => {
                  setDialog(null);
                  go("Skills");
                  notify(
                    count + " topics imported. Your focus queue is ready.",
                  );
                }}
              />
            )}
            {dialog.kind === "setup" && (
              <Setup
                target={target}
                onSave={async (target, names, topics) => {
                  if (topics.length && !names.length) {
                    notify("Choose a skill before adding its topics.");
                    return;
                  }
                  if (
                    names.some((n) => n.length > 100) ||
                    topics.some((t) => t.length > 200)
                  ) {
                    notify(
                      "Skill names must be at most 100 characters and topics at most 200.",
                    );
                    return;
                  }
                  const stamp = new Date().toISOString();
                  const skills = names.map((name, i) => ({
                    id: uid(),
                    name,
                    color: COLORS[i % COLORS.length],
                    targetHours: 0,
                    createdAt: stamp,
                  }));
                  const first = skills[0];
                  if (
                    await update((d) => ({
                      ...d,
                      skills: [...d.skills, ...skills],
                      topics: [
                        ...d.topics,
                        ...(first
                          ? topics.map((name) => ({
                              id: uid(),
                              skillId: first.id,
                              name,
                              createdAt: stamp,
                              completedAt: null,
                            }))
                          : []),
                      ],
                      preferences: {
                        dailyTarget: target,
                        onboardingDone: true,
                      },
                    }))
                  ) {
                    setDialog(null);
                    notify("Your space is ready. Let’s begin.");
                  }
                }}
              />
            )}
            {dialog.kind === "skill" && (
              <SkillForm
                skill={dialog.skill}
                color={COLORS[data.skills.length % COLORS.length]}
                onSave={async (skill, topicNames) => {
                  if (topicNames.some((t) => t.length > 200)) {
                    notify("Topic names must be at most 200 characters.");
                    return;
                  }
                  if (
                    data.skills.some(
                      (s) =>
                        s.id !== skill.id &&
                        s.name.toLowerCase() === skill.name.toLowerCase(),
                    )
                  ) {
                    notify("A skill with that name already exists.");
                    return;
                  }
                  if (
                    await update((d) => ({
                      ...d,
                      skills: dialog.skill
                        ? d.skills.map((s) => (s.id === skill.id ? skill : s))
                        : [...d.skills, skill],
                      topics: [
                        ...d.topics,
                        ...topicNames.map((name) => ({
                          id: uid(),
                          skillId: skill.id,
                          name,
                          createdAt: new Date().toISOString(),
                          completedAt: null,
                        })),
                      ],
                    }))
                  ) {
                    setDialog(
                      topicNames.length
                        ? null
                        : {
                            kind: "topics",
                            skill,
                          },
                    );
                    notify(
                      dialog.skill
                        ? "Skill updated."
                        : "Skill added. Add topics to map your progress.",
                    );
                  }
                }}
              />
            )}
            {dialog.kind === "topics" && (
              <TopicManager
                data={data}
                skill={dialog.skill}
                update={update}
                notify={notify}
                ask={ask}
                onImport={() =>
                  setDialog({ kind: "topic-import", skillId: dialog.skill.id })
                }
                onPlan={() =>
                  setDialog({
                    kind: "plan",
                  })
                }
              />
            )}
            {dialog.kind === "video" && (
              <VideoPositionForm
                skill={dialog.skill}
                onSave={async (position) => {
                  if (
                    await update((d) => ({
                      ...d,
                      skills: d.skills.map((x) =>
                        x.id === dialog.skill.id
                          ? { ...x, videoPosition: position }
                          : x,
                      ),
                    }))
                  ) {
                    setDialog(null);
                    notify("Video progress saved.");
                  }
                }}
              />
            )}
            {dialog.kind === "plan" && (
              <PlanForm
                data={data}
                today={today}
                onAddSkill={() =>
                  setDialog({
                    kind: "skill",
                  })
                }
                onSave={async (topicId, date, minutes) => {
                  if (
                    await update((d) => ({
                      ...d,
                      plans: [
                        ...d.plans,
                        {
                          id: uid(),
                          topicId,
                          date,
                          minutes,
                          sessionId: null,
                        },
                      ],
                    }))
                  ) {
                    setDialog(null);
                    notify("Study block planned.");
                  }
                }}
              />
            )}
            {dialog.kind === "confirm" && (
              <Confirm
                description={dialog.description}
                strong={dialog.strong}
                onCancel={() => setDialog(null)}
                onConfirm={async () => {
                  if (await dialog.action()) {
                    setDialog(null);
                    notify("Done. Your data and statistics are updated.");
                  }
                }}
              />
            )}
            {dialog.kind === "finish" && data.timer && (
              <FinishSession
                seconds={timerSeconds(data.timer, now)}
                topic={data.timer.topic}
                video={(() => {
                  const sk = data.skills.find(
                    (x) => x.id === data.timer!.skillId,
                  );
                  return sk && isVideoSkill(sk) ? sk : undefined;
                })()}
                onSave={async (notes, completed, videoPosition) => {
                  const timer = data.timer!;
                  const seconds = timerSeconds(timer);
                  if (seconds < 1) {
                    notify("Study for at least one second before saving.");
                    return;
                  }
                  if (seconds > 86400) {
                    notify(
                      "This timer has run for more than 24 hours. Cancel it and log the actual study duration manually.",
                    );
                    return;
                  }
                  const s: Session = {
                    id: uid(),
                    skillId: timer.skillId,
                    topicId: timer.topicId,
                    topic: timer.topic,
                    minutes: seconds / 60,
                    date: timer.date,
                    time: timer.time,
                    notes,
                    completed,
                    createdAt: new Date().toISOString(),
                  };
                  if (
                    await update((d) => {
                      let topics = d.topics;
                      if (!s.topicId) {
                        const existing = topics.find(
                          (t) =>
                            t.skillId === s.skillId &&
                            t.name.toLowerCase() === s.topic.toLowerCase(),
                        );
                        s.topicId = existing?.id || uid();
                        if (!existing)
                          topics = [
                            ...topics,
                            {
                              id: s.topicId,
                              skillId: s.skillId,
                              name: s.topic,
                              createdAt: new Date(
                                `${timer.date}T${timer.time}:00`,
                              ).toISOString(),
                              completedAt: null,
                            },
                          ];
                      }
                      const linkedPlan =
                        timer.planId ||
                        d.plans.find(
                          (p) =>
                            p.topicId === s.topicId &&
                            p.date === s.date &&
                            !p.sessionId,
                        )?.id;
                      return {
                        ...d,
                        topics,
                        skills:
                          videoPosition === undefined
                            ? d.skills
                            : d.skills.map((x) =>
                                x.id === s.skillId
                                  ? { ...x, videoPosition }
                                  : x,
                              ),
                        sessions: [...d.sessions, s],
                        timer: null,
                        plans: d.plans.map((p) =>
                          p.id === linkedPlan
                            ? {
                                ...p,
                                sessionId: s.id,
                              }
                            : p,
                        ),
                      };
                    })
                  ) {
                    setDialog(null);
                    notify("Actual study time saved. Well done.");
                  }
                }}
              />
            )}
          </Modal>
        )}
      </fieldset>
      {saving && (
        <div className="sync-indicator" role="status">
          Saving to Supabase…
        </div>
      )}
    </div>
  );
}
