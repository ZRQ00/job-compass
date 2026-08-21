import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Job, JobStatus } from "@/lib/api";
import { JobDetailDialog } from "@/components/JobDetailDialog";
import {
  Search,
  Wifi,
  DollarSign,
  Layers,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  BookmarkPlus,
  Building2,
  MapPin,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 12;

const SOURCES = ["linkedin", "indeed", "glassdoor", "zip_recruiter"];

const TECH_OPTIONS = [
  "Python", "TypeScript", "React", "Node.js", "FastAPI",
  "Go", "LangChain", "RAG", "LLM", "Docker", "AWS", "PostgreSQL",
];

const SALARY_OPTIONS = [
  { label: "Any", value: 0 },
  { label: "$100K+", value: 100000 },
  { label: "$120K+", value: 120000 },
  { label: "$150K+", value: 150000 },
  { label: "$180K+", value: 180000 },
  { label: "$200K+", value: 200000 },
];

const DATE_OPTIONS = [
  { label: "Any time", value: 0 },
  { label: "Past 24h", value: 1 },
  { label: "Past 3 days", value: 3 },
  { label: "Past week", value: 7 },
  { label: "Past month", value: 30 },
];

export const Route = createFileRoute("/browse")({
  head: () => ({ meta: [{ title: "Browse — Job Compass" }] }),
  component: Browse,
});

function formatSalary(min?: number | null, max?: number | null): string {
  if (!min && !max) return "";
  const fmt = (n: number) =>
    n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`;
  if (min && max && min !== max) return `${fmt(min)} – ${fmt(max)}`;
  if (max) return `Up to ${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  return "";
}

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function getScore(job: Job): number {
  return job.reasoning_score ?? job.fit_score ?? -1;
}

function scoreColor(score: number) {
  if (score >= 75) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-destructive";
}

function SourceBadge({ source }: { source?: string | null }) {
  const colors: Record<string, string> = {
    linkedin: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    indeed: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    glassdoor: "bg-green-500/10 text-green-400 border-green-500/20",
    zip_recruiter: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };
  const key = source?.toLowerCase() ?? "";
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
        colors[key] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      {source ?? "unknown"}
    </span>
  );
}

function JobCard({
  job,
  onClick,
  onApply,
  onSkip,
}: {
  job: Job;
  onClick: () => void;
  onApply: () => void;
  onSkip: () => void;
}) {
  const salary = formatSalary(job.salary_min, job.salary_max);
  const score = getScore(job);

  return (
    <div
      className="group relative rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-card/80 transition-all duration-200 flex flex-col overflow-hidden cursor-pointer"
      onClick={onClick}
    >
      {/* Top accent bar */}
      <div className="h-0.5 w-full bg-gradient-to-r from-primary/60 via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {job.title}
            </h3>
            <div className="flex items-center gap-1 mt-1 text-muted-foreground">
              <Building2 className="size-3 shrink-0" />
              <span className="text-xs truncate">{job.company}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {score >= 0 && (
              <span
                title={job.fit_reasoning ?? undefined}
                className={`text-xs font-bold tabular-nums ${scoreColor(score)} ${job.fit_reasoning ? "cursor-help" : ""}`}
              >
                {score}%
              </span>
            )}
            <SourceBadge source={job.source} />
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {job.location && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="text-xs truncate max-w-[120px]">{job.location}</span>
            </div>
          )}
          {job.is_remote && (
            <div className="flex items-center gap-1 text-emerald-400">
              <Wifi className="size-3 shrink-0" />
              <span className="text-xs">Remote</span>
            </div>
          )}
          {salary && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <DollarSign className="size-3 shrink-0" />
              <span className="text-xs">{salary}</span>
            </div>
          )}
          {job.date_posted && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3 shrink-0" />
              <span className="text-xs">{timeAgo(job.date_posted)}</span>
            </div>
          )}
        </div>

        {/* Tech stack pills */}
        {job.tech_stack && (
          <div className="flex flex-wrap gap-1">
            {job.tech_stack
              .split(",")
              .slice(0, 5)
              .map((t) => t.trim())
              .filter(Boolean)
              .map((tech) => (
                <span
                  key={tech}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border"
                >
                  {tech}
                </span>
              ))}
          </div>
        )}

        {/* Description preview */}
        {job.description && (
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {job.description.replace(/[#*`]/g, "").trim()}
          </p>
        )}
      </div>

      {/* Actions */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-t border-border bg-muted/30"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onApply}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <BookmarkPlus className="size-3" />
          Mark Applied
        </button>
        {job.job_url && (
          <a
            href={job.job_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center size-7 rounded-lg border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3" />
          </a>
        )}
        <button
          onClick={onSkip}
          className="flex items-center justify-center size-7 rounded-lg border border-border hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors text-muted-foreground text-xs"
          title="Skip this job"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Browse() {
  const [selected, setSelected] = useState<string | number | null>(null);
  const [search, setSearch] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [salaryMin, setSalaryMin] = useState(0);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedTechs, setSelectedTechs] = useState<string[]>([]);
  const [daysOld, setDaysOld] = useState(0);
  const [page, setPage] = useState(1);

  const qc = useQueryClient();

  const { data: allJobs = [], isLoading } = useQuery({
    queryKey: ["jobs", "found", "all"],
    queryFn: () => api.jobsByStatus("found"),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string | number; status: JobStatus }) =>
      api.updateStatus(id, status),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success(
        vars.status === "applied" ? "Marked as applied" : "Job skipped"
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    let jobs = allJobs;

    if (search.trim()) {
      const q = search.toLowerCase();
      jobs = jobs.filter(
        (j) =>
          j.title?.toLowerCase().includes(q) ||
          j.company?.toLowerCase().includes(q) ||
          j.description?.toLowerCase().includes(q) ||
          j.tech_stack?.toLowerCase().includes(q)
      );
    }

    if (remoteOnly) {
      jobs = jobs.filter((j) => j.is_remote);
    }

    if (salaryMin > 0) {
      jobs = jobs.filter(
        (j) =>
          (j.salary_min && j.salary_min >= salaryMin) ||
          (j.salary_max && j.salary_max >= salaryMin)
      );
    }

    if (selectedSources.length > 0) {
      jobs = jobs.filter((j) => j.source && selectedSources.includes(j.source));
    }

    if (selectedTechs.length > 0) {
      jobs = jobs.filter((j) =>
        selectedTechs.some((tech) =>
          j.tech_stack?.toLowerCase().includes(tech.toLowerCase())
        )
      );
    }

    if (daysOld > 0) {
      const cutoff = Date.now() - daysOld * 86400000;
      jobs = jobs.filter((j) => {
        if (!j.date_posted) return true;
        const d = new Date(j.date_posted);
        return !isNaN(d.getTime()) && d.getTime() >= cutoff;
      });
    }

    return jobs;
  }, [allJobs, search, remoteOnly, salaryMin, selectedSources, selectedTechs, daysOld]);

  // Reset to page 1 when filters change
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(1, totalPages));
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSource = (s: string) => {
    setPage(1);
    setSelectedSources((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const toggleTech = (t: string) => {
    setPage(1);
    setSelectedTechs((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  const clearFilters = () => {
    setSearch("");
    setRemoteOnly(false);
    setSalaryMin(0);
    setSelectedSources([]);
    setSelectedTechs([]);
    setDaysOld(0);
    setPage(1);
  };

  const hasFilters =
    search || remoteOnly || salaryMin > 0 ||
    selectedSources.length > 0 || selectedTechs.length > 0 || daysOld > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Browse</h1>
          <p className="text-muted-foreground mt-1">
            {filtered.length} job{filtered.length !== 1 ? "s" : ""} found
            {hasFilters ? " (filtered)" : ""}
          </p>
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search jobs, companies, tech..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
        />
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Remote + Salary */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
            <Wifi className="size-3" /> Remote
          </div>
          <FilterChip active={remoteOnly} onClick={() => { setRemoteOnly(!remoteOnly); setPage(1); }}>
            Remote only
          </FilterChip>

          <div className="w-px h-4 bg-border mx-1" />

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
            <DollarSign className="size-3" /> Salary
          </div>
          {SALARY_OPTIONS.map((opt) => (
            <FilterChip
              key={opt.value}
              active={salaryMin === opt.value}
              onClick={() => { setSalaryMin(opt.value); setPage(1); }}
            >
              {opt.label}
            </FilterChip>
          ))}
        </div>

        {/* Sources */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
            <Layers className="size-3" /> Source
          </div>
          {SOURCES.map((s) => (
            <FilterChip key={s} active={selectedSources.includes(s)} onClick={() => toggleSource(s)}>
              {s}
            </FilterChip>
          ))}
        </div>

        {/* Date posted */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
            <Calendar className="size-3" /> Posted
          </div>
          {DATE_OPTIONS.map((opt) => (
            <FilterChip
              key={opt.value}
              active={daysOld === opt.value}
              onClick={() => { setDaysOld(opt.value); setPage(1); }}
            >
              {opt.label}
            </FilterChip>
          ))}
        </div>

        {/* Tech stack */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
            <Search className="size-3" /> Tech
          </div>
          {TECH_OPTIONS.map((t) => (
            <FilterChip key={t} active={selectedTechs.includes(t)} onClick={() => toggleTech(t)}>
              {t}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="py-24 grid place-items-center">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">Loading jobs...</p>
          </div>
        </div>
      ) : paginated.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-muted-foreground">No jobs match your filters.</p>
          {hasFilters && (
            <button onClick={clearFilters} className="mt-2 text-sm text-primary hover:underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginated.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onClick={() => setSelected(job.id)}
              onApply={() => updateStatus.mutate({ id: job.id, status: "applied" })}
              onSkip={() => updateStatus.mutate({ id: job.id, status: "skipped" })}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            disabled={safePage === 1}
            onClick={() => setPage(safePage - 1)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="size-4" /> Prev
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let p: number;
              if (totalPages <= 7) {
                p = i + 1;
              } else if (safePage <= 4) {
                p = i + 1;
              } else if (safePage >= totalPages - 3) {
                p = totalPages - 6 + i;
              } else {
                p = safePage - 3 + i;
              }
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`size-8 text-xs rounded-lg border transition-colors ${
                    p === safePage
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <button
            disabled={safePage === totalPages}
            onClick={() => setPage(safePage + 1)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight className="size-4" />
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