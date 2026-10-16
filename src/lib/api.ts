// Typed client for the Job Compass backend (FastAPI, backend/app).

export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:3502";

export type JobStatus = "applied" | "interview" | "offer" | "rejected" | "withdrawn";

export interface MatchDetails {
  strengths: string[];
  gaps: string[];
  suggestions: string[];
}

export interface Job {
  id: number;
  company: string;
  role: string;
  location: string | null;
  date_applied: string | null; // YYYY-MM-DD
  salary_min: number | null;
  salary_max: number | null;
  notes: string | null;
  status: JobStatus;
  job_description: string | null;
  job_url: string | null;
  match_score: number | null;
  match_summary: string | null;
  match_details: MatchDetails | null;
  matched_at: string | null;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
}

export interface JobEvent {
  from_status: JobStatus | null;
  to_status: JobStatus;
  created_at: string;
}

export interface JobDetail extends Job {
  events: JobEvent[];
}

export type JobInput = {
  company: string;
  role: string;
  location?: string | null;
  date_applied?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  notes?: string | null;
  status?: JobStatus;
  job_description?: string | null;
  job_url?: string | null;
};

export interface ExtractResult {
  company: string | null;
  role: string | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
}

export interface ResumeInfo {
  exists: boolean;
  characters: number;
  updated_at: string | null;
  text: string | null;
}

export interface Stats {
  total: number;
  by_status: Record<JobStatus, number>;
  applied_this_week: number;
  weekly_goal: number;
  follow_up_after_days: number;
  response_rate: number | null;
  follow_ups: {
    id: number;
    company: string;
    role: string;
    date_applied: string | null;
    days_waiting: number;
  }[];
  weekly_activity: { week_start: string; applied: number }[];
}

export interface Settings {
  weekly_goal: number;
  follow_up_after_days: number;
}

export interface Health {
  status: string;
  ai: { reachable: boolean; model: string; model_available: boolean };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Turn a FastAPI error body into one readable sentence. */
export async function readError(res: Response): Promise<ApiError> {
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (typeof body.detail === "string") message = body.detail;
    else if (Array.isArray(body.detail))
      message = body.detail
        .map((d: { loc?: string[]; msg: string }) =>
          `${d.loc?.slice(-1)[0] ?? ""}: ${d.msg}`.replace(/^: /, ""),
        )
        .join("; ");
  } catch {
    /* not JSON */
  }
  return new ApiError(res.status, message);
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers:
        init?.body instanceof FormData
          ? init.headers
          : { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, `Can't reach the backend at ${API_BASE}. Is it running?`);
  }
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  health: () => req<Health>("/health"),
  stats: () => req<Stats>("/stats"),
  settings: () => req<Settings>("/settings"),
  updateSettings: (data: Partial<Settings>) =>
    req<Settings>("/settings", { method: "PATCH", body: json(data) }),

  jobs: (params?: { status?: JobStatus; q?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.q) q.set("q", params.q);
    const qs = q.toString();
    return req<Job[]>(`/jobs${qs ? `?${qs}` : ""}`);
  },
  job: (id: number) => req<JobDetail>(`/jobs/${id}`),
  createJob: (data: JobInput) => req<JobDetail>("/jobs", { method: "POST", body: json(data) }),
  updateJob: (id: number, data: Partial<JobInput>) =>
    req<JobDetail>(`/jobs/${id}`, { method: "PATCH", body: json(data) }),
  deleteJob: (id: number) => req<{ deleted: number }>(`/jobs/${id}`, { method: "DELETE" }),
  duplicates: (company: string, role: string) =>
    req<{ duplicates: Job[] }>(
      `/jobs/duplicates?company=${encodeURIComponent(company)}&role=${encodeURIComponent(role)}`,
    ),
  extract: (text: string) =>
    req<ExtractResult>("/jobs/extract", { method: "POST", body: json({ text }) }),

  matchStreamUrl: (id: number) => `${API_BASE}/jobs/${id}/match/stream`,
  cancelMatch: (id: number) =>
    req<{ cancelled: boolean }>(`/jobs/${id}/match/cancel`, { method: "POST" }),
  clearMatch: (id: number) => req<{ cleared: number }>(`/jobs/${id}/match`, { method: "DELETE" }),

  resume: () => req<ResumeInfo>("/resume"),
  uploadResume: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<ResumeInfo>("/resume", { method: "POST", body: fd });
  },
  saveResumeText: (text: string) =>
    req<ResumeInfo>("/resume", { method: "PUT", body: json({ text }) }),
  deleteResume: () => req<ResumeInfo>("/resume", { method: "DELETE" }),

  exportUrl: (format: "csv" | "xlsx") => `${API_BASE}/export/${format}`,
};
