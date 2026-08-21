import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Briefcase, Send, Calendar, Trophy, ArrowRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SchedulerCard } from "@/components/SchedulerCard";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — Job Compass" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stats"],
    queryFn: api.stats,
    refetchOnWindowFocus: true,
  });

  const cards = [
    { label: "Total Jobs", value: data?.total, icon: Briefcase, color: "text-info" },
    { label: "Applied", value: data?.applied, icon: Send, color: "text-primary" },
    { label: "Interviews", value: data?.interview, icon: Calendar, color: "text-warning" },
    { label: "Offers", value: data?.offer, icon: Trophy, color: "text-success" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Your job search at a glance.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/discover">
            <Button variant="secondary">Discover jobs <ArrowRight className="size-4 ml-1" /></Button>
          </Link>
          <Link to="/tracker">
            <Button>Open tracker <ArrowRight className="size-4 ml-1" /></Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          <AlertCircle className="size-4 shrink-0" />
          Couldn't reach the API at localhost:9500. Make sure the backend is running.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-5 hover:border-primary/40 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">{label}</span>
              <Icon className={`size-4 ${color}`} />
            </div>
            <div className="text-3xl font-display font-semibold">
              {isLoading ? <span className="opacity-30">—</span> : (value ?? 0)}
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Link to="/discover" className="group bg-card border border-border rounded-xl p-6 hover:border-primary/40 transition-colors">
          <h3 className="font-display text-lg font-semibold mb-1">Find new opportunities</h3>
          <p className="text-sm text-muted-foreground">Scrape job boards for matching roles by keyword, salary, and remote.</p>
        </Link>
        <Link to="/tracker" className="group bg-card border border-border rounded-xl p-6 hover:border-primary/40 transition-colors">
          <h3 className="font-display text-lg font-semibold mb-1">Move applications forward</h3>
          <p className="text-sm text-muted-foreground">Drag jobs across the kanban board as you progress.</p>
        </Link>
        <SchedulerCard />
      </div>
    </div>
  );
}