export type Skill = {
  id: string;
  name: string;
  color: string;
  targetHours: number;
  /** Total length of the video course in minutes; null/undefined = topic-based skill. */
  videoMinutes?: number | null;
  /** Minutes of the video watched so far (where the learner stopped). */
  videoPosition?: number;
  createdAt: string;
};
export type Topic = {
  id: string;
  skillId: string;
  name: string;
  createdAt: string;
  completedAt: string | null;
  priority?: "High" | "Medium" | "Low";
  sortOrder?: number;
};
export function incompleteTopics(data: Data) {
  const rank = { High: 0, Medium: 1, Low: 2 };
  const order = new Map(
    data.topics.map((topic, index) => [topic.id, topic.sortOrder ?? index]),
  );
  return data.topics
    .filter((topic) => !isTopicComplete(data, topic))
    .sort(
      (a, b) =>
        rank[a.priority || "Medium"] - rank[b.priority || "Medium"] ||
        order.get(a.id)! - order.get(b.id)! ||
        Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );
}
export type Session = {
  id: string;
  skillId: string;
  topicId: string | null;
  topic: string;
  minutes: number;
  date: string;
  time: string;
  notes: string;
  completed: boolean;
  createdAt: string;
};
export type Plan = {
  id: string;
  topicId: string;
  date: string;
  minutes: number;
  sessionId: string | null;
};
export type Timer = {
  skillId: string;
  topicId: string | null;
  topic: string;
  planId: string | null;
  elapsed: number;
  startedAt: number | null;
  date: string;
  time: string;
};
export type Data = {
  version: 1;
  skills: Skill[];
  topics: Topic[];
  sessions: Session[];
  plans: Plan[];
  preferences: { dailyTarget: number; onboardingDone: boolean };
  timer: Timer | null;
};
export const STORAGE_KEY = "cadence:data:v1";
export const COLORS = [
  "#ffc74e",
  "#49cee3",
  "#7b9eff",
  "#38dbb5",
  "#ff985d",
  "#95e66d",
  "#ff738f",
  "#b99bff",
  "#f58bd4",
  "#e5ce9e",
  "#a9c2d8",
];
export const SUGGESTIONS = [
  "JavaScript",
  "React.js",
  "TypeScript",
  "Tailwind CSS",
  "HTML/CSS",
  "Node.js",
  "Git/GitHub",
  "DSA & Coding",
  "SQL",
  "Frontend/System Design",
  "Theory",
];
export const emptyData = (): Data => ({
  version: 1,
  skills: [],
  topics: [],
  sessions: [],
  plans: [],
  preferences: { dailyTarget: 60, onboardingDone: false },
  timer: null,
});
export const uid = () => crypto.randomUUID();
export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function shiftDay(day: string, amount: number) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return dayKey(d);
}
export function validDay(day: unknown): day is string {
  return (
    typeof day === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(new Date(`${day}T12:00:00`).getTime()) &&
    dayKey(new Date(`${day}T12:00:00`)) === day
  );
}
export const minutesLabel = (minutes: number) => {
  const m = Math.round(minutes);
  return m >= 60
    ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`
    : `${m}m`;
};
export const hoursLabel = (minutes: number) =>
  `${Number((minutes / 60).toFixed(1))}h`;
export function sumMinutes(sessions: Session[]) {
  return sessions.reduce((sum, s) => sum + s.minutes, 0);
}
export function isTopicComplete(data: Data, topic: Topic, until?: string) {
  return (
    !!(
      topic.completedAt &&
      (!until || dayKey(new Date(topic.completedAt)) <= until)
    ) ||
    data.sessions.some(
      (s) =>
        s.topicId === topic.id && s.completed && (!until || s.date <= until),
    )
  );
}
export function streakStats(data: Data, today = dayKey()) {
  const totals = new Map<string, number>();
  for (const session of data.sessions)
    if (session.completed && session.date <= today)
      totals.set(
        session.date,
        (totals.get(session.date) || 0) + session.minutes,
      );
  const days = [...totals.keys()].sort();
  let longest = 0,
    run = 0,
    previous = "";
  for (const day of days) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  let cursor = totals.has(today) ? today : shiftDay(today, -1),
    current = 0;
  while (totals.has(cursor)) {
    current++;
    cursor = shiftDay(cursor, -1);
  }
  const consistency = (window: number) =>
    Math.round(
      (Array.from({ length: window }, (_, i) =>
        totals.has(shiftDay(today, -i)),
      ).filter(Boolean).length /
        window) *
        100,
    );
  return {
    totals,
    days,
    current,
    longest,
    consistency,
    best: Math.max(0, ...totals.values()),
  };
}
export const isVideoSkill = (skill: Skill) => !!skill.videoMinutes;
export function videoProgress(skill: Skill) {
  const total = skill.videoMinutes || 0,
    position = Math.min(total, skill.videoPosition || 0);
  return {
    total,
    position,
    remaining: Math.max(0, total - position),
    percent: total ? Math.round((position / total) * 100) : 0,
  };
}
/** Parse "1:30", "90", "1h 30m" or "1h" into minutes; null when unreadable. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  let m = t.match(/^(\d+):([0-5]?\d)(?::[0-5]?\d)?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m?)?$/);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  return Number(m[1] || 0) * 60 + Number(m[2] || 0);
}
export function skillStats(data: Data, skill: Skill, today = dayKey()) {
  const topics = data.topics.filter((t) => t.skillId === skill.id),
    sessions = data.sessions.filter((s) => s.skillId === skill.id),
    video = isVideoSkill(skill),
    completed = topics.filter((t) => isTopicComplete(data, t)).length;
  const last = sessions
    .map((s) => s.date)
    .sort()
    .at(-1);
  const daysAgo = last
    ? Math.round(
        (new Date(`${today}T12:00:00`).getTime() -
          new Date(`${last}T12:00:00`).getTime()) /
          86400000,
      )
    : null;
  return {
    topics,
    sessions,
    completed,
    progress: video
      ? videoProgress(skill).percent
      : topics.length
        ? Math.round((completed / topics.length) * 100)
        : 0,
    minutes: sumMinutes(sessions),
    last,
    lastLabel:
      daysAgo === null
        ? "Not yet"
        : daysAgo === 0
          ? "Today"
          : daysAgo === 1
            ? "Yesterday"
            : `${daysAgo} days ago`,
    status: !sessions.length
      ? "Ready to begin"
      : daysAgo !== null && daysAgo >= 10
        ? "Needs revisit"
        : (video
              ? videoProgress(skill).percent === 100
              : topics.length && completed === topics.length)
          ? "Complete"
          : "Building",
  };
}
export function chartBuckets(
  data: Data,
  mode: "Daily" | "Weekly" | "Monthly",
  today = dayKey(),
) {
  const length = mode === "Daily" ? 14 : mode === "Weekly" ? 12 : 6;
  return Array.from({ length }, (_, i) => {
    let start: string, end: string, label: string;
    if (mode === "Monthly") {
      const d = new Date(`${today}T12:00:00`);
      d.setDate(1);
      d.setMonth(d.getMonth() - (length - 1 - i));
      start = dayKey(d);
      label = d.toLocaleDateString(undefined, { month: "short" });
      d.setMonth(d.getMonth() + 1);
      end = shiftDay(dayKey(d), -1);
    } else if (mode === "Weekly") {
      const weekStart = shiftDay(
        today,
        -((new Date(`${today}T12:00:00`).getDay() + 6) % 7),
      );
      start = shiftDay(weekStart, -7 * (length - 1 - i));
      end = shiftDay(start, 6);
      label = new Date(`${start}T12:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } else {
      start = shiftDay(today, -(length - 1 - i));
      end = start;
      label = new Date(`${start}T12:00:00`).toLocaleDateString(undefined, {
        day: "numeric",
      });
    }
    return {
      date: start,
      label,
      hours: Number(
        (
          sumMinutes(
            data.sessions.filter((s) => s.date >= start && s.date <= end),
          ) / 60
        ).toFixed(2),
      ),
    };
  });
}
export function progressHistory(data: Data, today = dayKey()) {
  if (!data.topics.length) return [];
  const first =
    [
      ...data.topics.map((t) => dayKey(new Date(t.createdAt))),
      ...data.sessions.map((s) => s.date),
    ].sort()[0] || today;
  const span = Math.max(
    0,
    Math.round(
      (new Date(`${today}T12:00:00`).getTime() -
        new Date(`${first}T12:00:00`).getTime()) /
        86400000,
    ),
  );
  const count = Math.min(90, span + 1);
  return Array.from({ length: count }, (_, i) => {
    const date = shiftDay(
      first,
      Math.round((i * span) / Math.max(1, count - 1)),
    );
    const topics = data.topics.filter(
      (t) => dayKey(new Date(t.createdAt)) <= date,
    );
    return {
      date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      progress: topics.length
        ? Math.round(
            (topics.filter((t) => isTopicComplete(data, t, date)).length /
              topics.length) *
              100,
          )
        : 0,
    };
  });
}
export function timerSeconds(timer: Timer, now = Date.now()) {
  return (
    timer.elapsed +
    (timer.startedAt === null ? 0 : Math.max(0, (now - timer.startedAt) / 1000))
  );
}
export function validateData(raw: unknown): Data {
  const fail = (): never => {
    throw new Error(
      "This file is not a valid Cadence backup. No data was changed.",
    );
  };
  if (!raw || typeof raw !== "object") return fail();
  const d = raw as Data;
  const text = (v: unknown, max = 2000): v is string =>
    typeof v === "string" && v.length <= max;
  const num = (v: unknown, max = 100000) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
  const timestamp = (v: unknown) =>
    text(v, 40) && Number.isFinite(Date.parse(v));
  if (
    d.version !== 1 ||
    !Array.isArray(d.skills) ||
    !Array.isArray(d.topics) ||
    !Array.isArray(d.sessions) ||
    !Array.isArray(d.plans) ||
    !d.preferences ||
    !num(d.preferences.dailyTarget, 1440) ||
    d.preferences.dailyTarget < 1 ||
    typeof d.preferences.onboardingDone !== "boolean"
  )
    return fail();
  if ([d.skills, d.topics, d.sessions, d.plans].some((a) => a.length > 100000))
    return fail();
  const ids = (items: { id: string }[]) =>
    items.every((x) => x && text(x.id, 100) && x.id.length > 0) &&
    new Set(items.map((x) => x.id)).size === items.length;
  if (![d.skills, d.topics, d.sessions, d.plans].every(ids)) return fail();
  if (
    !d.skills.every(
      (s) =>
        text(s.name, 100) &&
        s.name.trim() &&
        /^#[0-9a-f]{6}$/i.test(s.color) &&
        num(s.targetHours) &&
        (s.videoMinutes === undefined ||
          s.videoMinutes === null ||
          (num(s.videoMinutes, 600000) && s.videoMinutes > 0)) &&
        (s.videoPosition === undefined ||
          (num(s.videoPosition, 600000) &&
            (!s.videoMinutes || s.videoPosition <= s.videoMinutes))) &&
        timestamp(s.createdAt),
    )
  )
    return fail();
  const skillIds = new Set(d.skills.map((s) => s.id)),
    topicIds = new Set(d.topics.map((t) => t.id)),
    sessionIds = new Set(d.sessions.map((s) => s.id));
  if (
    !d.topics.every(
      (t) =>
        skillIds.has(t.skillId) &&
        text(t.name, 200) &&
        t.name.trim() &&
        timestamp(t.createdAt) &&
        (t.completedAt === null || timestamp(t.completedAt)) &&
        (t.priority === undefined ||
          ["High", "Medium", "Low"].includes(t.priority)) &&
        (t.sortOrder === undefined ||
          (Number.isSafeInteger(t.sortOrder) && num(t.sortOrder, 2147483647))),
    )
  )
    return fail();
  if (
    !d.sessions.every(
      (s) =>
        skillIds.has(s.skillId) &&
        (s.topicId === null ||
          d.topics.some(
            (t) => t.id === s.topicId && t.skillId === s.skillId,
          )) &&
        text(s.topic, 200) &&
        s.topic.trim() &&
        num(s.minutes, 1440) &&
        s.minutes > 0 &&
        validDay(s.date) &&
        s.date <= dayKey() &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time) &&
        text(s.notes, 10000) &&
        typeof s.completed === "boolean" &&
        timestamp(s.createdAt),
    )
  )
    return fail();
  if (
    !d.plans.every(
      (p) =>
        topicIds.has(p.topicId) &&
        validDay(p.date) &&
        num(p.minutes, 1440) &&
        p.minutes > 0 &&
        (p.sessionId === null || sessionIds.has(p.sessionId)),
    )
  )
    return fail();
  if (d.timer !== null) {
    const t = d.timer;
    if (
      !t ||
      !skillIds.has(t.skillId) ||
      (t.topicId !== null &&
        !d.topics.some(
          (topic) => topic.id === t.topicId && topic.skillId === t.skillId,
        )) ||
      !text(t.topic, 200) ||
      !t.topic.trim() ||
      !num(t.elapsed, 86400 * 365) ||
      (t.startedAt !== null &&
        (!num(t.startedAt, Number.MAX_SAFE_INTEGER) ||
          t.startedAt > Date.now() + 60000)) ||
      !validDay(t.date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time) ||
      (t.planId !== null && !d.plans.some((p) => p.id === t.planId))
    )
      return fail();
  }
  // Reconstruct known fields: imported files cannot introduce arbitrary application state.
  return {
    version: 1,
    skills: d.skills.map((s) => ({ ...s })),
    topics: d.topics.map((t) => ({ ...t })),
    sessions: d.sessions.map((s) => ({ ...s })),
    plans: d.plans.map((p) => ({ ...p })),
    preferences: {
      dailyTarget: d.preferences.dailyTarget,
      onboardingDone: d.preferences.onboardingDone,
    },
    timer: d.timer ? { ...d.timer } : null,
  };
}
