import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Job, JobStatus, STATUS_LABELS } from "@/lib/api";
import { JobCard } from "@/components/JobCard";
import { JobDetailDialog } from "@/components/JobDetailDialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const COLUMNS: JobStatus[] = ["found", "applied", "interview", "offer", "rejected"];

const COL_ACCENT: Record<JobStatus, string> = {
  found: "bg-info",
  applied: "bg-primary",
  interview: "bg-warning",
  offer: "bg-success",
  rejected: "bg-destructive",
};

export const Route = createFileRoute("/tracker")({
  head: () => ({ meta: [{ title: "Tracker — JobTrail" }] }),
  component: Tracker,
});

function Tracker() {
  const [selected, setSelected] = useState<string | number | null>(null);
  const [dragOver, setDragOver] = useState<JobStatus | null>(null);
  const qc = useQueryClient();

  const queries = useQueries({
    queries: COLUMNS.map((status) => ({
      queryKey: ["jobs", status],
      queryFn: () => api.jobsByStatus(status),
    })),
  });

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">Tracker</h1>
        <p className="text-muted-foreground mt-1">Drag cards between columns to update status.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {COLUMNS.map((status, idx) => {
          const q = queries[idx];
          const jobs: Job[] = q.data || [];
          const isOver = dragOver === status;
          return (
            <div
              key={status}
              onDragOver={(e) => { e.preventDefault(); setDragOver(status); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/plain");
                const from = e.dataTransfer.getData("application/x-status") as JobStatus;
                if (id && from !== status) updateStatus.mutate({ id, status });
              }}
              className={`rounded-xl border bg-card/40 p-3 min-h-[60vh] flex flex-col transition-colors ${
                isOver ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${COL_ACCENT[status]}`} />
                  <h2 className="font-display font-semibold text-sm">{STATUS_LABELS[status]}</h2>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{jobs.length}</span>
              </div>
              <div className="space-y-2 flex-1">
                {q.isLoading ? (
                  <div className="py-8 grid place-items-center">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : jobs.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">No jobs</div>
                ) : (
                  jobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      compact
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(job.id));
                        e.dataTransfer.setData("application/x-status", status);
                      }}
                      onClick={() => setSelected(job.id)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <JobDetailDialog jobId={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}
