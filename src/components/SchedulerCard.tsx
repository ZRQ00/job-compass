import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Play, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrapeProgress } from "@/components/ScrapeProgress";
import { useScrapeStream } from "@/hooks/useScrapeStream";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function timeUntil(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Soon";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `in ${hrs}h ${mins % 60}m`;
}

export function SchedulerCard() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["scheduler"],
    queryFn: api.scheduler,
    refetchInterval: 30000,
  });

  const { running, statusLog, current, total, site, start } = useScrapeStream();

  const runNow = () => {
    start(api.schedulerRunStreamUrl(), () => {
      qc.invalidateQueries({ queryKey: ["scheduler"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Scrape complete");
    });
  };

  const toggleEnabled = useMutation({
    mutationFn: (enabled: boolean) => api.schedulerToggle(enabled),
    onSuccess: (_: any, enabled: boolean) => {
      toast.success(enabled ? "Scheduler enabled" : "Scheduler paused");
      qc.invalidateQueries({ queryKey: ["scheduler"] });
    },
  });

  const result = data?.last_run_result;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="size-4 text-muted-foreground" />
          <span className="font-display font-semibold text-sm">Auto-Scrape</span>
          {!isLoading && data && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
              data.enabled && data.running
                ? "bg-success/10 text-success border-success/20"
                : "bg-muted text-muted-foreground border-border"
            }`}>
              {data.enabled && data.running ? "Active" : "Paused"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isLoading && data && (
            <button
              onClick={() => toggleEnabled.mutate(!data.enabled)}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              {data.enabled ? "Pause" : "Enable"}
            </button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={runNow}
            disabled={running}
            className="h-7 text-xs gap-1"
          >
            {running
              ? <Loader2 className="size-3 animate-spin" />
              : <Play className="size-3" />
            }
            Run now
          </Button>
        </div>
      </div>

      {/* Live progress while running */}
      {running && (
        <div className="rounded-lg bg-muted/20 p-3">
          <ScrapeProgress statusLog={statusLog} current={current} total={total} site={site} />
        </div>
      )}

      {/* Timing row */}
      {isLoading ? (
        <div className="h-12 bg-muted/40 rounded animate-pulse" />
      ) : data ? (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-muted/30 rounded-lg px-2 py-2">
            <p className="text-[10px] text-muted-foreground mb-0.5">Every</p>
            <p className="text-sm font-semibold">{data.interval_hours}h</p>
          </div>
          <div className="bg-muted/30 rounded-lg px-2 py-2">
            <p className="text-[10px] text-muted-foreground mb-0.5">Last run</p>
            <p className="text-sm font-semibold">{timeAgo(data.last_run)}</p>
          </div>
          <div className="bg-muted/30 rounded-lg px-2 py-2">
            <p className="text-[10px] text-muted-foreground mb-0.5">Next run</p>
            <p className="text-sm font-semibold">{timeUntil(data.next_run)}</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">
          Could not reach scheduler
        </p>
      )}

      {/* Daily cleanup status */}
      {!isLoading && data && (
        <div className="flex items-center justify-between text-xs pt-3 border-t border-border">
          <span className="text-muted-foreground">Daily cleanup</span>
          <span className="font-medium text-foreground">
            {data.cleanup_enabled
              ? `Next ${timeUntil(data.next_cleanup)} · last removed ${data.last_cleanup_result?.deleted ?? 0}`
              : "Disabled"}
          </span>
        </div>
      )}

      {/* Last run results */}
      {result && !running && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Last run results</span>
            <span className="font-medium text-foreground">+{result.total_added} new jobs</span>
          </div>
          <div className="space-y-1">
            {result.searches.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-muted/20">
                <span className="text-muted-foreground truncate max-w-[180px]">{s.search_term}</span>
                {s.error ? (
                  <div className="flex items-center gap-1 text-destructive">
                    <XCircle className="size-3" />
                    <span>Failed</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-success">
                    <CheckCircle2 className="size-3" />
                    <span>+{s.jobs_added ?? 0}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}