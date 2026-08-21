import { useRef, useState } from "react";

export interface ScrapeStreamResult {
  jobs_found: number;
  jobs_added: number;
  jobs_duplicate: number;
}

interface ScrapeStreamState {
  running: boolean;
  statusLog: string[];
  current: number;
  total: number;
  site: string | null;
  result: ScrapeStreamResult | null;
}

export function useScrapeStream() {
  const [state, setState] = useState<ScrapeStreamState>({
    running: false,
    statusLog: [],
    current: 0,
    total: 0,
    site: null,
    result: null,
  });
  const esRef = useRef<EventSource | null>(null);

  const start = (url: string, onDone?: (result: ScrapeStreamResult) => void) => {
    esRef.current?.close();
    setState({ running: true, statusLog: [], current: 0, total: 0, site: null, result: null });

    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      const event = JSON.parse(e.data);

      if (event.type === "status") {
        setState((s) => ({ ...s, statusLog: [...s.statusLog, event.text] }));
      } else if (event.type === "progress") {
        setState((s) => ({ ...s, current: event.current, total: event.total, site: event.site }));
      } else if (event.type === "search_start") {
        setState((s) => ({
          ...s,
          statusLog: [...s.statusLog, `Starting "${event.search_term}"...`],
          current: 0,
          total: 0,
        }));
      } else if (event.type === "done") {
        const result: ScrapeStreamResult = {
          jobs_found: event.jobs_found,
          jobs_added: event.jobs_added,
          jobs_duplicate: event.jobs_duplicate,
        };
        setState((s) => ({ ...s, running: false, result }));
        es.close();
        onDone?.(result);
      } else if (event.type === "all_done") {
        const result: ScrapeStreamResult = {
          jobs_found: event.total_found,
          jobs_added: event.total_added,
          jobs_duplicate: 0,
        };
        setState((s) => ({ ...s, running: false, result }));
        es.close();
        onDone?.(result);
      }
    };

    es.onerror = () => {
      setState((s) => ({ ...s, running: false }));
      es.close();
    };
  };

  const cancel = () => {
    esRef.current?.close();
    setState((s) => ({ ...s, running: false }));
  };

  return { ...state, start, cancel };
}