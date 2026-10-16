import { useEffect, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { JOB_BOARDS } from "@/lib/boards";

const STORAGE_KEY = "job-board-search";

function useRememberedSearch() {
  const [q, setQ] = useState("");
  const [location, setLocation] = useState("");
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      if (typeof saved.q === "string") setQ(saved.q);
      if (typeof saved.location === "string") setLocation(saved.location);
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ q, location }));
    } catch {
      /* ignore */
    }
  }, [q, location]);
  return { q, setQ, location, setLocation };
}

const input =
  "w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring";

/** Dashboard card: type a search once, open it on any board. */
export function JobBoardsCard() {
  const { q, setQ, location, setLocation } = useRememberedSearch();
  const hasQuery = q.trim().length > 0;
  return (
    <section className="rounded-xl border border-border bg-card/40 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Search className="size-4 text-info" />
        <h2 className="font-display font-semibold">Find jobs</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Type your search once and open it on any board. Leave it blank to go to the board's home
        page.
      </p>
      <div className="mb-4 grid gap-2 sm:grid-cols-[1.4fr_1fr]">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Machine learning engineer"
          className={input}
          aria-label="Keywords"
        />
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Remote, New York…"
          className={input}
          aria-label="Location"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {JOB_BOARDS.map((b) => {
          const href = hasQuery && b.search ? b.search(q.trim(), location.trim()) : b.home;
          return (
            <a
              key={b.id}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
              title={
                hasQuery && !b.search
                  ? `${b.name} doesn't support search links; opens the home page`
                  : href
              }
            >
              <span className="truncate">{b.name}</span>
              <ExternalLink className="size-3 shrink-0 text-muted-foreground group-hover:text-primary" />
            </a>
          );
        })}
      </div>
    </section>
  );
}

/** One-line row of board links for tight spaces (e.g. the Add job page). */
export function JobBoardLinks() {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
      <span className="mr-1">Job boards:</span>
      {JOB_BOARDS.map((b, i) => (
        <span key={b.id} className="inline-flex items-center gap-1">
          <a
            href={b.home}
            target="_blank"
            rel="noreferrer"
            className="text-foreground/80 underline-offset-2 hover:text-primary hover:underline"
          >
            {b.name}
          </a>
          {i < JOB_BOARDS.length - 1 && <span className="opacity-40">·</span>}
        </span>
      ))}
    </div>
  );
}
