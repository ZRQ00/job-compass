import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import type { Job, JobStatus } from "@/lib/api";
import { formatDay, formatSalary, scoreTone, STATUS_META, STATUSES } from "@/lib/jobs";
import { useUpdateStatus } from "@/hooks/useJobMutations";
import { cn } from "@/lib/utils";

/** Kanban view of the pipeline. Drag a card to another column to change its status. */
export function PipelineBoard({ jobs }: { jobs: Job[] }) {
  const navigate = useNavigate();
  const update = useUpdateStatus();
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<JobStatus | null>(null);

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
      <div className="grid min-w-[900px] grid-cols-5 gap-3">
        {STATUSES.map((status) => {
          const col = jobs.filter((j) => j.status === status);
          const meta = STATUS_META[status];
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((o) => (o === status ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = Number(e.dataTransfer.getData("text/plain"));
                const job = jobs.find((j) => j.id === id);
                if (job && job.status !== status) update.mutate({ id, status });
              }}
              className={cn(
                "flex min-h-[420px] flex-col rounded-xl border border-border bg-card/30 p-2 transition-colors",
                over === status && "border-primary/60 bg-primary/5",
              )}
            >
              <div className="flex items-center justify-between px-2 pb-2 pt-1">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className={cn("size-2 rounded-full", meta.dot)} />
                  {meta.label}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">{col.length}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {col.map((job) => {
                  const salary = formatSalary(job.salary_min, job.salary_max);
                  return (
                    <div
                      key={job.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(job.id));
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(job.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      onClick={() =>
                        navigate({ to: "/tracker/$jobId", params: { jobId: String(job.id) } })
                      }
                      className={cn(
                        "cursor-grab rounded-lg border border-border bg-card p-3 text-left shadow-sm transition hover:border-primary/40 active:cursor-grabbing",
                        dragId === job.id && "opacity-40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{job.company}</div>
                          <div className="line-clamp-2 text-xs text-muted-foreground">
                            {job.role}
                          </div>
                        </div>
                        {job.match_score != null && (
                          <span
                            className={cn(
                              "text-xs font-semibold tabular-nums",
                              scoreTone(job.match_score),
                            )}
                          >
                            {job.match_score}
                          </span>
                        )}
                      </div>
                      {(job.location || salary || job.date_applied) && (
                        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          {job.location && (
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="size-2.5" />
                              {job.location}
                            </span>
                          )}
                          {salary && <span className="text-primary/90">{salary}</span>}
                          {job.date_applied && <span>{formatDay(job.date_applied)}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
                {col.length === 0 && (
                  <div className="grid flex-1 place-items-center rounded-lg border border-dashed border-border/60 px-2 text-center text-[11px] text-muted-foreground/70">
                    {meta.hint}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
