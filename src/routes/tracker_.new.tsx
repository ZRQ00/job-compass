import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, JobStatus, STATUS_LABELS } from "@/lib/api";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

const STATUSES: JobStatus[] = ["found", "applied", "interview", "offer", "rejected"];

export const Route = createFileRoute("/tracker_/new")({
    head: () => ({ meta: [{ title: "Add job — Job Compass" }] }),
    component: AddJob,
});

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="text-sm font-medium">{label}</span>
            <div className="mt-1.5">{children}</div>
        </label>
    );
}

const inputClass =
    "w-full px-3 py-2 text-sm rounded-lg border border-border bg-card/40 focus:outline-none focus:ring-1 focus:ring-primary";

function AddJob() {
    const navigate = useNavigate();
    const qc = useQueryClient();

    const [title, setTitle] = useState("");
    const [company, setCompany] = useState("");
    const [url, setUrl] = useState("");
    const [location, setLocation] = useState("");
    const [salaryMin, setSalaryMin] = useState("");
    const [salaryMax, setSalaryMax] = useState("");
    const [status, setStatus] = useState<JobStatus>("found");
    const [notes, setNotes] = useState("");

    const createJob = useMutation({
        mutationFn: () =>
            api.createJob({
                title,
                company,
                job_url: url || undefined,
                location: location || undefined,
                salary_min: salaryMin ? Number(salaryMin) : undefined,
                salary_max: salaryMax ? Number(salaryMax) : undefined,
                status,
                notes: notes || undefined,
                source: "manual",
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["jobs"] });
            qc.invalidateQueries({ queryKey: ["stats"] });
            toast.success("Job added");
            navigate({ to: "/tracker" });
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const canSubmit = title.trim().length > 0 && company.trim().length > 0;

    return (
        <div className="space-y-6 max-w-xl">
            <div>
                <Link
                    to="/tracker"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="size-3.5" />
                    Back to tracker
                </Link>
                <h1 className="text-4xl font-semibold tracking-tight mt-3">Add a job</h1>
                <p className="text-muted-foreground mt-1">
                    Found something manually? Log it here.
                </p>
            </div>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    if (canSubmit) createJob.mutate();
                }}
                className="space-y-4 rounded-xl border border-border bg-card/40 p-5"
            >
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Title">
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Senior Frontend Engineer"
                            className={inputClass}
                            required
                        />
                    </Field>
                    <Field label="Company">
                        <input
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            placeholder="Acme Inc."
                            className={inputClass}
                            required
                        />
                    </Field>
                </div>

                <Field label="Listing URL">
                    <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://…"
                        className={inputClass}
                    />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                    <Field label="Location">
                        <input
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="Remote, Buffalo NY, …"
                            className={inputClass}
                        />
                    </Field>
                    <Field label="Salary range">
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={salaryMin}
                                onChange={(e) => setSalaryMin(e.target.value)}
                                placeholder="Min"
                                className={inputClass}
                            />
                            <span className="text-muted-foreground text-sm">–</span>
                            <input
                                type="number"
                                value={salaryMax}
                                onChange={(e) => setSalaryMax(e.target.value)}
                                placeholder="Max"
                                className={inputClass}
                            />
                        </div>
                    </Field>
                </div>

                <Field label="Status">
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as JobStatus)}
                        className={inputClass}
                    >
                        {STATUSES.map((s) => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                    </select>
                </Field>

                <Field label="Notes">
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Anything worth remembering about this one…"
                        rows={3}
                        className={`${inputClass} resize-none`}
                    />
                </Field>

                <div className="flex items-center justify-end gap-2 pt-2">
                    <Link
                        to="/tracker"
                        className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors"
                    >
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        disabled={!canSubmit || createJob.isPending}
                        className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity inline-flex items-center gap-1.5"
                    >
                        {createJob.isPending && <Loader2 className="size-3.5 animate-spin" />}
                        Add job
                    </button>
                </div>
            </form>
        </div>
    );
}