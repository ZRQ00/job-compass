import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, type JobInput, type JobStatus } from "@/lib/api";
import { parseMoney, toJobInput, type JobFormValues } from "@/lib/jobForm";
import { STATUS_META, STATUSES, todayISO } from "@/lib/jobs";
import { StatusBadge } from "@/components/StatusBadge";
import { JobDescription } from "@/components/JobDescription";
import {
  hasStructure,
  htmlToMarkdown,
  needsNormalizing,
  normalizeDescription,
} from "@/lib/markdown";
import { cn } from "@/lib/utils";

const input =
  "w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring";

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="ml-2 text-xs text-muted-foreground">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function JobForm({
  initial,
  mode,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
  autoExtract = false,
  editingId,
}: {
  initial: JobFormValues;
  mode: "create" | "edit";
  pending: boolean;
  submitLabel: string;
  onSubmit: (values: JobInput) => void;
  onCancel: () => void;
  autoExtract?: boolean;
  editingId?: number;
}) {
  const [v, setV] = useState<JobFormValues>(initial);
  const vRef = useRef(v);
  vRef.current = v;
  const set = <K extends keyof JobFormValues>(k: K, val: JobFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  // ── AI autofill from the pasted description ────────────────────────────────
  const extract = useMutation({
    mutationFn: (text: string) => api.extract(text),
    onSuccess: (r) => {
      // Only fill fields that are still empty, so nothing you typed is overwritten.
      const next = { ...vRef.current };
      let filled = 0;
      const fill = (
        k: "company" | "role" | "location" | "salary_min" | "salary_max",
        val: string | number | null,
      ) => {
        if (val != null && val !== "" && !next[k].trim()) {
          next[k] = String(val);
          filled++;
        }
      };
      fill("company", r.company);
      fill("role", r.role);
      fill("location", r.location);
      fill("salary_min", r.salary_min);
      fill("salary_max", r.salary_max);
      setV(next);
      toast.success(
        filled
          ? `Filled ${filled} field${filled === 1 ? "" : "s"} from the description`
          : "Nothing new to fill in",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ranAuto = useRef(false);
  useEffect(() => {
    if (autoExtract && !ranAuto.current && v.job_description.trim().length >= 80) {
      ranAuto.current = true;
      extract.mutate(v.job_description);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExtract]);

  // ── duplicate warning ──────────────────────────────────────────────────────
  const dCompany = useDebounced(v.company.trim(), 400);
  const dRole = useDebounced(v.role.trim(), 400);
  const dupes = useQuery({
    queryKey: ["duplicates", dCompany, dRole],
    queryFn: () => api.duplicates(dCompany, dRole),
    enabled: dCompany.length > 1,
  });
  const duplicates = (dupes.data?.duplicates ?? []).filter((d) => d.id !== editingId);

  const setStatus = (s: JobStatus) => {
    setV((p) => ({
      ...p,
      status: s,
      date_applied: s !== "withdrawn" && !p.date_applied ? todayISO() : p.date_applied,
    }));
  };

  // ── description editor: keep formatting on paste ───────────────────────────
  const [jdTab, setJdTab] = useState<"write" | "preview">("write");
  const jdRef = useRef<HTMLTextAreaElement>(null);
  const onPasteDescription = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html");
    const plain = e.clipboardData.getData("text/plain");
    let insert: string | null = null;
    if (html && hasStructure(html)) insert = htmlToMarkdown(html);
    else if (plain && needsNormalizing(plain)) insert = normalizeDescription(plain);
    if (!insert) return; // let the browser paste normally
    e.preventDefault();
    const el = e.currentTarget;
    el.focus();
    // execCommand keeps the native undo stack working; fall back to a manual splice.
    if (!document.execCommand("insertText", false, insert)) {
      const { selectionStart: a, selectionEnd: b, value } = el;
      set("job_description", value.slice(0, a) + insert + value.slice(b));
    }
  };

  const salaryInvalid =
    (v.salary_min.trim() && parseMoney(v.salary_min) == null) ||
    (v.salary_max.trim() && parseMoney(v.salary_max) == null) ||
    (parseMoney(v.salary_min) ?? 0) > (parseMoney(v.salary_max) ?? Infinity);
  const canSubmit = v.company.trim() && v.role.trim() && !salaryInvalid && !pending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(toJobInput(v));
      }}
      className="grid gap-6 lg:grid-cols-[1fr_1.1fr]"
    >
      {/* Step 1: description */}
      <section className="flex flex-col rounded-xl border border-border bg-card/40 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">
              {mode === "create" && <span className="mr-2 text-muted-foreground">1</span>}Job
              description
            </h2>
            <p className="text-xs text-muted-foreground">
              Paste the full posting. Formatting is kept; it powers autofill and matching.
            </p>
          </div>
          <button
            type="button"
            onClick={() => extract.mutate(v.job_description)}
            disabled={v.job_description.trim().length < 20 || extract.isPending}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
            title="Read the description and fill in company, role, location and salary"
          >
            {extract.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {extract.isPending ? "Reading…" : "Autofill"}
          </button>
        </div>
        <div className="mb-2 inline-flex self-start rounded-lg border border-border bg-background/40 p-0.5 text-xs">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setJdTab(t)}
              className={cn(
                "rounded-md px-2.5 py-1 capitalize transition-colors",
                jdTab === t
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        {jdTab === "write" ? (
          <textarea
            ref={jdRef}
            value={v.job_description}
            onChange={(e) => set("job_description", e.target.value)}
            onPaste={onPasteDescription}
            placeholder={
              "Paste the job description here. Lists, headings and bold text are kept.\n\nYou can also type Markdown:\n## Requirements\n- 5+ years Python\n- **PyTorch**"
            }
            className={`${input} min-h-[260px] flex-1 resize-y font-mono text-xs leading-relaxed lg:min-h-[480px]`}
          />
        ) : (
          <div className="min-h-[260px] flex-1 overflow-y-auto rounded-lg border border-border bg-background/30 p-4 lg:max-h-[640px] lg:min-h-[480px]">
            {v.job_description.trim() ? (
              <JobDescription text={v.job_description} />
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </section>

      {/* Step 2: details */}
      <section className="space-y-4 rounded-xl border border-border bg-card/40 p-5">
        <h2 className="font-display text-base font-semibold">
          {mode === "create" && <span className="mr-2 text-muted-foreground">2</span>}Details
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company">
            <input
              value={v.company}
              onChange={(e) => set("company", e.target.value)}
              placeholder="Acme Inc."
              className={input}
              required
              autoFocus={mode === "create" && !initial.job_description}
            />
          </Field>
          <Field label="Role">
            <input
              value={v.role}
              onChange={(e) => set("role", e.target.value)}
              placeholder="Senior ML Engineer"
              className={input}
              required
            />
          </Field>
        </div>

        {duplicates.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <div>
              Already tracking {duplicates.length === 1 ? "a job" : `${duplicates.length} jobs`} at
              this company:{" "}
              {duplicates.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ", "}
                  <Link
                    to="/tracker/$jobId"
                    params={{ jobId: String(d.id) }}
                    className="underline underline-offset-2"
                  >
                    {d.role}
                  </Link>{" "}
                  ({STATUS_META[d.status].label.toLowerCase()})
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location">
            <input
              value={v.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Remote, NYC hybrid…"
              className={input}
            />
          </Field>
          <Field label="Salary range" hint="150k or 150000">
            <div className="flex items-center gap-2">
              <input
                value={v.salary_min}
                onChange={(e) => set("salary_min", e.target.value)}
                placeholder="Min"
                inputMode="numeric"
                className={input}
                aria-label="Salary min"
              />
              <span className="text-muted-foreground">–</span>
              <input
                value={v.salary_max}
                onChange={(e) => set("salary_max", e.target.value)}
                placeholder="Max"
                inputMode="numeric"
                className={input}
                aria-label="Salary max"
              />
            </div>
            {salaryInvalid && (
              <p className="mt-1 text-xs text-destructive">
                Check the salary numbers (min must be ≤ max).
              </p>
            )}
          </Field>
        </div>

        <Field label="Status">
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-full transition-opacity ${v.status === s ? "" : "opacity-45 hover:opacity-80"}`}
                aria-pressed={v.status === s}
              >
                <StatusBadge status={s} className={v.status === s ? "ring-2" : ""} />
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date applied">
            <input
              type="date"
              value={v.date_applied}
              onChange={(e) => set("date_applied", e.target.value)}
              className={`${input} [color-scheme:dark]`}
            />
          </Field>
          <Field label="Link to posting">
            <input
              type="url"
              value={v.job_url}
              onChange={(e) => set("job_url", e.target.value)}
              placeholder="https://…"
              className={input}
            />
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            value={v.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Referral, recruiter name, why it's interesting…"
            rows={4}
            className={`${input} resize-y`}
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </section>
    </form>
  );
}