import { Data, Topic, Skill, uid, COLORS } from "../model";

export const TOPIC_PROMPT =
  "I want to track my {skill} progress. Fill the attached Cadence Excel template with the essential topics I should learn, from fundamentals to advanced. Prioritize them as High, Medium, or Low. Keep the exact template format and don't add any columns.";
export type ImportRow = {
  row: number;
  name: string;
  priority: NonNullable<Topic["priority"]>;
};
export type ImportIssue = { row: number; message: string };
export const normalizeName = (value: string) =>
  value.trim().normalize("NFKC").toLocaleLowerCase("en-US");
export function validateTopicRows(rows: unknown[][], existing: Topic[] = []) {
  const topics: ImportRow[] = [],
    issues: ImportIssue[] = [];
  const header = rows[0]?.map((value) =>
    typeof value === "string" ? value.trim() : value,
  );
  if (
    !header ||
    header.length !== 2 ||
    header[0] !== "Topic" ||
    header[1] !== "Priority"
  )
    return {
      topics,
      issues: [
        {
          row: 1,
          message:
            "Use exactly Topic | Priority, in that order, with no extra columns.",
        },
      ],
    };
  if (rows.length > 5001)
    return {
      topics,
      issues: [{ row: 1, message: "Import at most 5,000 topics at a time." }],
    };
  const seen = new Map(
    existing.map((topic) => [normalizeName(topic.name), "this skill"]),
  );
  rows.slice(1).forEach((cells, index) => {
    const row = index + 2;
    if (
      cells.every(
        (cell) =>
          cell === null ||
          cell === undefined ||
          (typeof cell === "string" && !cell.trim()),
      )
    )
      return;
    const name = typeof cells[0] === "string" ? cells[0].trim() : "";
    const priority = typeof cells[1] === "string" ? cells[1].trim() : "";
    if (
      cells
        .slice(2)
        .some((cell) => cell !== null && cell !== undefined && cell !== "")
    )
      issues.push({ row, message: "Extra columns are not allowed." });
    if (!name)
      issues.push({
        row,
        message: "Topic must contain text and cannot be empty.",
      });
    else if (name.length > 200)
      issues.push({ row, message: "Topic must be at most 200 characters." });
    if (!["High", "Medium", "Low"].includes(priority))
      issues.push({ row, message: "Priority must be High, Medium, or Low." });
    if (name) {
      const key = normalizeName(name),
        duplicate = seen.get(key);
      if (duplicate)
        issues.push({
          row,
          message: `“${name}” duplicates a topic in ${duplicate}.`,
        });
      else seen.set(key, `row ${row}`);
    }
    if (!issues.some((issue) => issue.row === row))
      topics.push({ row, name, priority: priority as ImportRow["priority"] });
  });
  if (!topics.length && !issues.length)
    issues.push({
      row: 2,
      message:
        "The workbook has no topics. Fill in Topic and Priority before importing.",
    });
  return { topics, issues };
}
export async function readTopicWorkbook(file: File) {
  if (!/\.xlsx$/i.test(file.name))
    throw new Error("Choose an .xlsx file using the Cadence template.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Choose an Excel file smaller than 5 MB.");
  const { readSheet } = await import("read-excel-file/browser");
  try {
    return await readSheet(file, "Topics");
  } catch {
    throw new Error(
      "Could not read the “Topics” worksheet. Use the official Cadence .xlsx template.",
    );
  }
}
export function appendImportedTopics(
  data: Data,
  rows: unknown[][],
  selection: { skillId: string; newName: string },
) {
  const name = selection.newName.trim();
  let skill = data.skills.find((skill) => skill.id === selection.skillId);
  let created: Skill | undefined;
  if (selection.skillId === "new") {
    if (!name || name.length > 100)
      throw new Error("Enter a skill name between 1 and 100 characters.");
    skill = data.skills.find(
      (skill) => normalizeName(skill.name) === normalizeName(name),
    );
    if (!skill)
      skill = created = {
        id: uid(),
        name,
        targetHours: 0,
        color: COLORS[data.skills.length % COLORS.length],
        createdAt: new Date().toISOString(),
      };
  }
  if (!skill) throw new Error("Select an existing skill or create a new one.");
  const { topics, issues } = validateTopicRows(
    rows,
    data.topics.filter((topic) => topic.skillId === skill.id),
  );
  if (issues.length)
    throw new Error(
      issues.map((issue) => `Row ${issue.row}: ${issue.message}`).join("\n"),
    );
  const last = Math.max(
    -1,
    ...data.topics.map((topic, index) => topic.sortOrder ?? index),
  );
  if (last + topics.length > 2147483647)
    throw new Error("The topic ordering limit has been reached.");
  const stamp = new Date().toISOString();
  return {
    ...data,
    skills: created ? [...data.skills, created] : data.skills,
    topics: [
      ...data.topics,
      ...topics.map((topic, index) => ({
        id: uid(),
        skillId: skill.id,
        name: topic.name,
        priority: topic.priority,
        sortOrder: last + index + 1,
        completedAt: null,
        createdAt: stamp,
      })),
    ],
  };
}
