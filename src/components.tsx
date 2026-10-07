import { useEffect, useRef, ReactNode } from "react";
import { X, Sparkle } from "@phosphor-icons/react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`glass ${className}`}>{children}</section>;
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Sparkle size={28} weight="duotone" />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Progress({ value, color }: { value: number; color?: string }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label="Progress"
      aria-valuenow={Math.min(100, value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${Math.min(100, value)}%`, background: color }} />
    </div>
  );
}
export function Ring({ value }: { value: number }) {
  return (
    <div
      className="ring"
      style={{
        background: `conic-gradient(#60e4cb 0%, #829dff ${value}%, rgba(158,175,220,.2) ${value}% 100%)`,
      }}
    >
      <div>{value}%</div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  className,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-head">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
const tooltipStyle = {
  background: "#18223f",
  border: "1px solid #596889",
  borderRadius: 14,
  color: "#eef2ff",
};
export function HoursChart({
  points,
  target,
}: {
  points: { label: string; hours: number; date?: string }[];
  target?: number;
}) {
  return (
    <div className="chart" aria-label="Study hours chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={points}
          margin={{ top: 24, right: 4, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="bar-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#68cdbb" />
              <stop offset="100%" stopColor="#405589" />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fill: "#a5b2cd", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            minTickGap={12}
          />
          <YAxis
            hide
            domain={[0, (max: number) => Math.max(target || 0, max * 1.2, 1)]}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "rgba(170,205,255,.05)" }}
            formatter={(v) => {
              const hours = Number(v);
              return [
                hours < 1
                  ? `${Number((hours * 60).toFixed(1))}m`
                  : `${Number(hours.toFixed(1))}h`,
                "Studied",
              ];
            }}
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload.date || payload?.[0]?.payload.label
            }
          />
          {target ? (
            <ReferenceLine y={target} stroke="#7182aa" strokeDasharray="3 3" />
          ) : null}
          <Bar
            dataKey="hours"
            fill="url(#bar-gradient)"
            radius={[10, 10, 3, 3]}
            maxBarSize={56}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function LearningChart({
  points,
}: {
  points: { label: string; progress: number }[];
}) {
  return (
    <div className="chart learning-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points}
          margin={{ top: 10, left: 0, right: 4, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke="#35405f" />
          <XAxis
            dataKey="label"
            minTickGap={60}
            tick={{ fill: "#a5b2cd", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            width={38}
            tick={{ fill: "#a5b2cd", fontSize: 12 }}
            tickFormatter={(v) => `${v}%`}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v) => [`${v}%`, "Completed"]}
          />
          <Area
            dataKey="progress"
            type="linear"
            stroke="#7ef1d5"
            strokeWidth={2.5}
            fill="#67b6be"
            fillOpacity={0.16}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
