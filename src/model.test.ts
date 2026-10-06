import { describe, it, expect } from "vitest";
import {
  emptyData,
  focusTopics,
  dayKey,
  shiftDay,
  streakStats,
  skillStats,
  isTopicComplete,
  chartBuckets,
  progressHistory,
  validateData,
  timerSeconds,
  parseDuration,
  videoProgress,
  Session,
  Data,
} from "./model";
const today = "2026-10-03";
const makeData = (): Data => ({
  ...emptyData(),
  skills: [
    {
      id: "s1",
      name: "User skill",
      color: "#49cee3",
      targetHours: 10,
      createdAt: "2026-09-01T12:00:00Z",
    },
  ],
  topics: [
    {
      id: "t1",
      skillId: "s1",
      name: "User topic",
      createdAt: "2026-09-01T12:00:00Z",
      completedAt: null,
    },
  ],
});
const session = (
  date = today,
  completed = true,
  minutes = 45,
  id = "a",
): Session => ({
  id,
  skillId: "s1",
  topicId: "t1",
  topic: "User topic",
  date,
  time: "15:00",
  completed,
  minutes,
  notes: "",
  createdAt: "2026-10-03T12:00:00Z",
});
describe("real data calculations", () => {
  it("starts with no seeded data or statistics", () => {
    const d = emptyData();
    expect(d.sessions).toEqual([]);
    expect(d.skills).toEqual([]);
    expect(d.topics).toEqual([]);
    expect(streakStats(d, today).current).toBe(0);
    expect(streakStats(d, today).best).toBe(0);
    expect(chartBuckets(d, "Daily", today).every((p) => p.hours === 0)).toBe(
      true,
    );
    expect(progressHistory(d, today)).toEqual([]);
  });
  it("calculates time separately from topic completion", () => {
    const d = makeData();
    d.sessions = [session(today, false)];
    expect(skillStats(d, d.skills[0], today).minutes).toBe(45);
    expect(isTopicComplete(d, d.topics[0])).toBe(false);
    expect(streakStats(d, today).current).toBe(0);
  });
  it("multiple sessions on one date count as one study day", () => {
    const d = makeData();
    d.sessions = [session(), session(today, true, 60, "b")];
    const s = streakStats(d, today);
    expect(s.current).toBe(1);
    expect(s.days).toHaveLength(1);
    expect(s.best).toBe(105);
    expect(skillStats(d, d.skills[0], today).completed).toBe(1);
  });
  it("counts consecutive days including today", () => {
    const d = makeData();
    d.sessions = [
      session(),
      session("2026-10-02", true, 20, "b"),
      session("2026-10-01", true, 20, "c"),
    ];
    expect(streakStats(d, today).current).toBe(3);
    expect(streakStats(d, today).longest).toBe(3);
  });
  it("keeps yesterday’s streak alive before studying today", () => {
    const d = makeData();
    d.sessions = [session("2026-10-02"), session("2026-10-01", true, 20, "b")];
    expect(streakStats(d, today).current).toBe(2);
  });
  it("resets current streak after a missed day", () => {
    const d = makeData();
    d.sessions = [session("2026-10-01"), session("2026-09-30", true, 20, "b")];
    expect(streakStats(d, today).current).toBe(0);
    expect(streakStats(d, today).longest).toBe(2);
  });
  it("finds longest historical streak separately from current", () => {
    const d = makeData();
    d.sessions = [
      session(),
      ...["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"].map(
        (date, i) => session(date, true, 45, String(i)),
      ),
    ];
    expect(streakStats(d, today).current).toBe(1);
    expect(streakStats(d, today).longest).toBe(4);
  });
  it("handles month/year/leap-day boundaries without UTC day conversions", () => {
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDay("2024-03-01", -1)).toBe("2024-02-29");
    expect(dayKey(new Date(2026, 9, 3, 0, 1))).toBe(today);
  });
  it("recalculates completion and time after session edit/delete", () => {
    const d = makeData();
    d.sessions = [session()];
    expect(skillStats(d, d.skills[0], today).progress).toBe(100);
    d.sessions[0] = { ...d.sessions[0], completed: false, minutes: 30 };
    expect(skillStats(d, d.skills[0], today).progress).toBe(0);
    expect(skillStats(d, d.skills[0], today).minutes).toBe(30);
    d.sessions = [];
    expect(streakStats(d, today).current).toBe(0);
    expect(skillStats(d, d.skills[0], today).minutes).toBe(0);
  });
  it("retains completion if a different session or manual check still completes a topic", () => {
    const d = makeData();
    d.topics[0].completedAt = "2026-10-01T12:00:00Z";
    expect(isTopicComplete(d, d.topics[0])).toBe(true);
    expect(isTopicComplete(d, d.topics[0], "2026-09-30")).toBe(false);
  });
  it("calculates daily/weekly/monthly buckets from sessions only", () => {
    const d = makeData();
    d.sessions = [session(), session("2026-10-02", true, 15, "b")];
    expect(chartBuckets(d, "Daily", today).at(-1)?.hours).toBe(0.75);
    expect(chartBuckets(d, "Weekly", today).at(-1)?.hours).toBe(1);
    expect(chartBuckets(d, "Monthly", today).at(-1)?.hours).toBe(1);
  });
  it("uses real dated topic completion for learning history", () => {
    const d = makeData();
    d.sessions = [session("2026-10-02")];
    const history = progressHistory(d, today);
    expect(history.find((p) => p.date === "2026-10-01")?.progress).toBe(0);
    expect(history.at(-1)?.progress).toBe(100);
  });
  it("calculates consistency from unique dates", () => {
    const d = makeData();
    d.sessions = [session(), session(today, true, 15, "b")];
    expect(streakStats(d, today).consistency(7)).toBe(14);
    expect(streakStats(d, today).consistency(30)).toBe(3);
  });
  it("recovers active and paused timer duration", () => {
    const timer = {
      skillId: "s1",
      topicId: "t1",
      topic: "Topic",
      planId: null,
      elapsed: 90,
      startedAt: 1000,
      date: today,
      time: "23:59",
    };
    expect(timerSeconds(timer, 61000)).toBe(150);
    expect(timerSeconds({ ...timer, startedAt: null }, 999999)).toBe(90);
  });
  it("ignores future dates for streak calculations", () => {
    const d = makeData();
    d.sessions = [session("2026-10-04")];
    expect(streakStats(d, today).current).toBe(0);
  });
});
describe("backups", () => {
  it("round trips real user state including preferences", () => {
    const d = makeData();
    d.sessions = [session()];
    d.preferences.onboardingDone = true;
    expect(validateData(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it.each([
    null,
    {},
    { version: 2 },
    { ...emptyData(), preferences: { dailyTarget: -1, onboardingDone: true } },
  ])("rejects malformed backups", (raw) => {
    expect(() => validateData(raw)).toThrow();
  });
  it("rejects broken foreign keys, duplicate ids, impossible dates and durations", () => {
    const d = makeData();
    d.sessions = [session()];
    for (const change of [
      { skillId: "missing" },
      { topicId: "missing" },
      { date: "2026-02-30" },
      { minutes: -10 },
      { minutes: Infinity },
      { time: "25:00" },
    ])
      expect(() =>
        validateData({ ...d, sessions: [{ ...d.sessions[0], ...change }] }),
      ).toThrow();
    expect(() =>
      validateData({ ...d, skills: [...d.skills, ...d.skills] }),
    ).toThrow();
  });
  it("rejects invalid timer records and unknown references", () => {
    const d = makeData();
    expect(() =>
      validateData({ ...d, timer: { skillId: "missing" } }),
    ).toThrow();
    expect(() =>
      validateData({
        ...d,
        plans: [
          {
            id: "p",
            topicId: "bad",
            date: today,
            minutes: 45,
            sessionId: null,
          },
        ],
      }),
    ).toThrow();
  });
});

describe("video course progress", () => {
  it("parses common duration formats", () => {
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("12h 30m")).toBe(750);
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("45")).toBe(45);
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });
  it("measures progress by video position, not topics or study time", () => {
    const data = makeData(),
      base = data.skills[0];
    data.skills[0] = { ...base, videoMinutes: 600, videoPosition: 150 };
    data.sessions.push({
      id: "v1",
      skillId: base.id,
      topicId: null,
      topic: "Java video",
      minutes: 400,
      date: today,
      time: "09:00",
      notes: "",
      completed: false,
      createdAt: "2026-10-03T09:00:00.000Z",
    });
    const stats = skillStats(data, data.skills[0], today);
    expect(stats.progress).toBe(25);
    expect(stats.minutes).toBe(400);
    expect(videoProgress(data.skills[0]).remaining).toBe(450);
    expect(() => validateData(data)).not.toThrow();
  });
  it("rejects a position past the video length", () => {
    const data = makeData();
    data.skills[0] = { ...data.skills[0], videoMinutes: 60, videoPosition: 61 };
    expect(() => validateData(data)).toThrow();
  });
});

describe("today's focus", () => {
  it("includes the best topic of each skill before a second topic of one skill", () => {
    const data = emptyData();
    const mk = (id: string, name: string) => ({ id, name, color: "#ffffff", targetHours: 10, createdAt: new Date().toISOString() });
    data.skills = [mk("a", "HTML"), mk("b", "DSA")];
    const topic = (id: string, skillId: string, priority: "High" | "Low", sortOrder: number) => ({
      id, skillId, name: id, createdAt: new Date().toISOString(), completedAt: null, priority, sortOrder,
    });
    data.topics = [topic("h1", "a", "High", 0), topic("h2", "a", "High", 1), topic("h3", "a", "High", 2), topic("d1", "b", "Low", 0)];
    expect(focusTopics(data).map((t) => t.id)).toEqual(["h1", "d1", "h2"]);
  });
});
