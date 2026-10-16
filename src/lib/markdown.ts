import TurndownService from "turndown";

/**
 * Job descriptions are stored as Markdown. When you paste from a job board,
 * the clipboard carries HTML, which we convert so bullet lists, numbered
 * lists, headings and bold text survive.
 */

let service: TurndownService | null = null;

function getService(): TurndownService {
  if (service) return service;
  service = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    br: "\n",
  });
  // Page chrome that sometimes rides along with a selection.
  service.remove([
    "script",
    "style",
    "noscript",
    "button",
    "svg",
    "img",
    "iframe",
    "form",
    "input",
    "select",
    "nav",
    "footer",
  ] as TurndownService.Filter);
  // Job boards love <b>Title</b><br> as a heading; keep it as bold text.
  // Don't backslash-escape characters like "1." or "-": the text stays readable
  // in the editor, and it's going to be rendered as Markdown anyway.
  service.escape = (s: string) => s;
  // Default list items are padded ("-   item"); keep them tight ("- item").
  service.addRule("tightListItem", {
    filter: "li",
    replacement(content, node, options) {
      const body = content.replace(/^\n+/, "").replace(/\n+$/, "\n").replace(/\n/gm, "\n   ");
      const parent = node.parentNode as HTMLElement | null;
      let prefix = `${options.bulletListMarker} `;
      if (parent?.nodeName === "OL") {
        const start = Number(parent.getAttribute("start") ?? 1);
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
      }
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? "\n" : "");
    },
  });
  return service;
}

/** True when clipboard HTML has structure worth keeping. */
export function hasStructure(html: string): boolean {
  return /<(li|ul|ol|p|h[1-6]|br|div|strong|b|table)\b/i.test(html);
}

export function htmlToMarkdown(html: string): string {
  return normalizeDescription(getService().turndown(html));
}

/** True when pasted plain text has bullets or indented lines worth converting. */
export function needsNormalizing(text: string): boolean {
  return BULLET_CHAR.test(text) || INDENTED_LINE.test(text);
}

const BULLET_CHAR = /^[ \t]*[•·▪●◦‣∙■□➢➤►–][ \t]*/m;
// 4+ spaces or a tab, not already a list item. In Markdown that would become a
// code block; in job postings it's almost always a list copied as plain text.
const INDENTED_LINE = /^(?: {4,}|\t+)(?![-*+][ \t]|\d+[.)][ \t])(\S.*)$/m;

/**
 * Make job-board text render the way it looks on the site. Safe to run on
 * text that's already Markdown, and run again at display time so older saved
 * descriptions get the fixes too.
 *  - "•" style bullets and indented lines become real list items
 *  - bold markers that Markdown would show literally get fixed
 *    ("**Pay: **" → "**Pay:**", "**Location:**Remote" → "**Location:** Remote")
 */
export function normalizeDescription(text: string): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n");
  let inFence = false;
  const out = lines.map((line) => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) return line;
    let l = line.replace(new RegExp(BULLET_CHAR.source), "- ");
    const m = l.match(new RegExp(INDENTED_LINE.source));
    if (m) l = `- ${m[1]}`;
    return fixBold(l);
  });
  return tidy(out.join("\n"));
}

const WORD = /[\p{L}\p{N}]/u;
const PUNCT = /[\p{P}\p{S}]/u;

function fixBold(line: string): string {
  return line.replace(/\*\*([^*\n]*?)\*\*/g, (match, inner: string, offset: number) => {
    const text = inner.trim();
    if (!text) return inner; // "****" or "** **" from empty <strong> tags
    const before = line[offset - 1] ?? "";
    const after = line[offset + match.length] ?? "";
    // Whitespace that was inside the markers moves outside them.
    let pre = inner.match(/^\s*/)![0];
    let post = inner.match(/\s*$/)![0];
    // Markdown won't open/close bold between a letter and punctuation; add a space.
    if (!pre && WORD.test(before) && PUNCT.test(text[0])) pre = " ";
    if (!post && WORD.test(after) && PUNCT.test(text[text.length - 1])) post = " ";
    return `${pre}**${text}**${post}`;
  });
}

function tidy(md: string): string {
  return md
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}