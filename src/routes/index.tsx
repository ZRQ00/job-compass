import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, BellRing, Send, Target, Trophy } from "lucide-react";
import { Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { parseDay, STATUS_META, STATUSES } from "@/lib/jobs";
import { useUpdateStatus } from "@/hooks/useJobMutations";
import { JobBoardsCard } from "@/components/JobBoards";
import { SettingEditor } from "@/components/SettingEditor";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard · Job Compass" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: s, error } = useQuery({
    queryKey: ["stats"],
    queryFn: api.stats,
    refetchOnWindowFocus: true,
  });
  const updateStatus = useUpdateStatus();

  const goalPct = s
    ? Math.min(100, Math.round((100 * s.applied_this_week) / Math.max(1, s.weekly_goal)))
    : 0;
  const pipeline = s ? STATUSES.map((st) => ({ status: st, n: s.by_status[st] ?? 0 })) : [];
  const pipelineTotal = pipeline.reduce((a, b) => a + b.n, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">What needs your attention today.</p>
        </div>
        <Link
          to="/tracker"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Open tracker <ArrowRight className="size-4" />
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" /> {(error as Error).message}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          label="This week"
          icon={Target}
          value={s ? `${s.applied_this_week}/${s.weekly_goal}` : "—"}
          sub={
            s && s.applied_this_week >= s.weekly_goal
              ? "goal hit this week"
              : s
                ? `${s.weekly_goal - s.applied_this_week} to go this week`
                : "applications vs goal"
          }
          action={
            <SettingEditor
              setting="weekly_goal"
              value={s?.weekly_goal}
              title="Weekly application goal"
              unit="per week"
              min={1}
              max={200}
              presets={[5, 10, 15, 20, 30]}
              ariaLabel="Change weekly goal"
            />
          }
        >
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${goalPct}%` }}
            />
          </div>
        </Kpi>
        <Kpi
          label="In progress"
          icon={Send}
          value={s ? (s.by_status.applied ?? 0) + (s.by_status.interview ?? 0) : "—"}
          sub="applied + interviewing"
        />
        <Kpi
          label="Response rate"
          icon={BellRing}
          value={s?.response_rate != null ? `${s.response_rate}%` : "—"}
          sub="applications that got an interview"
        />
        <Kpi
          label="Offers"
          icon={Trophy}
          value={s?.by_status.offer ?? "—"}
          sub={s ? `${s.total} jobs tracked` : ""}
        />
      </div>

      {/* Pipeline bar */}
      {s && pipelineTotal > 0 && (
        <section className="rounded-xl border border-border bg-card/40 p-5">
          <h2 className="mb-3 font-display font-semibold">Pipeline</h2>
          <div className="flex h-3 overflow-hidden rounded-full bg-border">
            {pipeline
              .filter((p) => p.n > 0)
              .map((p) => (
                <div
                  key={p.status}
                  className={STATUS_META[p.status].dot}
                  style={{ width: `${(100 * p.n) / pipelineTotal}%` }}
                  title={`${STATUS_META[p.status].label}: ${p.n}`}
                />
              ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {pipeline.map((p) => (
              <Link
                key={p.status}
                to="/tracker"
                search={{ status: p.status }}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <span className={cn("size-2 rounded-full", STATUS_META[p.status].dot)} />
                {STATUS_META[p.status].label}
                <span className="font-medium tabular-nums text-foreground">{p.n}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Follow-ups */}
        <section className="rounded-xl border border-border bg-card/40 p-5">
          <div className="mb-1 flex items-center gap-2">
            <BellRing className="size-4 text-warning" />
            <h2 className="font-display font-semibold">Follow up</h2>
            <span className="ml-auto order-last">
              <SettingEditor
                setting="follow_up_after_days"
                value={s?.follow_up_after_days}
                title="Follow up after"
                unit="days"
                min={1}
                max={90}
                presets={[5, 7, 10, 14, 21]}
                ariaLabel="Change follow-up timing"
              />
            </span>
            {s && s.follow_ups.length > 0 && (
              <span className="rounded-full bg-warning/15 px-2 text-xs text-warning">
                {s.follow_ups.length}
              </span>
            )}
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Applied {s?.follow_up_after_days ?? 7}+ days ago with no movement. Nudge the recruiter,
            or close it out.
          </p>
          {!s || s.follow_ups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing waiting. Nice.</p>
          ) : (
            <ul className="divide-y divide-border">
              {s.follow_ups.slice(0, 8).map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5">
                  <Link
                    to="/tracker/$jobId"
                    params={{ jobId: String(f.id) }}
                    className="min-w-0 flex-1 hover:underline"
                  >
                    <div className="truncate text-sm font-medium">{f.company}</div>
                    <div className="truncate text-xs text-muted-foreground">{f.role}</div>
                  </Link>
                  <span
                    className={cn(
                      "shrink-0 text-xs tabular-nums",
                      f.days_waiting >= 21 ? "text-destructive" : "text-warning",
                    )}
                  >
                    {f.days_waiting}d
                  </span>
                  <button
                    onClick={() => updateStatus.mutate({ id: f.id, status: "rejected" })}
                    className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                    title="Mark as rejected / ghosted"
                  >
                    Ghosted
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <JobBoardsCard />
      </div>

      {/* Weekly activity */}
      {s && (
        <section className="rounded-xl border border-border bg-card/40 p-5">
          <h2 className="font-display font-semibold">Applications per week</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Last 8 weeks, by date applied. Dashed line is your weekly goal.
          </p>
          <div className="h-40 text-primary">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={s.weekly_activity.map((w) => ({
                  ...w,
                  label: parseDay(w.week_start)?.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  }),
                }))}
              >
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#8b93a7" }}
                />
                <Tooltip
                  cursor={{ fill: "#ffffff", opacity: 0.05 }}
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(l) => `Week of ${l}`}
                  formatter={(v) => [v, "Applied"]}
                />
                <YAxis hide domain={[0, (max: number) => Math.max(max, s.weekly_goal) + 1]} />
                <ReferenceLine
                  y={s.weekly_goal}
                  stroke="#8b93a7"
                  strokeDasharray="4 4"
                  label={{
                    value: `goal ${s.weekly_goal}`,
                    position: "insideTopRight",
                    fill: "#8b93a7",
                    fontSize: 11,
                  }}
                />
                <Bar dataKey="applied" fill="currentColor" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  action,
  children,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  icon: typeof Target;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="flex items-center gap-1">
          {action}
          <Icon className="size-4 text-muted-foreground" />
        </span>
      </div>
      <div className="font-display text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      {children}
    </div>
  );
}
