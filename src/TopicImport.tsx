import { useEffect, useRef, useState } from "react";
import { Data } from "./model";
import {
  appendImportedTopics,
  normalizeName,
  readTopicWorkbook,
  TOPIC_PROMPT,
  validateTopicRows,
} from "./utils/topic-import";
import type { StudyUpdate } from "./store";

export function TemplateHelp() {
  const [message, setMessage] = useState("");
  return (
    <div className="template-help">
      <a
        className="secondary small"
        href="/Cadence_Blank_Topic_Template.xlsx"
        download
      >
        Download Template
      </a>
      <details>
        <summary>How to create your topic list</summary>
        <ol>
          <li>Download the template.</li>
          <li>Copy the prompt below.</li>
          <li>Replace {"{skill}"} with your skill.</li>
          <li>Attach the template to ChatGPT.</li>
          <li>Download the completed Excel.</li>
          <li>Upload it here.</li>
        </ol>
        <p className="topic-prompt">{TOPIC_PROMPT}</p>
        <button
          type="button"
          className="secondary small"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(TOPIC_PROMPT);
              setMessage("Prompt copied.");
            } catch {
              setMessage(
                "Copy the displayed prompt manually; clipboard access is unavailable.",
              );
            }
          }}
        >
          Copy
        </button>
        {message && <p role="status">{message}</p>}
      </details>
    </div>
  );
}
export function TopicImport({
  data,
  initialSkillId,
  ready,
  update,
  onDone,
  onCancel,
}: {
  data: Data;
  initialSkillId?: string;
  ready: boolean;
  update: StudyUpdate;
  onDone: (skillId: string, count: number) => void;
  onCancel: () => void;
}) {
  const [skillId, setSkillId] = useState(
    initialSkillId || data.skills[0]?.id || "new",
  );
  const [newName, setNewName] = useState(""),
    [rows, setRows] = useState<unknown[][] | null>(null);
  const [fileName, setFileName] = useState(""),
    [problem, setProblem] = useState(""),
    [reading, setReading] = useState(false);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const skill =
    skillId === "new"
      ? data.skills.find(
          (skill) => normalizeName(skill.name) === normalizeName(newName),
        )
      : data.skills.find((skill) => skill.id === skillId);
  const preview = rows
    ? validateTopicRows(
        rows,
        data.topics.filter((topic) => topic.skillId === skill?.id),
      )
    : null;
  const validSelection =
    !!skill ||
    (skillId === "new" && !!newName.trim() && newName.trim().length <= 100);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setProblem("");
        if (
          !ready ||
          !rows ||
          reading ||
          preview?.issues.length ||
          !validSelection
        )
          return;
        let selected = skill;
        let count = 0;
        const ok = await update((current) => {
          const imported = appendImportedTopics(current, rows, {
            skillId,
            newName,
          });
          selected = imported.skills.find(
            (item) =>
              item.id === skillId ||
              normalizeName(item.name) === normalizeName(newName),
          );
          count = imported.topics.length - current.topics.length;
          return imported;
        });
        if (ok && selected) onDone(selected.id, count);
      }}
    >
      <TemplateHelp />
      <label className="field-label" htmlFor="import-skill">
        STEP 1 · SELECT SKILL
      </label>
      <select
        id="import-skill"
        value={skillId}
        disabled={reading}
        onChange={(event) => {
          setSkillId(event.target.value);
          setProblem("");
        }}
      >
        {data.skills.map((skill) => (
          <option key={skill.id} value={skill.id}>
            {skill.name}
          </option>
        ))}
        <option value="new">Create a new skill</option>
      </select>
      {skillId === "new" && (
        <>
          <label className="field-label" htmlFor="import-new-skill">
            NEW SKILL NAME
          </label>
          <input
            id="import-new-skill"
            required
            maxLength={100}
            value={newName}
            disabled={reading}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Name your skill"
          />
          {skill && (
            <p className="footnote">
              This skill already exists. Topics will be added to {skill.name}.
            </p>
          )}
        </>
      )}
      <label className="field-label" htmlFor="topic-workbook">
        STEP 2 · UPLOAD EXCEL
      </label>
      <input
        id="topic-workbook"
        type="file"
        accept=".xlsx"
        disabled={reading}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          const sequence = ++request.current;
          setRows(null);
          setProblem("");
          setFileName(file?.name || "");
          if (!file) return;
          setReading(true);
          try {
            const parsed = await readTopicWorkbook(file);
            if (request.current === sequence) setRows(parsed);
          } catch (error) {
            if (request.current === sequence)
              setProblem(
                error instanceof Error
                  ? error.message
                  : "Could not read this workbook.",
              );
          } finally {
            if (request.current === sequence) setReading(false);
          }
        }}
      />
      {reading && <p role="status">Reading Excel…</p>}
      {fileName && <p className="footnote import-filename">{fileName}</p>}
      {problem && (
        <p role="alert" className="form-error">
          {problem}
        </p>
      )}
      {preview && (
        <section className="import-preview inset">
          <span className="eyebrow">STEP 3 · PREVIEW</span>
          <h3>{skill?.name || newName.trim() || "Choose a skill"}</h3>
          {preview.issues.length ? (
            <div role="alert">
              <p className="form-error">
                Correct these rows before importing. No topics have been saved.
              </p>
              <ul>
                {preview.issues.map((issue, index) => (
                  <li key={index}>
                    Row {issue.row}: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <p>{preview.topics.length} topics found</p>
              <ul className="import-topics">
                {preview.topics.map((topic) => (
                  <li key={topic.row}>
                    <span>✓ {topic.name}</span>
                    <span className="badge">{topic.priority}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      {!ready && (
        <p role="alert" className="form-error">
          Topic import needs the topic priority database update. Apply
          supabase/migrations/202610030002_topic_import.sql, then refresh this
          page.
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={
            !ready ||
            reading ||
            !validSelection ||
            !preview ||
            !!preview.issues.length
          }
        >
          Import {preview?.topics.length || 0} Topics
        </button>
      </div>
    </form>
  );
}
