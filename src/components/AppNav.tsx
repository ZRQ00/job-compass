import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Compass, LayoutDashboard, ListChecks, FileText, Plus, Download } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tracker", label: "Tracker", icon: ListChecks },
  { to: "/resume", label: "Resume", icon: FileText },
] as const;

function AiStatusDot() {
  const { data, isError } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 60_000,
  });
  const ok = data?.ai.reachable && data.ai.model_available;
  const label = isError
    ? "Backend unreachable"
    : !data
      ? "Checking…"
      : ok
        ? `AI ready (${data.ai.model})`
        : data.ai.reachable
          ? `Model ${data.ai.model} not pulled`
          : "Ollama offline: matching & autofill unavailable";
  return (
    <span
      title={label}
      className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <span
        className={`size-2 rounded-full ${isError ? "bg-destructive" : ok ? "bg-success" : data ? "bg-warning" : "bg-muted-foreground"}`}
      />
      AI
    </span>
  );
}

export function AppNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="grid size-8 place-items-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
            <Compass className="size-4 text-primary" />
          </div>
          <span className="hidden font-display font-semibold tracking-tight sm:inline">
            Job Compass
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
              activeProps={{ className: "!text-foreground bg-accent/60" }}
            >
              <Icon className="size-4" />
              <span className="hidden md:inline">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <AiStatusDot />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-2" aria-label="Export">
                <Download className="size-4" />
                <span className="hidden lg:inline">Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={api.exportUrl("xlsx")}>Excel (.xlsx)</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={api.exportUrl("csv")}>CSV</a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link to="/tracker/new">
            <Button size="sm" className="gap-1.5">
              <Plus className="size-4" />
              <span className="hidden sm:inline">Add job</span>
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
