import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { JobForm } from "@/components/JobForm";
import { JobBoardLinks } from "@/components/JobBoards";
import { emptyJobForm } from "@/lib/jobForm";
import { todayISO } from "@/lib/jobs";
import { htmlToMarkdown, normalizeDescription } from "@/lib/markdown";

export const Route = createFileRoute("/tracker_/new")({
  head: () => ({ meta: [{ title: "Add job · Job Compass" }] }),
  component: AddJob,
});

type Capture = { url: string; title: string; jd: string };

/**
 * The bookmarklet sends the page URL, title and the highlighted part of the
 * posting (as HTML, so lists survive) in the URL *hash*. The hash never goes
 * to the server, so long descriptions don't hit request-size limits.
 */
function readCapture(): Capture | null {
  const hash = window.location.hash;
  if (!hash.startsWith("#capture=")) return null;
  try {
    const data = JSON.parse(decodeURIComponent(hash.slice("#capture=".length)));
    const jd = data.html
      ? htmlToMarkdown(String(data.html))
      : normalizeDescription(String(data.text ?? ""));
    return { url: String(data.url ?? ""), title: String(data.title ?? ""), jd };
  } catch {
    return null;
  } finally {
    // Don't leave the payload sitting in the address bar / history.
    history.replaceState(null, "", window.location.pathname);
  }
}

function bookmarkletCode(origin: string): string {
  // Keep it dependency-free: copy the selection, strip attributes so the
  // payload stays small, and open Job Compass with it in the hash.
  return (
    "javascript:(()=>{const s=getSelection(),d=document.createElement('div');" +
    "for(let i=0;i<s.rangeCount;i++)d.appendChild(s.getRangeAt(i).cloneContents());" +
    "d.querySelectorAll('script,style,svg,img,button').forEach(e=>e.remove());" +
    "d.querySelectorAll('*').forEach(e=>{for(const a of [...e.attributes])if(a.name!=='href')e.removeAttribute(a.name)});" +
    "const p={url:location.href,title:document.title,html:d.innerHTML.slice(0,200000),text:String(s).slice(0,50000)};" +
    `window.open('${origin}/tracker/new#capture='+encodeURIComponent(JSON.stringify(p)),'_blank')})()`
  );
}

function CaptureBookmarklet() {
  const ref = useRef<HTMLAnchorElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // React refuses javascript: hrefs in JSX, so set it directly.
    ref.current?.setAttribute("href", bookmarkletCode(window.location.origin));
    setReady(true);
  }, []);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/30 px-4 py-3 text-xs text-muted-foreground">
      <Bookmark className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <strong className="text-foreground">Capture from any job board:</strong> drag this button to
        your bookmarks bar. On a posting, highlight the description and click it. This page opens
        pre-filled, formatting included.
      </span>
      <a
        ref={ref}
        onClick={(e) => {
          e.preventDefault();
          toast("Drag it to your bookmarks bar instead of clicking");
        }}
        className={`cursor-grab rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 font-medium text-primary ${ready ? "" : "pointer-events-none opacity-50"}`}
      >
        + Job Compass
      </a>
    </div>
  );
}

function AddJob() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // undefined = not read yet (first client render), null = nothing captured
  const [capture, setCapture] = useState<Capture | null | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    setCapture(readCapture());
    // If this page is already open when the bookmark fires, only the hash changes.
    const onHash = () => {
      const c = readCapture();
      if (c) {
        setCapture(c);
        setFormKey((k) => k + 1);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const createJob = useMutation({
    mutationFn: api.createJob,
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success(`Added ${job.role} at ${job.company}`);
      navigate({ to: "/tracker/$jobId", params: { jobId: String(job.id) } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/tracker"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to tracker
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Add a job</h1>
        <p className="mt-1 text-muted-foreground">
          {capture
            ? `Captured${capture.title ? ` "${capture.title}"` : ""}. Check the details and save.`
            : "Paste the description, autofill the details, save."}
        </p>
      </div>

      {capture === null && (
        <div className="space-y-3">
          <CaptureBookmarklet />
          <JobBoardLinks />
        </div>
      )}

      {capture !== undefined && (
        <JobForm
          key={formKey}
          mode="create"
          initial={{
            ...emptyJobForm,
            date_applied: todayISO(),
            job_url: capture?.url ?? "",
            job_description: capture?.jd ?? "",
          }}
          autoExtract={!!capture}
          pending={createJob.isPending}
          submitLabel="Save job"
          onSubmit={(v) => createJob.mutate(v)}
          onCancel={() => navigate({ to: "/tracker" })}
        />
      )}
    </div>
  );
}
