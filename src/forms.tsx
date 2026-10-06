import { useState } from "react";
import { Check, ArrowRight, PencilSimple, Trash } from "@phosphor-icons/react";
import {
  Data,
  Skill,
  Topic,
  COLORS,
  SUGGESTIONS,
  uid,
  isTopicComplete,
  parseDuration,
  minutesLabel,
  videoProgress,
} from "./model";
import { Empty } from "./components";
export function Setup({
  target,
  onSave,
}: {
  target: number;
  onSave: (target: number, names: string[], topics: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [custom, setCustom] = useState(""),
    [topics, setTopics] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const names = [
          ...new Set([
            ...selected,
            ...custom
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          ]),
        ];
        onSave(Number(fd.get("target")), names, [
          ...new Set(
            topics
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        ]);
      }}
    >
      <p>
        Small steps. Real progress. Set a daily goal and choose the skills you
        want to build.
      </p>
      <label className="field-label" htmlFor="setup-target">
        DAILY TARGET IN MINUTES
      </label>
      <input
        id="setup-target"
        name="target"
        type="number"
        min="1"
        max="1440"
        required
        defaultValue={target}
      />
      <label className="field-label">CHOOSE YOUR SKILLS (OPTIONAL)</label>
      <div className="skill-chips">
        {SUGGESTIONS.map((name, i) => (
          <button
            key={name}
            type="button"
            className={`chip ${selected.includes(name) ? "chosen" : ""}`}
            onClick={() =>
              setSelected((s) =>
                s.includes(name) ? s.filter((x) => x !== name) : [...s, name],
              )
            }
          >
            <span
              className="dot"
              style={{
                background: COLORS[i],
              }}
            />
            {name}
            {selected.includes(name) && <Check size={14} />}
          </button>
        ))}
      </div>
      <label className="field-label" htmlFor="custom-skills">
        OR ADD YOUR OWN · ONE PER LINE
      </label>
      <textarea
        id="custom-skills"
        placeholder="Skills you want to learn"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        maxLength={1000}
      />
      <label className="field-label" htmlFor="setup-topics">
        TOPICS FOR YOUR FIRST SKILL (OPTIONAL)
      </label>
      <textarea
        id="setup-topics"
        placeholder="One topic per line"
        value={topics}
        onChange={(e) => setTopics(e.target.value)}
        maxLength={4000}
      />
      <p className="footnote">
        Everything starts at zero. You can set target hours and add more topics
        in Skills.
      </p>
      <button type="submit" className="primary full">
        Create my study space
        <ArrowRight size={18} />
      </button>
    </form>
  );
}
export function SkillForm({
  skill,
  color,
  onSave,
}: {
  skill?: Skill;
  color: string;
  onSave: (skill: Skill, topics: string[]) => void;
}) {
  const [chosen, setChosen] = useState(skill?.color || color),
    [problem, setProblem] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const lengthText = String(fd.get("video") || "").trim(),
          videoMinutes = lengthText ? parseDuration(lengthText) : null;
        if (lengthText && (!videoMinutes || videoMinutes > 600000)) {
          setProblem("Enter the video length like 12:30, 12h 30m or 750.");
          return;
        }
        setProblem("");
        const position = Math.min(
          videoMinutes || 0,
          skill?.videoPosition || 0,
        );
        onSave(
          {
            id: skill?.id || uid(),
            name: String(fd.get("name")).trim(),
            targetHours: Number(fd.get("hours")),
            color: chosen,
            ...(videoMinutes
              ? { videoMinutes, videoPosition: position }
              : { videoMinutes: null, videoPosition: 0 }),
            createdAt: skill?.createdAt || new Date().toISOString(),
          },
          [
            ...new Set(
              String(fd.get("topics") || "")
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            ),
          ],
        );
      }}
    >
      <label className="field-label" htmlFor="skill-name">
        SKILL NAME
      </label>
      <input
        id="skill-name"
        name="name"
        maxLength={100}
        required
        defaultValue={skill?.name}
        placeholder="What would you like to learn?"
        pattern=".*\S.*"
      />
      <label className="field-label" htmlFor="skill-hours">
        TARGET HOURS
      </label>
      <input
        id="skill-hours"
        name="hours"
        type="number"
        required
        min="0"
        max="100000"
        step="any"
        defaultValue={skill?.targetHours || 0}
      />
      <p className="footnote">
        Set 0 if you prefer to track topics without an hours target.
      </p>
      <label className="field-label" htmlFor="skill-video">
        VIDEO COURSE LENGTH (OPTIONAL)
      </label>
      <input
        id="skill-video"
        name="video"
        autoComplete="off"
        placeholder="e.g. 12:30 or 12h 30m"
        defaultValue={
          skill?.videoMinutes ? minutesLabel(skill.videoMinutes) : ""
        }
      />
      <p className="footnote">
        Learning from a video? Enter its total length and track progress by
        where you stop watching, instead of topics.
      </p>
      {problem && (
        <p className="form-error" role="alert">
          {problem}
        </p>
      )}
      <label className="field-label" htmlFor="skill-color">
        SKILL COLOR
      </label>
      <div className="color-picker">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            style={{
              background: c,
            }}
            className={chosen === c ? "chosen" : ""}
            aria-label={`Select color ${c}`}
            aria-pressed={chosen === c}
            onClick={() => setChosen(c)}
          >
            {chosen === c && <Check color="#111a30" size={18} />}
          </button>
        ))}
        <input
          type="color"
          id="skill-color"
          aria-label="Custom skill color"
          value={chosen}
          onChange={(e) => setChosen(e.target.value)}
        />
      </div>
      {!skill && (
        <>
          <label className="field-label" htmlFor="skill-topics">
            TOPICS · ONE PER LINE (OPTIONAL)
          </label>
          <textarea
            id="skill-topics"
            name="topics"
            maxLength={4000}
            placeholder="Break this skill into small steps"
          />
        </>
      )}
      <button className="primary full">
        {skill ? "Save skill" : "Add skill"}
      </button>
    </form>
  );
}
/** Update where the learner stopped in a video course. Accepts 1:30, 1h 30m or minutes. */
export function VideoPositionForm({
  skill,
  onSave,
}: {
  skill: Skill;
  onSave: (position: number) => void;
}) {
  const v = videoProgress(skill),
    [problem, setProblem] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const position = parseDuration(
          String(new FormData(e.currentTarget).get("position")),
        );
        if (position === null || position > v.total) {
          setProblem(
            `Enter a time between 0 and ${minutesLabel(v.total)}, like 3:20 or 3h 20m.`,
          );
          return;
        }
        onSave(position);
      }}
    >
      <p>
        {skill.name} · {minutesLabel(v.position)} of {minutesLabel(v.total)}{" "}
        watched ({v.percent}%)
      </p>
      <label className="field-label" htmlFor="video-position">
        WHERE DID YOU STOP IN THE VIDEO?
      </label>
      <input
        id="video-position"
        name="position"
        autoComplete="off"
        required
        placeholder="e.g. 3:20 or 3h 20m"
        defaultValue={v.position ? minutesLabel(v.position) : ""}
      />
      {problem && (
        <p className="form-error" role="alert">
          {problem}
        </p>
      )}
      <button className="primary full" style={{ marginTop: 22 }}>
        Save progress
      </button>
    </form>
  );
}
export function TopicManager({
  data,
  skill,
  update,
  notify,
  ask,
  onPlan,
  onImport,
}: {
  data: Data;
  skill: Skill;
  update: (fn: (d: Data) => Data) => Promise<boolean>;
  notify: (s: string) => void;
  ask: (
    title: string,
    desc: string,
    action: () => boolean | Promise<boolean>,
  ) => void;
  onPlan: () => void;
  onImport: () => void;
}) {
  const [editing, setEditing] = useState<Topic | null>(null),
    [name, setName] = useState(""),
    [problem, setProblem] = useState("");
  const topics = data.topics.filter((t) => t.skillId === skill.id);
  return (
    <>
      <p>
        Break your skill into topics. Completed topics determine your learning
        progress.
      </p>
      <div className="topic-management-actions">
        <a
          className="secondary small"
          href="/Cadence_Blank_Topic_Template.xlsx"
          download
        >
          Download Template
        </a>
        <button className="secondary small" onClick={onImport}>
          Import Topics
        </button>
      </div>
      <form
        className="topic-add"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (
            topics.some(
              (t) =>
                t.id !== editing?.id &&
                t.name.toLowerCase() === name.trim().toLowerCase(),
            )
          ) {
            setProblem("This topic already exists.");
            return;
          }
          if (
            await update((d) => ({
              ...d,
              topics: editing
                ? d.topics.map((t) =>
                    t.id === editing.id
                      ? {
                          ...t,
                          name: name.trim(),
                        }
                      : t,
                  )
                : [
                    ...d.topics,
                    {
                      id: uid(),
                      skillId: skill.id,
                      name: name.trim(),
                      createdAt: new Date().toISOString(),
                      completedAt: null,
                    },
                  ],
            }))
          ) {
            setName("");
            setEditing(null);
            setProblem("");
          }
        }}
      >
        <label className="sr-only" htmlFor="topic-name">
          Topic name
        </label>
        <input
          id="topic-name"
          required
          maxLength={200}
          placeholder="Add a topic"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="primary small">{editing ? "Save" : "Add"}</button>
      </form>
      {problem && (
        <p className="form-error" role="alert">
          {problem}
        </p>
      )}
      {editing && (
        <button
          className="text-button"
          onClick={() => {
            setEditing(null);
            setName("");
          }}
        >
          Cancel edit
        </button>
      )}
      {topics.length ? (
        <div className="topic-list">
          {topics.map((t) => {
            const done = isTopicComplete(data, t);
            return (
              <div key={t.id} className="topic-row inset">
                <input
                  type="checkbox"
                  aria-label={`Mark ${t.name} complete`}
                  checked={done}
                  onChange={async () => {
                    if (
                      done &&
                      data.sessions.some(
                        (s) => s.topicId === t.id && s.completed,
                      )
                    ) {
                      ask(
                        "Mark this topic pending?",
                        "This clears its completion checkmark and marks the associated sessions as topic pending. Logged study time is kept.",
                        async () =>
                          await update((d) => ({
                            ...d,
                            topics: d.topics.map((x) =>
                              x.id === t.id
                                ? {
                                    ...x,
                                    completedAt: null,
                                  }
                                : x,
                            ),
                            sessions: d.sessions.map((s) =>
                              s.topicId === t.id
                                ? {
                                    ...s,
                                    completed: false,
                                  }
                                : s,
                            ),
                          })),
                      );
                    } else
                      await update((d) => ({
                        ...d,
                        topics: d.topics.map((x) =>
                          x.id === t.id
                            ? {
                                ...x,
                                completedAt: done
                                  ? null
                                  : new Date().toISOString(),
                              }
                            : x,
                        ),
                      }));
                  }}
                />
                <strong className={done ? "completed-topic" : ""}>
                  {t.name}
                </strong>
                <span className="badge">{t.priority || "Medium"}</span>
                {!done && t.stoppedAt ? (
                  <span className="badge">
                    Resume {minutesLabel(t.stoppedAt)}
                  </span>
                ) : null}
                <button
                  className="icon-button subtle"
                  aria-label={`Edit topic ${t.name}`}
                  onClick={() => {
                    setEditing(t);
                    setName(t.name);
                  }}
                >
                  <PencilSimple size={17} />
                </button>
                <button
                  className="icon-button subtle"
                  aria-label={`Delete topic ${t.name}`}
                  onClick={() =>
                    ask(
                      "Delete this topic?",
                      "Its plans will be removed. Associated sessions and study time will be kept as unlinked history.",
                      async () => {
                        if (data.timer?.topicId === t.id) {
                          notify(
                            "Finish or cancel this topic’s active session first.",
                          );
                          return false;
                        }
                        return await update((d) => ({
                          ...d,
                          topics: d.topics.filter((x) => x.id !== t.id),
                          plans: d.plans.filter((p) => p.topicId !== t.id),
                          sessions: d.sessions.map((s) =>
                            s.topicId === t.id
                              ? {
                                  ...s,
                                  topicId: null,
                                }
                              : s,
                          ),
                        }));
                      },
                    )
                  }
                >
                  <Trash size={17} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty
          title="No topics added"
          description="Map your first step using the field above."
        />
      )}
      {topics.length > 0 && (
        <button className="secondary full" onClick={onPlan}>
          Plan a focus block
          <ArrowRight size={17} />
        </button>
      )}
    </>
  );
}
export function PlanForm({
  data,
  today,
  onSave,
  onAddSkill,
}: {
  data: Data;
  today: string;
  onSave: (id: string, date: string, minutes: number) => void;
  onAddSkill: () => void;
}) {
  const [skillId, setSkillId] = useState(
    data.topics[0]?.skillId || data.skills[0]?.id || "",
  );
  const topics = data.topics.filter((t) => t.skillId === skillId);
  return data.topics.length ? (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave(
          String(f.get("topic")),
          String(f.get("date")),
          Number(f.get("minutes")),
        );
      }}
    >
      <label className="field-label" htmlFor="plan-skill">
        SKILL
      </label>
      <select
        id="plan-skill"
        value={skillId}
        onChange={(e) => setSkillId(e.target.value)}
      >
        {data.skills.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <label className="field-label" htmlFor="plan-topic">
        TOPIC
      </label>
      <select key={skillId} id="plan-topic" name="topic" required>
        {topics.length ? (
          topics.map((t) => (
            <option value={t.id} key={t.id}>
              {t.name}
              {isTopicComplete(data, t) ? " · complete" : ""}
            </option>
          ))
        ) : (
          <option value="">No topics in this skill</option>
        )}
      </select>
      <div className="form-columns">
        <div>
          <label className="field-label" htmlFor="plan-date">
            DATE
          </label>
          <input
            id="plan-date"
            name="date"
            type="date"
            min={today}
            required
            defaultValue={today}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="plan-duration">
            MINUTES
          </label>
          <input
            id="plan-duration"
            type="number"
            name="minutes"
            min="1"
            max="1440"
            required
            defaultValue={45}
          />
        </div>
      </div>
      <button className="primary full" disabled={!topics.length}>
        Plan focus block
      </button>
    </form>
  ) : (
    <Empty
      title="Plan your first topic"
      description="Add a skill and at least one topic before planning your study."
      action={
        <button className="primary small" onClick={onAddSkill}>
          Add a skill
        </button>
      }
    />
  );
}
export function Confirm({
  description,
  strong,
  onCancel,
  onConfirm,
}: {
  description: string;
  strong?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <>
      <p>{description}</p>
      {strong && (
        <>
          <label className="field-label" htmlFor="confirm-delete">
            TYPE DELETE TO CONFIRM
          </label>
          <input
            id="confirm-delete"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </>
      )}
      <div className="dialog-actions">
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="danger"
          disabled={strong && text !== "DELETE"}
          onClick={onConfirm}
        >
          Confirm
        </button>
      </div>
    </>
  );
}
export function formatSeconds(value: number) {
  const n = Math.floor(value);
  return `${Math.floor(n / 3600) ? `${String(Math.floor(n / 3600)).padStart(2, "0")}:` : ""}${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
export function FinishSession({
  seconds,
  topic,
  video,
  resumeAt,
  trackStop,
  onSave,
}: {
  seconds: number;
  topic: string;
  video?: Skill;
  /** Current saved stop point of the topic, in minutes. */
  resumeAt?: number | null;
  /** True for topic-based skills, where each topic can be a video with its own stop point. */
  trackStop?: boolean;
  onSave: (
    notes: string,
    complete: boolean,
    videoPosition?: number,
    topicStoppedAt?: number,
  ) => void;
}) {
  const [problem, setProblem] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        let position: number | undefined;
        if (video) {
          const text = String(f.get("position") || "").trim();
          if (text) {
            const parsed = parseDuration(text);
            if (parsed === null || parsed > videoProgress(video).total) {
              setProblem(
                `Enter a time between 0 and ${minutesLabel(video.videoMinutes || 0)}, like 3:20.`,
              );
              return;
            }
            position = parsed;
          }
        }
        let stoppedAt: number | undefined;
        if (trackStop) {
          const text = String(f.get("stopped") || "").trim();
          if (text) {
            const parsed = parseDuration(text);
            if (parsed === null || parsed > 600000) {
              setProblem("Enter where you stopped like 45:10, 1h 20m or 80.");
              return;
            }
            stoppedAt = parsed;
          }
        }
        setProblem("");
        onSave(
          String(f.get("notes") || ""),
          f.get("complete") === "on",
          position,
          stoppedAt,
        );
      }}
    >
      <p>{topic}</p>
      <div className="finish-time">{formatSeconds(seconds)}</div>
      <p className="footnote">
        Your actual elapsed time will be saved to the date this session started.
        The timer keeps running until you save or pause it.
      </p>
      {video && (
        <>
          <label className="field-label" htmlFor="finish-position">
            STOPPED AT IN VIDEO (OPTIONAL)
          </label>
          <input
            id="finish-position"
            name="position"
            autoComplete="off"
            placeholder={`Now at ${minutesLabel(videoProgress(video).position)} of ${minutesLabel(videoProgress(video).total)}`}
          />
          {problem && (
            <p className="form-error" role="alert">
              {problem}
            </p>
          )}
        </>
      )}
      {trackStop && (
        <>
          <label className="field-label" htmlFor="finish-stopped">
            STOPPED AT IN VIDEO (OPTIONAL)
          </label>
          <input
            id="finish-stopped"
            name="stopped"
            autoComplete="off"
            placeholder={
              resumeAt
                ? `Last stopped at ${minutesLabel(resumeAt)}`
                : "e.g. 45:10 or 1h 20m"
            }
          />
          {problem && (
            <p className="form-error" role="alert">
              {problem}
            </p>
          )}
        </>
      )}
      <label className="field-label" htmlFor="finish-notes">
        NOTES
      </label>
      <textarea
        name="notes"
        id="finish-notes"
        maxLength={10000}
        placeholder="What did you learn?"
      />
      <label className="switch-row inset">
        <span>Mark topic complete</span>
        <input role="switch" type="checkbox" name="complete" />
      </label>
      <button className="primary full">Save study session</button>
    </form>
  );
}
