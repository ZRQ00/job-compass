import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ScrapeProgress } from "@/components/ScrapeProgress";
import { useScrapeStream } from "@/hooks/useScrapeStream";
import { Search, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/discover")({
  head: () => ({ meta: [{ title: "Discover — Job Compass" }] }),
  component: Discover,
});

function Discover() {
  const [search, setSearch] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);

  const qc = useQueryClient();
  const { running, statusLog, current, total, site, result, start } = useScrapeStream();

  const runScrape = () => {
    if (!search.trim()) return;
    start(
      api.scrapeStreamUrl({
        search_term: search,
        salary_min: salaryMin ? Number(salaryMin) : undefined,
        remote_only: remoteOnly,
        results_wanted: 50,
        sites: ["linkedin", "indeed"],
      }),
      (data) => {
        qc.invalidateQueries({ queryKey: ["jobs"] });
        qc.invalidateQueries({ queryKey: ["stats"] });
        toast.success(
          data.jobs_added > 0
            ? `Added ${data.jobs_added} new job${data.jobs_added === 1 ? "" : "s"}`
            : "No new jobs found"
        );
      }
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">Discover</h1>
        <p className="text-muted-foreground mt-1">Scrape fresh listings from across the web.</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); runScrape(); }}
        className="bg-card border border-border rounded-xl p-6 grid gap-4 md:grid-cols-[1fr_180px_auto_auto] md:items-end"
      >
        <div className="space-y-2">
          <Label htmlFor="search">Search term</Label>
          <Input
            id="search"
            placeholder="e.g. AI Engineer Python"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="salary">Min salary</Label>
          <Input
            id="salary"
            type="number"
            placeholder="150000"
            value={salaryMin}
            onChange={(e) => setSalaryMin(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 h-10">
          <Switch id="remote" checked={remoteOnly} onCheckedChange={setRemoteOnly} />
          <Label htmlFor="remote" className="cursor-pointer">Remote only</Label>
        </div>
        <Button type="submit" disabled={!search.trim() || running} className="gap-2">
          {running
            ? <Loader2 className="size-4 animate-spin" />
            : <Search className="size-4" />
          }
          Scrape
        </Button>
      </form>

      {/* Live progress while running */}
      {running && (
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            Searching the job market…
          </div>
          <ScrapeProgress statusLog={statusLog} current={current} total={total} site={site} />
        </div>
      )}

      {/* Result summary after scrape */}
      {result && !running && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
          <CheckCircle2 className="size-5 text-success shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Scrape complete</p>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>Scraped <strong className="text-foreground">{result.jobs_found}</strong> listings</span>
              <span>Added <strong className="text-success">{result.jobs_added}</strong> new jobs</span>
              <span>Skipped <strong className="text-foreground">{result.jobs_duplicate}</strong> duplicates</span>
            </div>
            <p className="text-xs text-muted-foreground">
              New jobs are now available in the{" "}
              <a href="/browse" className="text-primary underline underline-offset-2">Browse</a>
              {" "}and{" "}
              <a href="/tracker" className="text-primary underline underline-offset-2">Tracker</a>.
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!running && !result && (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <Sparkles className="size-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">Run a search to discover new opportunities.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Results go straight into your Browse and Tracker pages.
          </p>
        </div>
      )}
    </div>
  );
}