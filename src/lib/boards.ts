/**
 * Job sites now live in the database (see the Find jobs card to add, hide or
 * reorder them). This file only builds search links and labels posting URLs.
 */
import type { Board } from "@/lib/api";

const enc = encodeURIComponent;

/** The link for a site: its search results if it has a template and you typed
 *  keywords, otherwise its home page. */
export function boardHref(board: Board, q: string, location: string): string {
  const query = q.trim();
  if (!query || !board.search) return board.home;
  return board.search
    .replaceAll("{query}", enc(query))
    .replaceAll("{location}", enc(location.trim()));
}

/** Recognize which board a posting URL came from (for the job page badge). */
const HOSTS: [RegExp, string][] = [
  [/linkedin\.com/i, "LinkedIn"],
  [/indeed\.com/i, "Indeed"],
  [/glassdoor\./i, "Glassdoor"],
  [/ziprecruiter\.com/i, "ZipRecruiter"],
  [/dice\.com/i, "Dice"],
  [/wellfound\.com|angel\.co/i, "Wellfound"],
  [/builtin\.com/i, "Built In"],
  [/ycombinator\.com|hnhiring\.com/i, "Hacker News"],
  [/greenhouse\.io/i, "Greenhouse"],
  [/lever\.co/i, "Lever"],
  [/ashbyhq\.com/i, "Ashby"],
  [/myworkdayjobs\.com|workday\.com/i, "Workday"],
];

export function boardFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  for (const [re, name] of HOSTS) if (re.test(url)) return name;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}