import { Link } from "@tanstack/react-router";
import { Briefcase, LayoutDashboard, Search, Kanban, Download, ScrollText } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/discover", label: "Discover", icon: Search },
  { to: "/tracker", label: "Tracker", icon: Kanban },
  { to: "/browse", label: "Browse", icon: Search },
  { to: "/resume", label: "Resume", icon: ScrollText },
] as const;

export function AppNav() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="size-8 rounded-lg bg-primary/15 grid place-items-center ring-1 ring-primary/30">
            <Briefcase className="size-4 text-primary" />
          </div>
          <span className="font-display font-semibold tracking-tight">Job Compass</span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40 flex items-center gap-2 transition-colors"
              activeProps={{ className: "!text-foreground bg-accent/60" }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <a href={api.exportUrl()} target="_blank" rel="noreferrer">
          <Button size="sm" variant="secondary" className="gap-2">
            <Download className="size-4" /> Export
          </Button>
        </a>
      </div>
    </header>
  );
}
