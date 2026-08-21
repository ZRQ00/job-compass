import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Job, JobStatus, STATUS_LABELS } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, DollarSign, ExternalLink, Loader2, Calendar, Clock, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";

const STATUS_FLOW: JobStatus[] = ["found", "applied", "interview", "offer", "rejected"];

function formatDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatSalary(min?: number | null, max?: number | null) {
  if (!min && !max) return null;
  const fmt = (n: number) => `$${(n / 1000).toFixed(0)}k`;
  if (min && max) return `${fmt(min)} - ${fmt(max)}`;
  return fmt((min ?? max) as number);
}

function scoreColor(score: number) {
  if (score >= 75) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-destructive";
}

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

  const [streaming, setStreaming] = useState(false);
  const [thinkingText, setThinkingText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const jobIdRef = useRef(jobId);
  const streamingRef = useRef(streaming);

  useEffect(() => { jobIdRef.current = jobId; }, [jobId]);
  useEffect(() => { streamingRef.current = streaming; }, [streaming]);

  const cancelReasoning = (silent = false) => {
    const id = jobIdRef.current;
    if (id) api.cancelReasonJob(id).catch(() => {});
    eventSourceRef.current?.close();
    setStreaming(false);
    if (!silent) toast("Reasoning cancelled");
  };

  // Page is closing/refreshing mid-stream — sendBeacon is the one mechanism
  // that reliably fires during unload, unlike a normal fetch call.
  useEffect(() => {
    const handleUnload = () => {
      if (streamingRef.current && jobIdRef.current) {
        navigator.sendBeacon(api.reasonJobCancelUrl(jobIdRef.current));
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // Dialog closed mid-stream — the component itself doesn't unmount when the
  // dialog closes, so this is the only signal we get for that case.
  useEffect(() => {
    if (!open && streamingRef.current) {
      cancelReasoning(true);
    }
  }, [open]);

  useEffect(() => () => eventSourceRef.current?.close(), []);

  useEffect(() => {
    if (!streaming) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [streaming]);

  const startReasoning = () => {
    if (!jobId) return;
    setThinkingText("");
    setStreaming(true);
    const es = new EventSource(api.reasonJobStreamUrl(jobId));
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.type === "thinking") {
        setThinkingText((t) => t + event.text);
      } else if (event.type === "done") {
        qc.invalidateQueries({ queryKey: ["job", jobId] });
        qc.invalidateQueries({ queryKey: ["jobs"] });
        toast.success("Got AI reasoning");
        es.close();
        setStreaming(false);
      } else if (event.type === "cancelled") {
        es.close();
        setStreaming(false);
      } else if (event.type === "error") {
        toast.error(event.text);
        es.close();
        setStreaming(false);
      }
    };

    es.onerror = () => {
      toast.error("Connection to reasoning stream lost");
      es.close();
      setStreaming(false);
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {isLoading || !data ? (
          <div className="py-16 grid place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <JobDetailBody
            job={data}
            onStatus={(s) => mutate.mutate(s)}
            pending={mutate.isPending}
            onReason={startReasoning}
            onCancelReason={() => cancelReasoning()}
            streaming={streaming}
            thinkingText={thinkingText}
            elapsed={elapsed}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReasoningProgress({ elapsed, onCancel }: { elapsed: number; onCancel: () => void }) {
  return (
    <div className="space-y-1.5">
      <style>{`
        @keyframes indeterminate-progress {
          0% { left: -33%; }
          100% { left: 100%; }
        }
      `}</style>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="absolute inset-y-0 w-1/3 rounded-full bg-primary"
          style={{ animation: "indeterminate-progress 1.4s ease-in-out infinite" }}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Reasoning… {elapsed}s {elapsed > 30 && "(can take a few minutes on a cold start)"}
        </p>
        <button
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function JobDetailBody({
  job,
  onStatus,
  pending,
  onReason,
  onCancelReason,
  streaming,
  thinkingText,
  elapsed,
}: {
  job: Job;
  onStatus: (s: JobStatus) => void;
  pending: boolean;
  onReason: () => void;
  onCancelReason: () => void;
  streaming: boolean;
  thinkingText: string;
  elapsed: number;
}) {
  const salary = formatSalary(job.salary_min, job.salary_max);
  const posted = formatDate(job.date_posted);
  const found = formatDate(job.created_at);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-2xl pr-8">{job.title}</DialogTitle>
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground pt-1">
          <span className="flex items-center gap-1"><Building2 className="size-3.5" />{job.company}</span>
          {job.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{job.location}</span>}
          {salary && <span className="flex items-center gap-1 text-primary"><DollarSign className="size-3.5" />{salary}</span>}
          {job.is_remote && <Badge variant="secondary">Remote</Badge>}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
          {posted && (
            <span className="flex items-center gap-1">
              <Calendar className="size-3" /> Posted {posted}
            </span>
          )}
          {found && (
            <span className="flex items-center gap-1">
              <Clock className="size-3" /> Found {found}
            </span>
          )}
        </div>
      </DialogHeader>

      {/* Match score */}
      <div className="rounded-lg border border-border p-4 space-y-3 my-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Match</span>
          <div className="flex items-center gap-4">
            {job.fit_score != null && (
              <div className="text-right">
                <div className={`text-lg font-semibold leading-none ${scoreColor(job.fit_score)}`}>
                  {job.fit_score}%
                </div>
                <div className="text-[10px] text-muted-foreground">semantic</div>
              </div>
            )}
            {job.reasoning_score != null && (
              <div className="text-right">
                <div className={`text-lg font-semibold leading-none ${scoreColor(job.reasoning_score)}`}>
                  {job.reasoning_score}%
                </div>
                <div className="text-[10px] text-muted-foreground">AI assessed</div>
              </div>
            )}
          </div>
        </div>

        {job.fit_reasoning && !streaming ? (
          <p className="text-sm text-foreground/80 leading-relaxed pt-1 border-t border-border">
            {job.fit_reasoning}
          </p>
        ) : streaming ? (
          <div className="space-y-2 pt-1 border-t border-border">
            <ReasoningProgress elapsed={elapsed} onCancel={onCancelReason} />
            {thinkingText && (
              <div className="max-h-32 overflow-y-auto rounded-md bg-background/60 p-2 text-xs text-muted-foreground italic leading-relaxed whitespace-pre-wrap">
                {thinkingText}
              </div>
            )}
          </div>
        ) : job.fit_score != null ? (
          <Button size="sm" variant="outline" onClick={onReason} className="gap-1.5">
            <Sparkles className="size-3.5" />
            Get AI reasoning
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Not scored yet — run a rescore from the Resume page once your resume is uploaded.
          </p>
        )}
      </div>

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

      {job.job_url && (
        <a
          href={job.job_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-3"
        >
          View original posting <ExternalLink className="size-3" />
        </a>
      )}

      <div className="prose prose-invert prose-sm max-w-none text-sm leading-relaxed text-foreground/90 mt-3">
        {job.description ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{job.description}</ReactMarkdown>
        ) : (
          "No description available."
        )}
      </div>
    </>
  );
}