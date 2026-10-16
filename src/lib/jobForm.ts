import type { JobInput, JobStatus } from "./api";

export type JobFormValues = {
  company: string;
  role: string;
  location: string;
  status: JobStatus;
  date_applied: string;
  salary_min: string;
  salary_max: string;
  job_url: string;
  notes: string;
  job_description: string;
};

export const emptyJobForm: JobFormValues = {
  company: "",
  role: "",
  location: "",
  status: "applied",
  date_applied: "",
  salary_min: "",
  salary_max: "",
  job_url: "",
  notes: "",
  job_description: "",
};

/** "150k", "$150,000", "150000" → 150000 */
export function parseMoney(v: string): number | null {
  const s = v
    .trim()
    .toLowerCase()
    .replace(/[$,\s]/g, "");
  if (!s) return null;
  const k = s.endsWith("k");
  const n = Number(k ? s.slice(0, -1) : s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(k ? n * 1000 : n);
}

export function toJobInput(v: JobFormValues): JobInput {
  const blank = (s: string) => (s.trim() ? s.trim() : null);
  return {
    company: v.company.trim(),
    role: v.role.trim(),
    location: blank(v.location),
    status: v.status,
    date_applied: blank(v.date_applied),
    salary_min: parseMoney(v.salary_min),
    salary_max: parseMoney(v.salary_max),
    job_url: blank(v.job_url),
    notes: blank(v.notes),
    job_description: blank(v.job_description),
  };
}
