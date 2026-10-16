import { useAutoScroll } from "@/hooks/useAutoScroll";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, CircleAlert, Lightbulb, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { api, type Job } from "@/lib/api";
import { scoreTone, timeAgo } from "@/lib/jobs";
import { useMatchStream } from "@/hooks/useMatchStream";

function ScoreRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-16 shrink-0 place-items-center">
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" className="stroke-border" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          className={`${scoreTone(score)} stroke-current transition-all`}
        />
      </svg>
      <span className={`font-display text-lg font-semibold ${scoreTone(score)}`}>{score}</span>
    </div>
  );
}

function List({
  icon: Icon,
  title,
  items,
  tone,
}: {
  icon: typeof CheckCircle2;
  title: string;
  items: string[];
  tone: string;
}) {
  if (!items.length) return null;
  return (
    <div>
      <h4
        className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${tone}`}
      >
        <Icon className="size-3.5" />
        {title}
      </h4>
      <ul className="space-y-1.5 text-sm text-foreground/85">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 leading-snug">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MatchPanel({ job }: { job: Job }) {
  const { running, thinking, elapsed, start, cancel } = useMatchStream(job.id);
  const scroll = useAutoScroll<HTMLDivElement>(thinking);
  const resume = useQuery({ queryKey: ["resume"], queryFn: api.resume });
  const hasJD = !!job.job_description?.trim();
  const hasResume = !!resume.data?.exists;
  const blocked = !hasJD
    ? "Add a job description to run a match."
    : resume.data && !hasResume
      ? "no-resume"
      : null;

  return (
    <section className="rounded-xl border border-border bg-card/40 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display font-semibold">
          <Sparkles className="size-4 text-primary" /> Resume match
        </h3>
        {job.match_score != null && !running && (
          <button
            onClick={start}
            disabled={!!blocked}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className="size-3" /> Re-run
          </button>
        )}
      </div>

      {running ? (
        <div className="space-y-3">
          <div className="relative h-1.5 overflow-hidden rounded-full bg-border">
            <div className="absolute inset-y-0 w-1/3 animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" /> Reasoning… {elapsed}s
              {elapsed > 30 && " (cold starts can take a few minutes)"}
            </span>
            <button onClick={cancel} className="transition-colors hover:text-destructive">
              Cancel
            </button>
          </div>
          {thinking && (
            <div ref={scroll.ref as any} onScroll={scroll.onScroll} className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-background/60 p-3 text-xs italic leading-relaxed text-muted-foreground">
              {thinking}
            </div>
          )}
        </div>
      ) : job.match_score != null ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <ScoreRing score={job.match_score} />
            <div className="min-w-0">
              <p className="text-sm leading-relaxed text-foreground/90">{job.match_summary}</p>
              {job.matched_at && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Matched {timeAgo(job.matched_at)}
                </p>
              )}
            </div>
          </div>
          {job.match_details && (
            <div className="space-y-4 border-t border-border pt-4">
              <List
                icon={CheckCircle2}
                title="Strengths"
                items={job.match_details.strengths}
                tone="text-success"
              />
              <List
                icon={CircleAlert}
                title="Gaps"
                items={job.match_details.gaps}
                tone="text-warning"
              />
              <List
                icon={Lightbulb}
                title="Tailor your resume"
                items={job.match_details.suggestions}
                tone="text-info"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Have the reasoning model compare your resume to this job: a fit score, where you're
            strong, the gaps, and how to tailor your resume.
          </p>
          {blocked === "no-resume" ? (
            <p className="text-xs text-warning">
              Upload your resume on the{" "}
              <Link to="/resume" className="underline underline-offset-2">
                Resume page
              </Link>{" "}
              first.
            </p>
          ) : blocked ? (
            <p className="text-xs text-warning">{blocked}</p>
          ) : null}
          <button
            onClick={start}
            disabled={!!blocked}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="size-3.5" /> Match my resume
          </button>
        </div>
      )}
    </section>
  );
}
