import type { JobStatus } from "./api";

/** Pipeline order. The first three are the forward path; the last two are exits. */
export const STATUSES: JobStatus[] = ["applied", "interview", "offer", "rejected", "withdrawn"];
export const FORWARD: JobStatus[] = ["applied", "interview", "offer"];
export const ACTIVE: JobStatus[] = ["applied", "interview", "offer"];

export const STATUS_META: Record<
  JobStatus,
  { label: string; dot: string; chip: string; hint: string }
> = {
  applied: {
    label: "Applied",
    dot: "bg-primary",
    chip: "bg-primary/15 text-primary ring-primary/30",
    hint: "Application submitted",
  },
  interview: {
    label: "Interview",
    dot: "bg-warning",
    chip: "bg-warning/15 text-warning ring-warning/30",
    hint: "In the interview loop",
  },
  offer: {
    label: "Offer",
    dot: "bg-offer",
    chip: "bg-offer/15 text-offer ring-offer/40",
    hint: "Offer received",
  },
  rejected: {
    label: "Rejected",
    dot: "bg-destructive",
    chip: "bg-destructive/15 text-destructive ring-destructive/30",
    hint: "Rejected or ghosted",
  },
  withdrawn: {
    label: "Withdrawn",
    dot: "bg-muted-foreground",
    chip: "bg-muted text-muted-foreground ring-border",
    hint: "You passed on it",
  },
};

export function formatSalary(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const fmt = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
  if (min != null && max != null) return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
  return min != null ? `${fmt(min)}+` : `up to ${fmt(max!)}`;
}

/** Parse a YYYY-MM-DD date as a local date (no timezone shift). */
export function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Backend timestamps are naive UTC. */
export function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDay(value: string | null | undefined): string | null {
  const d = parseDay(value);
  return d
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function timeAgo(value: string | null | undefined): string {
  const d = parseTimestamp(value);
  if (!d) return "";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function scoreTone(score: number): string {
  if (score >= 75) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-destructive";
}
