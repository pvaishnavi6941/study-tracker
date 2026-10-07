import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  within,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { STORAGE_KEY, Data, dayKey, emptyData } from "./model";
import { readLegacyData } from "./store";
import { testCloud, resetTestCloud, load, save } from "./test-cloud";
vi.mock("./utils/repository", async () => {
  const actual = await vi.importActual("./utils/repository");
  const fake = await import("./test-cloud");
  return { ...actual, loadSnapshot: fake.load, saveSnapshot: fake.save };
});
vi.mock("./utils/supabase", () => ({
  supabase: null,
  configurationError: "",
  requireSupabase: () => ({}),
}));
vi.mock("./auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user-a", email: "a@example.test" },
    error: "",
    signOut: vi.fn(async () => true),
  }),
}));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  AreaChart: () => null,
  Area: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
}));
beforeEach(() => {
  localStorage.clear();
  resetTestCloud();
  window.location.hash = "";
});
const stored = (): Data => testCloud.snapshot.data;
async function setup() {
  const user = userEvent.setup();
  render(<App userId="test-user-a" />);
  await user.click(await screen.findByRole("button", { name: "React.js" }));
  await user.type(
    screen.getByLabelText("TOPICS FOR YOUR FIRST SKILL (OPTIONAL)"),
    "Effects",
  );
  await user.click(
    screen.getByRole("button", { name: "Create my study space" }),
  );
  return user;
}
describe("major user flows", () => {
  it("deletes a selected topic chip independently while retaining logged history", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Log" }));
    await user.click(screen.getByRole("button", { name: "React.js" }));
    await user.click(screen.getByRole("button", { name: "Effects" }));
    await user.click(
      screen.getByRole("button", { name: "Add 45m of React.js" }),
    );
    const original = structuredClone(stored().sessions[0]);
    await user.click(screen.getByRole("button", { name: "React.js" }));
    await user.click(
      screen.getByRole("button", { name: "Delete topic Effects" }),
    );
    expect((screen.getByLabelText("TOPIC") as HTMLInputElement).value).toBe("");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(stored().topics).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Effects" }));
    await user.click(
      screen.getByRole("button", { name: "Delete topic Effects" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(stored().topics).toHaveLength(0);
    expect(stored().sessions[0]).toEqual({ ...original, topicId: null });
    expect((screen.getByLabelText("TOPIC") as HTMLInputElement).value).toBe("");
    expect(
      screen.queryByRole("button", { name: "Delete topic Effects" }),
    ).toBeNull();
  });
  it("filters topics within the selected skill and preserves selected and custom topics", async () => {
    const d = emptyData();
    d.preferences.onboardingDone = true;
    d.skills = ["JavaScript", "React"].map((name, i) => ({
      id: `s${i}`,
      name,
      color: "#49cee3",
      targetHours: 10,
      createdAt: new Date().toISOString(),
    }));
    d.topics = [
      { id: "t1", skillId: "s0", name: "JavaScript overview and runtime" },
      { id: "t2", skillId: "s0", name: "JavaScript engines" },
      { id: "t3", skillId: "s1", name: "React runtime" },
    ].map((t) => ({
      ...t,
      completedAt: null,
      createdAt: new Date().toISOString(),
    }));
    testCloud.snapshot.data = d;
    const user = userEvent.setup();
    render(<App userId="test-user-a" />);
    await user.click(await screen.findByRole("button", { name: "Log" }));
    await user.click(screen.getByRole("button", { name: "JavaScript" }));
    const input = screen.getByLabelText("TOPIC");
    const chips = within(document.getElementById("session-topic-options")!);
    expect(chips.getAllByRole("button", { pressed: false })).toHaveLength(2);
    await user.type(input, "  RUNTIME  javascript  ");
    expect(chips.getAllByRole("button", { pressed: false })).toHaveLength(1);
    await user.click(
      chips.getByRole("button", { name: "JavaScript overview and runtime" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add 45m of JavaScript" }),
    );
    expect(stored().sessions[0].topicId).toBe("t1");
    await user.click(screen.getByRole("button", { name: "JavaScript" }));
    await user.type(input, "runtime");
    await user.click(screen.getByRole("button", { name: "React" }));
    expect((input as HTMLInputElement).value).toBe("");
    expect(chips.getAllByRole("button", { pressed: false })).toHaveLength(1);
    await user.type(input, "Custom reading");
    expect(chips.queryAllByRole("button")).toHaveLength(0);
    expect(
      within(document.querySelector(".session-form")!).getByRole("status")
        .textContent,
    ).toContain("No matching topics");
    await user.clear(input);
    expect(chips.getByRole("button", { name: "React runtime" })).toBeTruthy();
    await user.type(input, "Custom reading");
    await user.click(screen.getByRole("button", { name: "Add 45m of React" }));
    const custom = stored().sessions.find((s) => s.topic === "Custom reading")!;
    expect(custom.skillId).toBe("s1");
    expect(stored().topics.find((t) => t.id === custom.topicId)?.name).toBe(
      "Custom reading",
    );
  });
  it("onboards with zero activity and persists setup across remount", async () => {
    const user = await setup();
    expect(stored().skills).toHaveLength(1);
    expect(stored().sessions).toHaveLength(0);
    expect(stored().topics).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Skills" }));
    expect(screen.getByText("0%")).toBeTruthy();
    expect((await load("test-user-a")).data).toEqual(stored());
  });
  it("logs, edits, refreshes and deletes a real session with recalculated totals", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Log" }));
    await user.click(screen.getByRole("button", { name: "React.js" }));
    await user.click(screen.getByRole("button", { name: "Effects" }));
    await user.type(screen.getByLabelText("NOTES"), "Cleanup clicked");
    await user.click(
      screen.getByRole("switch", { name: "Mark topic complete" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add 45m of React.js" }),
    );
    expect(stored().sessions[0].minutes).toBe(45);
    expect(stored().sessions[0].notes).toBe("Cleanup clicked");
    await user.click(
      screen.getByRole("button", { name: "Edit session Effects" }),
    );
    fireEvent.change(screen.getByLabelText("DURATION"), {
      target: { value: "30" },
    });
    await user.click(
      screen.getByRole("switch", { name: "Mark topic complete" }),
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(stored().sessions[0].minutes).toBe(30);
    expect(stored().sessions[0].completed).toBe(false);
    await user.click(
      screen.getByRole("button", { name: "Delete session Effects" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(stored().sessions).toHaveLength(0);
    expect(screen.getByText("No study sessions yet")).toBeTruthy();
  });
  it("plans a real topic and logs it from Today", async () => {
    const user = await setup();
    await user.click(
      screen.getAllByRole("button", { name: "Plan today’s study" })[0],
    );
    await user.click(screen.getByRole("button", { name: "Plan focus block" }));
    expect(stored().plans).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Complete Effects" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(stored().sessions[0].minutes).toBe(45);
    expect(stored().plans[0].sessionId).toBe(stored().sessions[0].id);
  });
  it("protects destructive reset with typed confirmation", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Delete all data" }));
    expect(
      (screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.type(screen.getByLabelText("TYPE DELETE TO CONFIRM"), "DELETE");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(stored().skills).toEqual([]);
    expect(stored().preferences.onboardingDone).toBe(true);
  });
  it("starts, pauses, resumes, and saves actual timer duration", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Log" }));
    await user.click(screen.getByRole("button", { name: "React.js" }));
    await user.click(screen.getByRole("button", { name: "Effects" }));
    await user.click(
      screen.getByRole("button", { name: "Start a timed session" }),
    );
    expect(stored().timer?.startedAt).not.toBe(null);
    await user.click(screen.getByRole("button", { name: "Pause session" }));
    expect(stored().timer?.startedAt).toBe(null);
    await user.click(screen.getByRole("button", { name: "Resume session" }));
    expect(stored().timer?.startedAt).not.toBe(null);
    const original = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(original + 65000);
    await user.click(screen.getByRole("button", { name: "Finish" }));
    await user.click(
      screen.getByRole("button", { name: "Save study session" }),
    );
    expect(stored().timer).toBe(null);
    expect(stored().sessions[0].minutes).toBeGreaterThanOrEqual(65 / 60);
  });
  it("restores an active timer after a page remount and confirms cancellation", async () => {
    const d = emptyData();
    d.preferences.onboardingDone = true;
    d.skills = [
      {
        id: "s",
        name: "Skill",
        color: "#49cee3",
        targetHours: 0,
        createdAt: new Date().toISOString(),
      },
    ];
    d.timer = {
      skillId: "s",
      topicId: null,
      topic: "My timer",
      planId: null,
      date: dayKey(),
      time: "12:00",
      elapsed: 90,
      startedAt: null,
    };
    testCloud.snapshot.data = d;
    render(<App userId="test-user-a" />);
    expect(await screen.findByText("01:30")).toBeTruthy();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Cancel active session" }),
    );
    expect(stored().timer).not.toBe(null);
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(stored().timer).toBe(null);
  });
  it("preserves unreadable local storage rather than overwriting it", () => {
    localStorage.setItem(STORAGE_KEY, "corrupt-user-data");
    render(<App userId="test-user-a" />);
    expect(readLegacyData().error).toContain("could not be read");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("corrupt-user-data");
  });
  it("reports storage failures and does not claim a successful save", async () => {
    const user = await setup();
    await user.click(
      screen.getByRole("button", {
        name: "Increase daily target by 15 minutes",
      }),
    );
    const previous = stored().preferences.dailyTarget;
    testCloud.saveError = new Error("Network unavailable");
    await user.click(
      screen.getByRole("button", {
        name: "Increase daily target by 15 minutes",
      }),
    );
    expect(screen.getByRole("alert").textContent).toContain("Could not sync");
    expect(stored().preferences.dailyTarget).toBe(previous);
  });
  it("all requested navigation screens are reachable with empty data", async () => {
    const d = emptyData();
    d.preferences.onboardingDone = true;
    testCloud.snapshot.data = d;
    render(<App userId="test-user-a" />);
    const user = userEvent.setup();
    for (const name of ["Skills", "Log", "Streak", "Analytics", "Today"]) {
      await user.click(await screen.findByRole("button", { name }));
      expect(document.querySelector("main h1")).toBeTruthy();
    }
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByText("Your data, in your hands")).toBeTruthy();
  });
  it("persists real sessions through a full app remount", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Log" }));
    await user.click(screen.getByRole("button", { name: "React.js" }));
    await user.click(screen.getByRole("button", { name: "Effects" }));
    await user.click(
      screen.getByRole("button", { name: "Add 45m of React.js" }),
    );
    cleanup();
    render(<App userId="test-user-a" />);
    expect(await screen.findByText("Effects")).toBeTruthy();
    expect(stored().sessions).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBe(null);
  });
  it("edits skills and adds, edits, completes, and deletes topics", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Skills" }));
    await user.click(screen.getByRole("button", { name: "Edit React.js" }));
    await user.clear(screen.getByLabelText("SKILL NAME"));
    await user.type(screen.getByLabelText("SKILL NAME"), "React");
    await user.click(screen.getByRole("button", { name: "Save skill" }));
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    await user.click(screen.getByRole("button", { name: "Manage topics (1)" }));
    await user.type(screen.getByLabelText("Topic name"), "State");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(stored().topics).toHaveLength(2);
    await user.click(
      screen.getByRole("checkbox", { name: "Mark State complete" }),
    );
    expect(
      stored().topics.find((t) => t.name === "State")?.completedAt,
    ).not.toBe(null);
    await user.click(screen.getByRole("button", { name: "Edit topic State" }));
    await user.clear(screen.getByLabelText("Topic name"));
    await user.type(screen.getByLabelText("Topic name"), "State machines");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(stored().topics.some((t) => t.name === "State machines")).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "Delete topic State machines" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(stored().topics).toHaveLength(1);
  });
  it("validates, confirms, and restores imported data", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const backup = structuredClone(stored());
    backup.preferences.dailyTarget = 90;
    const file = new File([JSON.stringify(backup)], "backup.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: async () => JSON.stringify(backup),
    });
    await user.upload(screen.getByLabelText("Import JSON backup"), file);
    expect(stored().preferences.dailyTarget).toBe(60);
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(stored().preferences.dailyTarget).toBe(90);
    const invalid = new File(["{}"], "bad.json", { type: "application/json" });
    Object.defineProperty(invalid, "text", { value: async () => "{}" });
    await user.upload(screen.getByLabelText("Import JSON backup"), invalid);
    expect(screen.getByRole("status").textContent).toContain("not a valid");
    expect(stored().preferences.dailyTarget).toBe(90);
  });
});
