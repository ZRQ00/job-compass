import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Plus,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api, type Board } from "@/lib/api";
import { boardHref } from "@/lib/boards";
import { cn } from "@/lib/utils";

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

function useBoards() {
  return useQuery({ queryKey: ["boards"], queryFn: api.boards, staleTime: 60_000 });
}

const input =
  "w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring";

const iconBtn =
  "rounded-md p-2 text-muted-foreground sm:p-1.5 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

// ── add a site ───────────────────────────────────────────────────────────────

function AddBoardForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const add = useMutation({
    mutationFn: () => api.addBoard({ name: name.trim(), url: url.trim() }),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ["boards"] });
      toast.success(b.search ? `Added ${b.name} with search` : `Added ${b.name} as a bookmark`);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && url.trim()) add.mutate();
      }}
      className="mt-3 space-y-2 rounded-lg border border-dashed border-border bg-background/30 p-3"
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Site name"
          className={input}
          aria-label="Site name"
          autoFocus
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className={input}
          aria-label="Site URL"
        />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        To make search work, search the site for{" "}
        <code className="rounded bg-muted px-1 text-foreground">JOBCOMPASS</code> (and{" "}
        <code className="rounded bg-muted px-1 text-foreground">JCLOC</code> as the location, if it
        has one), then paste the results page URL. Any other URL is saved as a bookmark.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim() || !url.trim() || add.isPending}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {add.isPending ? "Adding…" : "Add site"}
        </button>
      </div>
    </form>
  );
}

// ── manage mode: reorder / hide / delete ─────────────────────────────────────

function ManageList({ boards }: { boards: Board[] }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["boards"] });
  const onError = (e: Error) => toast.error(e.message);

  const update = useMutation({
    mutationFn: ({ id, hidden }: { id: number; hidden: boolean }) =>
      api.updateBoard(id, { hidden }),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteBoard(id),
    onSuccess: refresh,
    onError,
  });
  const reorder = useMutation({
    mutationFn: (ids: number[]) => api.reorderBoards(ids),
    onSuccess: (data) => qc.setQueryData(["boards"], data),
    onError,
  });

  const move = (i: number, dir: -1 | 1) => {
    const ids = boards.map((b) => b.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    reorder.mutate(ids);
  };

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {boards.map((b, i) => (
        <li key={b.id} className="flex items-center gap-2 px-3 py-2 text-sm">
          <span className={cn("flex-1 truncate", b.hidden && "text-muted-foreground line-through")}>
            {b.name}
            <span className="ml-2 text-xs text-muted-foreground">
              {b.search ? "search" : "bookmark"}
            </span>
          </span>
          <button className={iconBtn} disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
            <ArrowUp className="size-3.5" />
          </button>
          <button
            className={iconBtn}
            disabled={i === boards.length - 1}
            onClick={() => move(i, 1)}
            title="Move down"
          >
            <ArrowDown className="size-3.5" />
          </button>
          <button
            className={iconBtn}
            onClick={() => update.mutate({ id: b.id, hidden: !b.hidden })}
            title={b.hidden ? "Show" : "Hide"}
          >
            {b.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
          <button
            className={cn(iconBtn, "hover:text-destructive")}
            disabled={b.builtin}
            onClick={() => remove.mutate(b.id)}
            title={b.builtin ? "Built-in sites can be hidden, not deleted" : "Delete"}
          >
            <Trash2 className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── dashboard card ───────────────────────────────────────────────────────────

/** Dashboard card: type a search once, open it on any of your saved sites. */
export function JobBoardsCard() {
  const { q, setQ, location, setLocation } = useRememberedSearch();
  const { data: boards = [], isLoading } = useBoards();
  const [managing, setManaging] = useState(false);
  const [adding, setAdding] = useState(false);
  const visible = boards.filter((b) => !b.hidden);

  return (
    <section className="min-w-0 rounded-xl border border-border bg-card/40 p-4 sm:p-5">
      <div className="mb-1 flex items-center gap-2">
        <Search className="size-4 text-info" />
        <h2 className="flex-1 font-display font-semibold">Find jobs</h2>
        <button
          onClick={() => {
            setManaging((m) => !m);
            setAdding(false);
          }}
          className={iconBtn}
          title={managing ? "Done" : "Manage sites"}
        >
          {managing ? <Check className="size-4" /> : <Settings2 className="size-4" />}
        </button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {managing
          ? "Reorder, hide or remove your sites."
          : "Type your search once and open it on any site. Leave it blank to go to the site's home page."}
      </p>

      {managing ? (
        <ManageList boards={boards} />
      ) : (
        <>
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
            {isLoading && <span className="text-xs text-muted-foreground">Loading…</span>}
            {visible.map((b) => {
              const href = boardHref(b, q, location);
              return (
                <a
                  key={b.id}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
                  title={
                    q.trim() && !b.search
                      ? `${b.name} is a bookmark; opens its home page`
                      : href
                  }
                >
                  <span className="truncate">{b.name}</span>
                  <ExternalLink className="size-3 shrink-0 text-muted-foreground group-hover:text-primary" />
                </a>
              );
            })}
            {!adding && (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <Plus className="size-3.5" /> Add site
              </button>
            )}
          </div>
        </>
      )}

      {adding && !managing && <AddBoardForm onDone={() => setAdding(false)} />}
    </section>
  );
}

/** One-line row of site links for tight spaces (e.g. the Add job page). */
export function JobBoardLinks() {
  const { data: boards = [] } = useBoards();
  const visible = boards.filter((b) => !b.hidden);
  if (!visible.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
      <span className="mr-1">Job boards:</span>
      {visible.map((b, i) => (
        <span key={b.id} className="inline-flex items-center gap-1">
          <a
            href={b.home}
            target="_blank"
            rel="noreferrer"
            className="text-foreground/80 underline-offset-2 hover:text-primary hover:underline"
          >
            {b.name}
          </a>
          {i < visible.length - 1 && <span className="opacity-40">·</span>}
        </span>
      ))}
    </div>
  );
}