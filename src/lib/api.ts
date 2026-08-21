export const API_BASE = "http://localhost:9500";

export type JobStatus = "found" | "applied" | "interview" | "offer" | "rejected" | "skipped";

export interface Job {
  id: string | number;
  title: string;
  company: string;
  location?: string;
  job_type?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  description?: string;
  requirements?: string;
  tech_stack?: string;
  job_url?: string;
  source?: string;
  status: JobStatus;
  priority?: string;
  fit_score?: number | null;
  notes?: string;
  applied_date?: string | null;
  created_at: string;
  is_remote?: boolean;
  date_posted?: string | null;
  reasoning_score?: number | null;
  fit_reasoning?: string | null;
}

export interface ResumeStatus {
  resume_exists: boolean;
  embedding_exists: boolean;
  preview: string | null;
}


// Fixed: matches backend field names (interview not interviews, offer not offers)
export interface Stats {
  total: number;
  found: number;
  applied: number;
  interview: number;
  offer: number;
  rejected: number;
  skipped: number;
}

export interface ScrapeParams {
  search_term: string;
  salary_min?: number;
  remote_only?: boolean;
  results_wanted?: number;
  sites?: string[];
}

export interface SchedulerStatus {
  running: boolean;
  enabled: boolean;
  interval_hours: number;
  last_run: string | null;
  next_run: string | null;
  last_run_result: {
    total_found: number;
    total_added: number;
    searches: Array<{
      search_term: string;
      jobs_found?: number;
      jobs_added?: number;
      error?: string;
    }>;
  } | null;
  cleanup_enabled: boolean;
  cleanup_days: number;
  last_cleanup: string | null;
  last_cleanup_result: { deleted: number; cutoff: string; days: number; error?: string } | null;
  next_cleanup: string | null;
}
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? res.json() : (res.text() as any)) as Promise<T>;
}

export type JobCreate = Pick<Job, "title" | "company"> &
  Partial<Pick<Job,
    | "location" | "job_type" | "salary_min" | "salary_max" | "salary_currency"
    | "description" | "requirements" | "tech_stack" | "job_url" | "source"
    | "status" | "priority" | "notes" | "is_remote" | "date_posted"
  >>;


export const api = {
  // Stats
  stats: () => req<Stats>("/stats"),
  reasonJobStreamUrl: (id: string | number) => `${API_BASE}/jobs/${id}/reason/stream`,
  // Jobs
  jobsByStatus: (status: JobStatus, limit = 500) =>
    req<Job[]>(`/jobs?status=${encodeURIComponent(status)}&limit=${limit}`),
  jobs: (params?: { search?: string; remote_only?: boolean; salary_min?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.remote_only) q.set("remote_only", "true");
    if (params?.salary_min) q.set("salary_min", String(params.salary_min));
    q.set("limit", String(params?.limit ?? 500));
    return req<Job[]>(`/jobs?${q.toString()}`);
  },
  job: (id: string | number) => req<Job>(`/jobs/${id}`),
  createJob: (data: JobCreate) =>
    req<Job>("/jobs", { method: "POST", body: JSON.stringify(data) }),
  updateJob: (id: string | number, update: Partial<Pick<Job, "status" | "priority" | "notes" | "fit_score">>) =>
    req<Job>(`/jobs/${id}`, { method: "PATCH", body: JSON.stringify(update) }),
  updateStatus: (id: string | number, status: JobStatus) =>
    req<Job>(`/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  deleteJob: (id: string | number) =>
    req<void>(`/jobs/${id}`, { method: "DELETE" }),
  reasonJob: (id: string | number) => req<Job>(`/jobs/${id}/reason`, { method: "POST" }),
  cancelReasonJob: (id: string | number) =>
    req<{ cancelled: boolean }>(`/jobs/${id}/reason/cancel`, { method: "POST" }),
  reasonJobCancelUrl: (id: string | number) => `${API_BASE}/jobs/${id}/reason/cancel`,


  // Scrape
  scrape: (data: ScrapeParams) =>
    req<{ message: string; jobs_found: number; jobs_added: number; jobs_duplicate: number }>(
      "/scrape",
      { method: "POST", body: JSON.stringify(data) }
    ),
  scrapeStreamUrl: (data: ScrapeParams) => {
    const q = new URLSearchParams();
    q.set("search_term", data.search_term);
    if (data.salary_min !== undefined) q.set("salary_min", String(data.salary_min));
    if (data.remote_only !== undefined) q.set("remote_only", String(data.remote_only));
    if (data.results_wanted !== undefined) q.set("results_wanted", String(data.results_wanted));
      (data.sites ?? []).forEach((s) => q.append("sites", s));
    return `${API_BASE}/scrape/stream?${q.toString()}`;
},

  // Scheduler
  scheduler: () => req<SchedulerStatus>("/scheduler"),
  schedulerRunNow: () => req<{ message: string }>("/scheduler/run", { method: "POST" }),
  schedulerToggle: (enabled: boolean) =>
    req<SchedulerStatus>(`/scheduler?enabled=${enabled}`, { method: "PATCH" }),
  schedulerRunStreamUrl: () => `${API_BASE}/scheduler/run/stream`,
  
  // Export
  exportUrl: () => `${API_BASE}/export/xlsx`,

  // Dedup
  dedup: () => req<{ message: string; deleted: number; remaining: number }>("/dedup", { method: "POST" }),

  // Resume
  resumeStatus: () => req<ResumeStatus>("/resume"),
  uploadResume: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/resume`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<{ message: string; characters_extracted: number }>;
  },

  rescore: () =>
    req<{ message: string; scored: number; errors: number; total: number }>("/rescore", { method: "POST" }),
};

export const STATUS_LABELS: Record<JobStatus, string> = {
  found: "Found",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  skipped: "Skipped",
};