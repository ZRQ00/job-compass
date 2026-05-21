export const API_BASE = "http://localhost:8090";

export type JobStatus = "found" | "applied" | "interview" | "offer" | "rejected";

export interface Job {
  id: string | number;
  title: string;
  company: string;
  location?: string;
  salary?: string | number;
  url?: string;
  remote?: boolean;
  status: JobStatus;
  description?: string;
  posted_at?: string;
  source?: string;
  tags?: string[];
}

export interface Stats {
  total: number;
  applied: number;
  interviews: number;
  offers: number;
}

export interface ScrapeParams {
  search: string;
  salary_min?: number;
  remote_only?: boolean;
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

export const api = {
  stats: () => req<Stats>("/stats"),
  jobsByStatus: (status: JobStatus) =>
    req<Job[]>(`/jobs?status=${encodeURIComponent(status)}`),
  job: (id: string | number) => req<Job>(`/jobs/${id}`),
  scrape: (data: ScrapeParams) =>
    req<Job[]>("/scrape", { method: "POST", body: JSON.stringify(data) }),
  updateStatus: (id: string | number, status: JobStatus) =>
    req<Job>(`/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  exportUrl: () => `${API_BASE}/export/xlsx`,
};

export const STATUS_LABELS: Record<JobStatus, string> = {
  found: "Found",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};
