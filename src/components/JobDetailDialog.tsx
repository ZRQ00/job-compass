import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Job, JobStatus, STATUS_LABELS } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, DollarSign, ExternalLink, Loader2 } from "lucide-react";

const STATUS_FLOW: JobStatus[] = ["found", "applied", "interview", "offer", "rejected"];

export function JobDetailDialog({
  jobId,
  open,
  onOpenChange,
}: {
  jobId: string | number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api.job(jobId!),
    enabled: !!jobId && open,
  });

  const mutate = useMutation({
    mutationFn: (status: JobStatus) => api.updateStatus(jobId!, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {isLoading || !data ? (
          <div className="py-16 grid place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <JobDetailBody job={data} onStatus={(s) => mutate.mutate(s)} pending={mutate.isPending} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function JobDetailBody({ job, onStatus, pending }: { job: Job; onStatus: (s: JobStatus) => void; pending: boolean }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-2xl pr-8">{job.title}</DialogTitle>
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground pt-1">
          <span className="flex items-center gap-1"><Building2 className="size-3.5" />{job.company}</span>
          {job.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{job.location}</span>}
          {job.salary && <span className="flex items-center gap-1 text-primary"><DollarSign className="size-3.5" />{job.salary}</span>}
          {job.remote && <Badge variant="secondary">Remote</Badge>}
        </div>
      </DialogHeader>

      <div className="flex flex-wrap gap-2 py-4 border-y border-border">
        <span className="text-xs text-muted-foreground self-center mr-1">Set status:</span>
        {STATUS_FLOW.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={job.status === s ? "default" : "outline"}
            onClick={() => onStatus(s)}
            disabled={pending}
          >
            {STATUS_LABELS[s]}
          </Button>
        ))}
      </div>

      {job.url && (
        <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          View original posting <ExternalLink className="size-3" />
        </a>
      )}

      <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
        {job.description || "No description available."}
      </div>
    </>
  );
}
