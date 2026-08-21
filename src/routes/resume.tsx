import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { FileText, Upload, RefreshCw, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/resume")({
  head: () => ({ meta: [{ title: "Resume — Job Compass" }] }),
  component: ResumePage,
});

function ResumePage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["resume"],
    queryFn: () => api.resumeStatus(),
  });

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadResume(file),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["resume"] });
      toast.success(`Resume updated — ${res.characters_extracted.toLocaleString()} characters extracted`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rescore = useMutation({
    mutationFn: () => api.rescore(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success(`Rescored ${res.scored} jobs${res.errors ? ` (${res.errors} errors)` : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = (file: File | null) => {
    if (!file) return;
    const ok = file.name.toLowerCase().endsWith(".pdf") || file.name.toLowerCase().endsWith(".txt");
    if (!ok) {
      toast.error("Please upload a PDF or plain text file");
      return;
    }
    upload.mutate(file);
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">Resume</h1>
        <p className="text-muted-foreground mt-1">
          Used to score how well each job matches your background.
        </p>
      </div>

      {/* Status */}
      <div className="rounded-xl border border-border bg-card/40 p-5 space-y-3">
        {isLoading ? (
          <div className="py-4 grid place-items-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              {status?.resume_exists ? (
                <CheckCircle2 className="size-4 text-success" />
              ) : (
                <XCircle className="size-4 text-muted-foreground" />
              )}
              <span>{status?.resume_exists ? "Resume on file" : "No resume uploaded yet"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {status?.embedding_exists ? (
                <CheckCircle2 className="size-4 text-success" />
              ) : (
                <XCircle className="size-4 text-muted-foreground" />
              )}
              <span>{status?.embedding_exists ? "Embedding computed" : "Embedding not computed"}</span>
            </div>
            {status?.preview && (
              <div className="mt-2 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-1">Preview</p>
                <p className="text-sm text-foreground/80 leading-relaxed line-clamp-4">
                  {status.preview}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Upload */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0] ?? null);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        {upload.isPending ? (
          <Loader2 className="size-6 mx-auto mb-2 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="size-6 mx-auto mb-2 text-muted-foreground" />
        )}
        <p className="text-sm font-medium">
          {upload.isPending ? "Uploading…" : "Drop your resume here, or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">PDF or plain text</p>
      </div>

      {/* Rescore */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card/40 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="size-4" />
          Updated your resume? Rescore everything already in the tracker.
        </div>
        <button
          onClick={() => rescore.mutate()}
          disabled={rescore.isPending || !status?.embedding_exists}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {rescore.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Rescore jobs
        </button>
      </div>
    </div>
  );
}