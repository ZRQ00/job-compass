import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { normalizeDescription } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * Renders a stored job description. Markdown (lists, headings, bold, tables)
 * is formatted; single line breaks from plain-text pastes are kept as-is.
 * Raw HTML is never rendered, so pasted content can't inject anything.
 */
export function JobDescription({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("jd text-sm text-foreground/85", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {normalizeDescription(text)}
      </ReactMarkdown>
    </div>
  );
}
