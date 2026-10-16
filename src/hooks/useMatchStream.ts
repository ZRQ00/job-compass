import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, readError } from "@/lib/api";

/**
 * Runs the resume match for one job and streams the model's thinking.
 * Uses fetch (not EventSource) so setup errors such as "no resume uploaded"
 * come back as readable messages instead of a generic connection error.
 */
export function useMatchStream(jobId: number) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [thinking, setThinking] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);

  const cancel = useCallback(
    (silent = false) => {
      if (!abortRef.current) return;
      abortRef.current.abort();
      abortRef.current = null;
      api.cancelMatch(jobId).catch(() => {});
      setRunning(false);
      if (!silent) toast("Match cancelled");
    },
    [jobId],
  );

  // Stop the model if you navigate away mid-run.
  useEffect(() => () => cancel(true), [cancel]);

  const start = useCallback(async () => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setThinking("");
    setRunning(true);
    try {
      const res = await fetch(api.matchStreamUrl(jobId), { signal: ctrl.signal });
      if (!res.ok || !res.body) throw await readError(res);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const ev = JSON.parse(part.slice(6));
          if (ev.type === "thinking") setThinking((t) => t + ev.text);
          else if (ev.type === "done") {
            toast.success(`Match score: ${ev.result.score}`);
            qc.invalidateQueries({ queryKey: ["job", jobId] });
            qc.invalidateQueries({ queryKey: ["jobs"] });
          } else if (ev.type === "error") toast.error(ev.text);
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message || "Match failed");
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setRunning(false);
    }
  }, [jobId, qc]);

  return { running, thinking, elapsed, start, cancel: () => cancel(false) };
}
