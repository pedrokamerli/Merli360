import { clsx } from "clsx";

type Props = {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "danger";
};

export function MetricCard({ label, value, hint, tone = "default" }: Props) {
  return (
    <div className={clsx("metric-card", `metric-card-${tone}`)}>
      <div className="metric-card-inner">
        <div
          className={clsx(
            "metric-card-badge",
            tone === "good" && "bg-emerald-100 text-emerald-600",
            tone === "warn" && "bg-amber-100 text-amber-600",
            tone === "danger" && "bg-rose-100 text-rose-600",
            tone === "default" && "bg-violet-100 text-violet-600"
          )}
        >
          R$
        </div>
        <div className="metric-card-body">
          <p className="metric-card-label">{label}</p>
          <p className="metric-card-value">{value}</p>
          {hint ? (
            <p
              className={clsx(
                "metric-card-hint",
                tone === "danger" ? "text-rose-500" : tone === "warn" ? "text-amber-600" : "text-emerald-600"
              )}
            >
              {hint}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
