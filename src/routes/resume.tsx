import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, type ResumeInfo } from "@/lib/api";
import { timeAgo } from "@/lib/jobs";

export const Route = createFileRoute("/resume")({
  head: () => ({ meta: [{ title: "Resume · Job Compass" }] }),
  component: ResumePage,
});

function ResumePage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [text, setText] = useState("");

  const { data: resume, isLoading } = useQuery({ queryKey: ["resume"], queryFn: api.resume });
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health });

  useEffect(() => setText(resume?.text ?? ""), [resume?.text]);

  const onSaved = (r: ResumeInfo, msg: string) => {
    qc.setQueryData(["resume"], r);
    toast.success(msg);
  };
  const upload = useMutation({
    mutationFn: api.uploadResume,
    onSuccess: (r) => onSaved(r, `Resume uploaded · ${r.characters.toLocaleString()} characters`),
    onError: (e: Error) => toast.error(e.message),
  });
  const saveText = useMutation({
    mutationFn: () => api.saveResumeText(text),
    onSuccess: (r) => onSaved(r, "Resume text saved"),
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!/\.(pdf|docx|txt|md)$/i.test(f.name))
      return toast.error("Upload a PDF, DOCX, TXT or MD file");
    upload.mutate(f);
  };

  const aiOk = health?.ai.reachable && health.ai.model_available;
  const dirty = (resume?.text ?? "") !== text;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Resume</h1>
        <p className="mt-1 text-muted-foreground">
          The reasoning model compares this against each job you choose to match.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatusRow
          ok={!!resume?.exists}
          loading={isLoading}
          okText={`Resume on file${resume?.updated_at ? ` · updated ${timeAgo(resume.updated_at)}` : ""}`}
          badText="No resume uploaded yet"
        />
        <StatusRow
          ok={!!aiOk}
          loading={!health}
          okText={`AI ready · ${health?.ai.model}`}
          badText={
            health?.ai.reachable
              ? `Run: ollama pull ${health.ai.model}`
              : "Ollama offline: start it with `ollama serve`"
          }
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => fileRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {upload.isPending ? (
          <Loader2 className="mx-auto mb-2 size-6 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="mx-auto mb-2 size-6 text-muted-foreground" />
        )}
        <p className="text-sm font-medium">
          {resume?.exists ? "Replace your resume" : "Drop your resume here, or click to browse"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX, TXT or Markdown</p>
      </div>

      {resume?.exists && (
        <section className="rounded-xl border border-border bg-card/40 p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-semibold">Extracted text</h3>
              <p className="text-xs text-muted-foreground">
                This is exactly what the model reads. Fix any PDF extraction glitches here.
              </p>
            </div>
            <button
              onClick={() => saveText.mutate()}
              disabled={!dirty || saveText.isPending || !text.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
            >
              {saveText.isPending && <Loader2 className="size-3 animate-spin" />}
              Save
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={18}
            className="w-full resize-y rounded-lg border border-border bg-background/50 p-3 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </section>
      )}
    </div>
  );
}

function StatusRow({
  ok,
  loading,
  okText,
  badText,
}: {
  ok: boolean;
  loading: boolean;
  okText: string;
  badText: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card/40 px-4 py-3 text-sm">
      {loading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : ok ? (
        <CheckCircle2 className="size-4 shrink-0 text-success" />
      ) : (
        <XCircle className="size-4 shrink-0 text-warning" />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>
        {loading ? "Checking…" : ok ? okText : badText}
      </span>
    </div>
  );
}
