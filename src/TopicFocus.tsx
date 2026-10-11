import { useState } from "react";
import { Data, Topic, incompleteTopics, minutesLabel } from "./model";
import { ArrowRight, Check, PencilSimple, Play, Plus } from "@phosphor-icons/react";
import { Empty } from "./components";

export function TopicFocus({
  data,
  topics,
  pinned,
  onPin,
  skillId,
  onStart,
  onLog,
  onPlan,
}: {
  data: Data;
  topics: Topic[];
  pinned: string[];
  onPin: (ids: string[]) => void;
  skillId: string | null;
  onStart: (topic: Topic) => void;
  onLog: (topic: Topic) => void;
  onPlan: () => void;
}) {
  const [picking, setPicking] = useState(false),
    [query, setQuery] = useState("");
  if (picking) {
    const q = query.trim().toLowerCase(),
      scoped = incompleteTopics(data).filter(
        (t) => !skillId || t.skillId === skillId,
      ),
      chosen = pinned.filter((id) => scoped.some((t) => t.id === id)),
      others = pinned.filter((id) => !chosen.includes(id)),
      options = scoped.filter((t) => !q || t.name.toLowerCase().includes(q));
    const toggle = (id: string) =>
      onPin([
        ...others,
        ...(chosen.includes(id)
          ? chosen.filter((x) => x !== id)
          : chosen.length < 3
            ? [...chosen, id]
            : chosen),
      ]);
    return (
      <div className="focus-list topic-focus">
        <input
          type="search"
          aria-label="Search topics to focus on"
          placeholder="Search topics"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="muted">{chosen.length}/3 chosen · the rest fill in automatically</p>
        <div style={{ maxHeight: 320, overflowY: "auto", display: "grid", gap: 8 }}>
          {options.map((t) => {
            const skill = data.skills.find((s) => s.id === t.skillId)!,
              on = chosen.includes(t.id),
              full = !on && chosen.length >= 3;
            return (
              <button
                type="button"
                key={t.id}
                className={`focus-row inset chip ${on ? "chosen" : ""}`}
                aria-pressed={on}
                disabled={full}
                onClick={() => toggle(t.id)}
                style={{ textAlign: "left" }}
              >
                <span className="focus-index" style={{ borderColor: skill.color }}>
                  {on ? <Check size={14} /> : null}
                </span>
                <div className="row-copy">
                  <strong>{t.name}</strong>
                  <p>
                    {skill.name} · {t.priority || "Medium"} priority
                  </p>
                </div>
              </button>
            );
          })}
          {!options.length && <p className="muted">No matching topics.</p>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={() => onPin(others)}>
            Reset to default
          </button>
          <button
            className="secondary full"
            onClick={() => {
              setPicking(false);
              setQuery("");
            }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }
  if (!topics.length)
    return (
      <Empty
        title={
          data.topics.length ? "All topics complete" : "Nothing planned yet"
        }
        description={
          data.topics.length
            ? "Add more topics when you’re ready for your next step."
            : "Add or import topics to build your learning queue."
        }
        action={
          <button className="secondary" onClick={onPlan}>
            Plan today’s study <ArrowRight size={17} />
          </button>
        }
      />
    );
  return (
    <div className="focus-list topic-focus">
      {topics.map((topic, index) => {
        const skill = data.skills.find((skill) => skill.id === topic.skillId)!;
        return (
          <div className="focus-row inset" key={topic.id}>
            <span className="focus-index" style={{ borderColor: skill.color }}>
              {index + 1}
            </span>
            <div className="row-copy">
              <strong>{topic.name}</strong>
              <p>
                {skill.name} · {topic.priority || "Medium"} priority
                {topic.stoppedAt ? ` · resume at ${minutesLabel(topic.stoppedAt)}` : ""}
              </p>
            </div>
            <button
              className="icon-button"
              aria-label={`Log time for ${topic.name}`}
              onClick={() => onLog(topic)}
            >
              <Plus size={17} />
            </button>
            <button
              className="play-button"
              aria-label={`Start topic ${topic.name}`}
              onClick={() => onStart(topic)}
            >
              <Play weight="fill" size={17} />
            </button>
          </div>
        );
      })}
      <button className="secondary full" onClick={() => setPicking(true)}>
        <PencilSimple size={17} /> Choose my 3 topics
      </button>
      <button className="secondary full" onClick={onPlan}>
        Plan today’s study <ArrowRight size={17} />
      </button>
    </div>
  );
}
