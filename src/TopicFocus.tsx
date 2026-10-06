import { Data, Topic, minutesLabel } from "./model";
import { ArrowRight, Play, Plus } from "@phosphor-icons/react";
import { Empty } from "./components";

export function TopicFocus({
  data,
  topics,
  onStart,
  onLog,
  onPlan,
}: {
  data: Data;
  topics: Topic[];
  onStart: (topic: Topic) => void;
  onLog: (topic: Topic) => void;
  onPlan: () => void;
}) {
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
      <button className="secondary full" onClick={onPlan}>
        Plan today’s study <ArrowRight size={17} />
      </button>
    </div>
  );
}
