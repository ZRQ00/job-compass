import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  DollarSign,
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api, type JobDetail, type JobStatus } from "@/lib/api";
import { formatDay, formatSalary, FORWARD, parseTimestamp, STATUS_META, timeAgo } from "@/lib/jobs";
import { JobForm } from "@/components/JobForm";
import type { JobFormValues } from "@/lib/jobForm";
import { MatchPanel } from "@/components/MatchPanel";
import { JobDescription } from "@/components/JobDescription";
import { boardFromUrl } from "@/lib/boards";
import { StatusBadge } from "@/components/StatusBadge";
import { useUpdateJob } from "@/hooks/useJobMutations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tracker_/$jobId")({
  head: () => ({ meta: [{ title: "Job · Job Compass" }] }),
  component: JobPage,
});

function toFormValues(j: JobDetail): JobFormValues {
  return {
    company: j.company,
    role: j.role,
    location: j.location ?? "",
    status: j.status,
    date_applied: j.date_applied ?? "",
    salary_min: j.salary_min?.toString() ?? "",
    salary_max: j.salary_max?.toString() ?? "",
    job_url: j.job_url ?? "",
    notes: j.notes ?? "",
    job_description: j.job_description ?? "",
  };
}

function JobPage() {
  const { jobId } = Route.useParams();
  const id = Number(jobId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const {
    data: job,
    isLoading,
    error,
  } = useQuery({ queryKey: ["job", id], queryFn: () => api.job(id) });
  const update = useUpdateJob(id);

  const remove = useMutation({
    mutationFn: () => api.deleteJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Job deleted");
      navigate({ to: "/tracker" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading)
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (error || !job)
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-muted-foreground">{(error as Error)?.message ?? "Job not found"}</p>
        <Link to="/tracker" className="text-sm text-primary underline">
          Back to tracker
        </Link>
      </div>
    );

  const salary = formatSalary(job.salary_min, job.salary_max);

  return (
    <div className="space-y-6">
      <Link
        to="/tracker"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Tracker
      </Link>

      {editing ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">Edit job</h1>
          <JobForm
            mode="edit"
            editingId={job.id}
            initial={toFormValues(job)}
            pending={update.isPending}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={(v) =>
              update.mutate(v, {
                onSuccess: () => {
                  toast.success("Saved");
                  setEditing(false);
                },
              })
            }
          />
        </>
      ) : (
        <>
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="size-4" /> {job.company}
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{job.role}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                <StatusBadge status={job.status} />
                {job.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" /> {job.location}
                  </span>
                )}
                {salary && (
                  <span className="inline-flex items-center gap-1 text-primary">
                    <DollarSign className="size-3.5" /> {salary}
                  </span>
                )}
                {job.date_applied && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3.5" /> Applied {formatDay(job.date_applied)}
                  </span>
                )}
                {job.job_url && (
                  <a
                    href={job.job_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {boardFromUrl(job.job_url) ?? "Posting"} <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
              >
                <Pencil className="size-3.5" /> Edit
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
                    aria-label="Delete job"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this job?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {job.role} at {job.company} and its notes, match and history will be removed.
                      This can't be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => remove.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <PipelineStepper
            status={job.status}
            pending={update.isPending}
            onChange={(s) => update.mutate({ status: s })}
          />

          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <section className="min-w-0 self-start rounded-xl border border-border bg-card/40 p-5">
              <h3 className="mb-3 font-display font-semibold">Job description</h3>
              {job.job_description ? (
                <JobDescription
                  text={job.job_description}
                  className="max-h-[70vh] overflow-y-auto pr-2"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No description yet.{" "}
                  <button
                    onClick={() => setEditing(true)}
                    className="text-primary underline underline-offset-2"
                  >
                    Paste one
                  </button>{" "}
                  to enable resume matching.
                </p>
              )}
            </section>

            <div className="space-y-6">
              <MatchPanel job={job} />
              <NotesCard
                key={job.id}
                initial={job.notes ?? ""}
                saving={update.isPending}
                onSave={(notes) => update.mutate({ notes: notes || null })}
              />
              <Timeline job={job} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PipelineStepper({
  status,
  pending,
  onChange,
}: {
  status: JobStatus;
  pending: boolean;
  onChange: (s: JobStatus) => void;
}) {
  const idx = FORWARD.indexOf(status);
  const exited = idx === -1;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/30 p-3">
      <ol className="flex flex-1 items-center gap-1">
        {FORWARD.map((s, i) => {
          const done = !exited && i < idx;
          const current = s === status;
          return (
            <li key={s} className="flex flex-1 items-center gap-1">
              <button
                disabled={pending || current}
                onClick={() => onChange(s)}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:text-sm",
                  current && "bg-primary text-primary-foreground",
                  done && "bg-primary/15 text-primary hover:bg-primary/25",
                  !current &&
                    !done &&
                    "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                {done && <Check className="size-3.5" />}
                {STATUS_META[s].label}
              </button>
              {i < FORWARD.length - 1 && (
                <span
                  className={cn("h-px w-3 shrink-0 sm:w-6", done ? "bg-primary/50" : "bg-border")}
                />
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex gap-1.5">
        {(["rejected", "withdrawn"] as const).map((s) => (
          <button
            key={s}
            disabled={pending || status === s}
            onClick={() => onChange(s)}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs transition-colors",
              status === s
                ? s === "rejected"
                  ? "border-destructive/50 bg-destructive/15 text-destructive"
                  : "border-border bg-muted text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {STATUS_META[s].label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Notes save automatically when you click away. */
function NotesCard({
  initial,
  saving,
  onSave,
}: {
  initial: string;
  saving: boolean;
  onSave: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  useEffect(() => {
    setValue(initial);
    setSaved(initial);
  }, [initial]);
  const dirty = value.trim() !== saved.trim();
  return (
    <section className="rounded-xl border border-border bg-card/40 p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display font-semibold">Notes</h3>
        <span className="text-[11px] text-muted-foreground">
          {saving ? "Saving…" : dirty ? "Unsaved" : "Saves when you click away"}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (dirty) {
            onSave(value.trim());
            setSaved(value);
          }
        }}
        rows={5}
        placeholder="Recruiter name, interview prep, questions to ask…"
        className="w-full resize-y rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </section>
  );
}

function Timeline({ job }: { job: JobDetail }) {
  const events = [...job.events].reverse();
  return (
    <section className="rounded-xl border border-border bg-card/40 p-5">
      <h3 className="mb-3 font-display font-semibold">History</h3>
      <ol className="space-y-3 border-l border-border pl-4">
        {events.map((e, i) => (
          <li key={i} className="relative text-sm">
            <span
              className={cn(
                "absolute -left-[21px] top-1.5 size-2 rounded-full ring-4 ring-card",
                STATUS_META[e.to_status].dot,
              )}
            />
            <span className="text-foreground/90">
              {e.from_status
                ? `Moved to ${STATUS_META[e.to_status].label}`
                : `Added as ${STATUS_META[e.to_status].label}`}
            </span>
            <span
              className="ml-2 text-xs text-muted-foreground"
              title={parseTimestamp(e.created_at)?.toLocaleString()}
            >
              {timeAgo(e.created_at)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
