import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Loader2,
  Plus,
  Rows3,
  Search,
} from "lucide-react";
import { api, type Job, type JobStatus } from "@/lib/api";
import {
  ACTIVE,
  formatDay,
  formatSalary,
  parseDay,
  parseTimestamp,
  scoreTone,
  STATUS_META,
  STATUSES,
} from "@/lib/jobs";
import { StatusSelect } from "@/components/StatusBadge";
import { PipelineBoard } from "@/components/PipelineBoard";
import { useUpdateStatus } from "@/hooks/useJobMutations";
import { cn } from "@/lib/utils";

type Filter = JobStatus | "all" | "active";
type View = "table" | "board";
type SortKey =
  | "company"
  | "role"
  | "location"
  | "salary"
  | "status"
  | "date_applied"
  | "match"
  | "updated";

export const Route = createFileRoute("/tracker")({
  head: () => ({ meta: [{ title: "Tracker · Job Compass" }] }),
  validateSearch: (s: Record<string, unknown>): { status?: Filter } => {
    const v = s.status as Filter | undefined;
    return v && (v === "all" || v === "active" || STATUSES.includes(v as JobStatus))
      ? { status: v }
      : {};
  },
  component: Tracker,
});

const PAGE_SIZE = 25;

function sortValue(j: Job, key: SortKey): string | number {
  switch (key) {
    case "company":
      return j.company.toLowerCase();
    case "role":
      return j.role.toLowerCase();
    case "location":
      return (j.location ?? "~").toLowerCase();
    case "salary":
      return j.salary_max ?? j.salary_min ?? -1;
    case "status":
      return STATUSES.indexOf(j.status);
    case "date_applied":
      return parseDay(j.date_applied)?.getTime() ?? -1;
    case "match":
      return j.match_score ?? -1;
    case "updated":
      return parseTimestamp(j.updated_at)?.getTime() ?? 0;
  }
}

function usePersistentView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>("table");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("tracker-view");
      if (saved === "board" || saved === "table") setView(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);
  return [
    view,
    (v) => {
      setView(v);
      try {
        localStorage.setItem("tracker-view", v);
      } catch {
        /* ignore */
      }
    },
  ];
}

function Tracker() {
  const navigate = useNavigate({ from: "/tracker" });
  const { status: filterParam } = Route.useSearch();
  const filter: Filter = filterParam ?? "active";
  const setFilter = (f: Filter) => navigate({ search: f === "active" ? {} : { status: f } });

  const [view, setView] = usePersistentView();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "updated",
    dir: "desc",
  });
  const [page, setPage] = useState(1);

  const {
    data: jobs = [],
    isLoading,
    error,
  } = useQuery({ queryKey: ["jobs"], queryFn: () => api.jobs() });
  const updateStatus = useUpdateStatus();

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
    jobs.forEach((j) => c[j.status]++);
    return c;
  }, [jobs]);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      [j.company, j.role, j.location, j.notes].some((f) => f?.toLowerCase().includes(q)),
    );
  }, [jobs, search]);

  const rows = useMemo(() => {
    let r = searched;
    if (filter === "active") r = r.filter((j) => ACTIVE.includes(j.status));
    else if (filter !== "all") r = r.filter((j) => j.status === filter);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...r].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  }, [searched, filter, sort]);

  useEffect(() => setPage(1), [filter, search, sort]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : {
            key,
            dir: ["match", "salary", "date_applied", "updated"].includes(key) ? "desc" : "asc",
          },
    );

  const Th = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <th className={cn("py-2 text-left text-xs font-medium text-muted-foreground", className)}>
      <button
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
      >
        {label}
        {sort.key === k ? (
          sort.dir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-30" />
        )}
      </button>
    </th>
  );

  const chips: { id: Filter; label: string; count: number }[] = [
    {
      id: "active",
      label: "Active",
      count: counts.applied + counts.interview + counts.offer,
    },
    ...STATUSES.map((s) => ({ id: s as Filter, label: STATUS_META[s].label, count: counts[s] })),
    { id: "all", label: "All", count: jobs.length },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Tracker</h1>
          <p className="mt-1 text-muted-foreground">
            Every job you've applied to, from sent to signed.
          </p>
        </div>
        <Link
          to="/tracker/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" /> Add job
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, role, notes…"
            className="w-full rounded-lg border border-border bg-card/40 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="ml-auto inline-flex rounded-lg border border-border bg-card/40 p-0.5">
          {(
            [
              ["table", Rows3, "Table"],
              ["board", Columns3, "Board"],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                view === v
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === "table" && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                filter === c.id
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {c.id !== "all" && c.id !== "active" && (
                <span className={cn("size-1.5 rounded-full", STATUS_META[c.id].dot)} />
              )}
              {c.label}
              <span className="tabular-nums opacity-60">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : isLoading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState />
      ) : view === "board" ? (
        <PipelineBoard jobs={searched} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-border bg-card/60">
                <tr>
                  <Th k="company" label="Company" className="pl-4" />
                  <Th k="role" label="Role" />
                  <Th k="location" label="Location" />
                  <Th k="salary" label="Salary" />
                  <Th k="status" label="Status" />
                  <Th k="date_applied" label="Applied" />
                  <Th k="match" label="Match" className="pr-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-muted-foreground">
                      No jobs match this filter.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((job) => (
                    <tr
                      key={job.id}
                      onClick={() =>
                        navigate({ to: "/tracker/$jobId", params: { jobId: String(job.id) } })
                      }
                      className="cursor-pointer transition-colors hover:bg-accent/30"
                    >
                      <td className="py-2.5 pl-4 font-medium">{job.company}</td>
                      <td className="max-w-[260px] truncate py-2.5 text-foreground/85">
                        {job.role}
                      </td>
                      <td className="max-w-[160px] truncate py-2.5 text-muted-foreground">
                        {job.location ?? "—"}
                      </td>
                      <td className="py-2.5 tabular-nums text-muted-foreground">
                        {formatSalary(job.salary_min, job.salary_max) ?? "—"}
                      </td>
                      <td className="py-2.5">
                        <StatusSelect
                          value={job.status}
                          onChange={(s) => updateStatus.mutate({ id: job.id, status: s })}
                        />
                      </td>
                      <td className="py-2.5 tabular-nums text-muted-foreground">
                        {formatDay(job.date_applied) ?? "—"}
                      </td>
                      <td className="py-2.5 pr-4">
                        {job.match_score != null ? (
                          <span
                            className={cn("font-medium tabular-nums", scoreTone(job.match_score))}
                          >
                            {job.match_score}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular-nums">
              {rows.length} job{rows.length === 1 ? "" : "s"}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded px-2 py-1 hover:bg-accent disabled:opacity-30"
                >
                  Prev
                </button>
                <span className="tabular-nums">
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded px-2 py-1 hover:bg-accent disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <h3 className="font-display text-lg font-semibold">No jobs yet</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Found something on a job board? Paste the description and let autofill do the typing.
      </p>
      <Link
        to="/tracker/new"
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        <Plus className="size-4" /> Add your first job
      </Link>
    </div>
  );
}
