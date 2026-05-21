import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, Job } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { JobCard } from "@/components/JobCard";
import { JobDetailDialog } from "@/components/JobDetailDialog";
import { Search, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/discover")({
  head: () => ({ meta: [{ title: "Discover — JobTrail" }] }),
  component: Discover,
});

function Discover() {
  const [search, setSearch] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [results, setResults] = useState<Job[]>([]);
  const [selected, setSelected] = useState<string | number | null>(null);

  const scrape = useMutation({
    mutationFn: () =>
      api.scrape({
        search,
        salary_min: salaryMin ? Number(salaryMin) : undefined,
        remote_only: remoteOnly,
      }),
    onSuccess: (data) => {
      setResults(data);
      toast.success(`Found ${data.length} job${data.length === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">Discover</h1>
        <p className="text-muted-foreground mt-1">Scrape fresh listings from across the web.</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (search.trim()) scrape.mutate(); }}
        className="bg-card border border-border rounded-xl p-6 grid gap-4 md:grid-cols-[1fr_180px_auto_auto] md:items-end"
      >
        <div className="space-y-2">
          <Label htmlFor="search">Search term</Label>
          <Input id="search" placeholder="e.g. Senior React Engineer" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="salary">Min salary</Label>
          <Input id="salary" type="number" placeholder="120000" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 h-10">
          <Switch id="remote" checked={remoteOnly} onCheckedChange={setRemoteOnly} />
          <Label htmlFor="remote" className="cursor-pointer">Remote only</Label>
        </div>
        <Button type="submit" disabled={!search.trim() || scrape.isPending} className="gap-2">
          {scrape.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Scrape
        </Button>
      </form>

      {scrape.isPending && (
        <div className="text-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mx-auto mb-3" />
          Searching the job market…
        </div>
      )}

      {!scrape.isPending && results.length === 0 && (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <Sparkles className="size-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">Run a search to discover new opportunities.</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((job) => (
            <JobCard key={job.id} job={job} onClick={() => setSelected(job.id)} />
          ))}
        </div>
      )}

      <JobDetailDialog jobId={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}
