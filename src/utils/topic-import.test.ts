import { describe, expect, it } from "vitest";
import { appendImportedTopics, validateTopicRows } from "./topic-import";
import { changesConfirmed } from './confirmed-changes';
import {
  emptyData,
  incompleteTopics,
  isTopicComplete,
  validateData,
  dayKey,
} from "../model";
const rows = [
  ["Topic", "Priority"],
  [" Closures ", " High "],
  [],
  ["Promises", "High"],
  ["Events", "Low"],
];
describe("Excel topic validation and import", () => {
  it('confirms a committed manual topic write when PostgreSQL supplies default priority/order', () => {
    const initial=emptyData();
    const next=appendImportedTopics(initial, rows, {skillId:'new',newName:'JavaScript'});
    const intended=structuredClone(next);delete intended.topics[0].priority;delete intended.topics[0].sortOrder;
    expect(changesConfirmed(initial,intended,next)).toBe(true);
    next.topics[1].priority='Low';
    expect(changesConfirmed(initial,intended,next)).toBe(false);
  });
  it("trims values, skips blank rows, and retains exact Excel row numbers/order", () => {
    const result = validateTopicRows(rows);
    expect(result.issues).toEqual([]);
    expect(
      result.topics.map((topic) => [topic.row, topic.name, topic.priority]),
    ).toEqual([
      [2, "Closures", "High"],
      [4, "Promises", "High"],
      [5, "Events", "Low"],
    ]);
  });
  it("identifies all invalid rows and refuses the entire import", () => {
    const bad = [
      ["Topic", "Priority"],
      ["Valid", "High"],
      ["", "Low"],
      ["Wrong", "Urgent"],
    ];
    expect(validateTopicRows(bad).issues.map((issue) => issue.row)).toEqual([
      3, 4,
    ]);
    expect(() =>
      appendImportedTopics(emptyData(), bad, {
        skillId: "new",
        newName: "JavaScript",
      }),
    ).toThrow("Row 3");
    expect(emptyData().topics).toEqual([]);
  });
  it("requires the exact two-column template and detects extra data columns", () => {
    for (const header of [
      ["Skill", "Topic", "Priority"],
      ["Topic"],
      ["Topic", "Priority", "Duration"],
    ])
      expect(validateTopicRows([header]).issues[0].row).toBe(1);
    expect(
      validateTopicRows([
        ["Topic", "Priority"],
        ["A", "High", 15],
      ]).issues[0].row,
    ).toBe(2);
    expect(
      validateTopicRows([["Topic", "Priority"]]).issues[0].message,
    ).toContain("no topics");
  });
  it("rejects duplicates in the workbook and in the selected skill, but allows another skill", () => {
    const first = appendImportedTopics(emptyData(), rows, {
      skillId: "new",
      newName: "JavaScript",
    });
    expect(() =>
      appendImportedTopics(first, rows, {
        skillId: first.skills[0].id,
        newName: "",
      }),
    ).toThrow("duplicates");
    expect(
      validateTopicRows([
        ["Topic", "Priority"],
        ["X", "High"],
        [" x ", "Medium"],
      ]).issues[0].row,
    ).toBe(3);
    const second = appendImportedTopics(first, rows, {
      skillId: "new",
      newName: "React.js",
    });
    expect(second.skills).toHaveLength(2);
    expect(second.topics).toHaveLength(6);
    expect(
      new Set(second.topics.slice(3).map((topic) => topic.skillId)),
    ).toEqual(new Set([second.skills[1].id]));
  });
  it("reuses an existing skill when creating the same normalized name and keeps priority in backups", () => {
    const initial = appendImportedTopics(emptyData(), rows, {
      skillId: "new",
      newName: "JavaScript",
    });
    const next = appendImportedTopics(
      initial,
      [
        ["Topic", "Priority"],
        ["New topic", "Medium"],
      ],
      { skillId: "new", newName: " javascript " },
    );
    expect(next.skills).toHaveLength(1);
    expect(next.topics.at(-1)?.skillId).toBe(initial.skills[0].id);
    expect(validateData(next).topics[0].priority).toBe("High");
  });
  it("selects incomplete topics by priority and stable order, independent of a daily time target", () => {
    const imported = appendImportedTopics(
      emptyData(),
      [
        ["Topic", "Priority"],
        ["Low first", "Low"],
        ["High first", "High"],
        ["Middle", "Medium"],
        ["High second", "High"],
      ],
      { skillId: "new", newName: "JavaScript" },
    );
    expect(incompleteTopics(imported).map((topic) => topic.name)).toEqual([
      "High first",
      "High second",
      "Middle",
      "Low first",
    ]);
    const topic = imported.topics[1];
    imported.sessions.push({
      id: "session",
      skillId: topic.skillId,
      topicId: topic.id,
      topic: topic.name,
      minutes: 20,
      date: dayKey(),
      time: "12:00",
      notes: "",
      completed: false,
      createdAt: new Date().toISOString(),
    });
    expect(isTopicComplete(imported, topic)).toBe(false);
    expect(incompleteTopics(imported)[0].id).toBe(topic.id);
    imported.sessions[0].completed = true;
    expect(incompleteTopics(imported)[0].name).toBe("High second");
    expect(imported.topics.every((topic) => !("minutes" in topic))).toBe(true);
  });
});
