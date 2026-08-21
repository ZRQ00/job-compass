import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Job, JobStatus, STATUS_LABELS } from "@/lib/api";
import { JobDetailDialog } from "@/components/JobDetailDialog";
import { Loader2, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, Search, Plus, Info } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

const STATUSES: JobStatus[] = ["found", "applied", "interview", "offer", "rejected"];
const PAGE_SIZE = 15;
const MAX_SORT_LEVELS = 3;

const STATUS_DOT: Record<JobStatus, string> = {
  found: "bg-info",
  applied: "bg-primary",
  interview: "bg-warning",
  offer: "bg-success",
  rejected: "bg-destructive",
  skipped: "bg-muted-foreground",
};

type SortKey = "title" | "company" | "status" | "date" | "score";
type SortDir = "asc" | "desc";
type SortCriterion = { key: SortKey; dir: SortDir };

const SORT_LABELS: Record<SortKey, string> = {
  title: "Title",
  company: "Company",
  status: "Status",
  date: "Date",
  score: "Match",
};

function defaultDir(key: SortKey): SortDir {
  return key === "score" || key === "date" ? "desc" : "asc";
}

function getDate(job: Job): number {
  const raw = job.date_posted ?? job.created_at;
  const t = raw ? new Date(raw).getTime() : 0;
  return Number.isNaN(t) ? 0 : t;
}

function getScore(job: Job): number {
  return job.reasoning_score ?? job.fit_score ?? -1;
}

function compareByKey(a: Job, b: Job, key: SortKey): number {
  if (key === "title") return (a.title ?? "").localeCompare(b.title ?? "");
  if (key === "company") return (a.company ?? "").localeCompare(b.company ?? "");
  if (key === "status") return a.status.localeCompare(b.status);
  if (key === "score") return getScore(a) - getScore(b);
  // Truncate to calendar-day precision so same-day jobs actually tie,
  // matching what's shown in the Date column (which only shows the date, not time).
  const dayA = Math.floor(getDate(a) / 86_400_000);
  const dayB = Math.floor(getDate(b) / 86_400_000);
  return dayA - dayB;
}

function scoreColor(score: number) {
  if (score >= 75) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-destructive";
}

export const Route = createFileRoute("/tracker")({
  head: () => ({ meta: [{ title: "Tracker — Job Compass" }] }),
  component: Tracker,
});

function SortHeader({
  label,
  sortKey,
  sorts,
  onClick,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  sorts: SortCriterion[];
  onClick: (key: SortKey, additive: boolean) => void;
  className?: string;
}) {
  const index = sorts.findIndex((s) => s.key === sortKey);
  const active = index !== -1;
  const dir = active ? sorts[index].dir : undefined;

  return (
    <th className={`text-left font-medium text-xs text-muted-foreground select-none ${className}`}>
      <button
        onClick={(e) => onClick(sortKey, e.shiftKey)}
        title="Click to sort. Shift+click to add as a tiebreaker."
        className="flex items-center gap-1 py-2 hover:text-foreground transition-colors"
      >
        {label}
        {active ? (
          <span className="flex items-center gap-0.5">
            {dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            {sorts.length > 1 && (
              <span className="text-[9px] tabular-nums opacity-70 leading-none">{index + 1}</span>
            )}
          </span>
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function Tracker() {
  const [selected, setSelected] = useState<string | number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [sorts, setSorts] = useState<SortCriterion[]>([{ key: "score", dir: "desc" }]);
  const [page, setPage] = useState(1);
  const qc = useQueryClient();

  const queries = useQueries({
    queries: STATUSES.map((status) => ({
      queryKey: ["jobs", status],
      queryFn: () => api.jobsByStatus(status),
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const allJobs: Job[] = useMemo(
    () => queries.flatMap((q) => q.data ?? []),
    [queries]
  );

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string | number; status: JobStatus }) =>
      api.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    let rows = allJobs;
    if (statusFilter !== "all") rows = rows.filter((j) => j.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (j) => j.title?.toLowerCase().includes(q) || j.company?.toLowerCase().includes(q)
      );
    }
    const sorted = [...rows].sort((a, b) => {
      for (const { key, dir } of sorts) {
        const cmp = compareByKey(a, b, key);
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
    return sorted;
  }, [allJobs, statusFilter, search, sorts]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (key: SortKey, additive: boolean) => {
    setPage(1);
    setSorts((prev) => {
      const idx = prev.findIndex((s) => s.key === key);

      if (!additive) {
        // Plain click: this becomes the only sort. If it already was the sole
        // sort, toggle its direction instead of resetting it.
        if (prev.length === 1 && prev[0].key === key) {
          return [{ key, dir: prev[0].dir === "asc" ? "desc" : "asc" }];
        }
        return [{ key, dir: defaultDir(key) }];
      }

      // Shift+click: toggle this key's direction if it's already part of the
      // sort, otherwise append it as the next tiebreaker (capped at 3 levels).
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { key, dir: next[idx].dir === "asc" ? "desc" : "asc" };
        return next;
      }
      if (prev.length >= MAX_SORT_LEVELS) return prev;
      return [...prev, { key, dir: defaultDir(key) }];
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">Tracker</h1>
        <p className="text-muted-foreground mt-1">All your applications in one list.</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search title or company…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-card/40 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as JobStatus | "all"); setPage(1); }}
          className="px-3 py-2 text-sm rounded-lg border border-border bg-card/40 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {filtered.length} job{filtered.length === 1 ? "" : "s"}
        </span>

        <Link
          to="/tracker/new"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="size-3.5" />
          Add job
        </Link>
      </div>

      {/* Active sort summary */}
      {sorts.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Sorted by {sorts.map((s, i) => `${i + 1}. ${SORT_LABELS[s.key]} (${s.dir === "desc" ? "high → low" : "low → high"})`).join("  ·  ")}
          {"  ·  "}
          <button onClick={() => setSorts([{ key: "score", dir: "desc" }])} className="underline underline-offset-2 hover:text-foreground">
            Reset
          </button>
        </p>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card/60 border-b border-border">
            <tr>
              <SortHeader label="Title" sortKey="title" sorts={sorts} onClick={handleSort} className="pl-4" />
              <SortHeader label="Company" sortKey="company" sorts={sorts} onClick={handleSort} />
              <SortHeader label="Status" sortKey="status" sorts={sorts} onClick={handleSort} />
              <SortHeader label="Match" sortKey="score" sorts={sorts} onClick={handleSort} />
              <SortHeader label="Date" sortKey="date" sorts={sorts} onClick={handleSort} className="pr-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-10 text-center">
                  <Loader2 className="size-4 animate-spin text-muted-foreground inline" />
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-muted-foreground text-xs">
                  No jobs match your filters.
                </td>
              </tr>
            ) : (
              pageRows.map((job) => {
                const score = getScore(job);
                return (
                  <tr
                    key={job.id}
                    onClick={() => setSelected(job.id)}
                    className="hover:bg-accent/40 cursor-pointer transition-colors"
                  >
                    <td className="pl-4 py-2.5 font-medium">{job.title ?? "Untitled"}</td>
                    <td className="py-2.5 text-muted-foreground">{job.company ?? "—"}</td>
                    <td className="py-2.5" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={job.status}
                        onChange={(e) =>
                          updateStatus.mutate({ id: job.id, status: e.target.value as JobStatus })
                        }
                        className="text-xs rounded-md border border-border bg-background pl-2 pr-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                      <span className={`inline-block size-1.5 rounded-full ml-1.5 ${STATUS_DOT[job.status]}`} />
                    </td>
                    <td className="py-2.5">
                      {score >= 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <span className={`font-medium tabular-nums ${scoreColor(score)}`}>{score}%</span>
                          {job.fit_reasoning && (
                            <span title={job.fit_reasoning}>
                              <Info className="size-3.5 text-muted-foreground cursor-help" />
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="pr-4 py-2.5 text-muted-foreground tabular-nums">
                      {getDate(job) ? new Date(getDate(job)).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">{page} / {totalPages}</span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}

      <JobDetailDialog
        jobId={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </div>
  );
}