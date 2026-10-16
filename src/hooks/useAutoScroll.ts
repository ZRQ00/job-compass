import { useEffect, useRef } from "react";

/** Keeps a scrollable box pinned to the bottom while content streams in,
 *  unless you've scrolled up to read. */
export function useAutoScroll<T extends HTMLElement>(content: unknown) {
  const ref = useRef<T>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [content]);

  const onScroll = () => {
    const el = ref.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return { ref, onScroll };
}