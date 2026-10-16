/**
 * Job boards shown on the dashboard and the Add job page.
 * Edit this list to add, remove or reorder boards. `search` builds a results
 * URL from your keywords + location; leave it out for boards without one.
 */
export interface JobBoard {
  id: string;
  name: string;
  home: string;
  search?: (q: string, location: string) => string;
}

const enc = encodeURIComponent;

export const JOB_BOARDS: JobBoard[] = [
  {
    id: "linkedin",
    name: "LinkedIn",
    home: "https://www.linkedin.com/jobs/",
    search: (q, l) => `https://www.linkedin.com/jobs/search/?keywords=${enc(q)}&location=${enc(l)}`,
  },
  {
    id: "indeed",
    name: "Indeed",
    home: "https://www.indeed.com/",
    search: (q, l) => `https://www.indeed.com/jobs?q=${enc(q)}&l=${enc(l)}`,
  },
  {
    id: "glassdoor",
    name: "Glassdoor",
    home: "https://www.glassdoor.com/Job/index.htm",
    search: (q) => `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${enc(q)}`,
  },
  {
    id: "ziprecruiter",
    name: "ZipRecruiter",
    home: "https://www.ziprecruiter.com/",
    search: (q, l) =>
      `https://www.ziprecruiter.com/jobs-search?search=${enc(q)}&location=${enc(l)}`,
  },
  {
    id: "dice",
    name: "Dice",
    home: "https://www.dice.com/",
    search: (q, l) => `https://www.dice.com/jobs?q=${enc(q)}&location=${enc(l)}`,
  },
  {
    id: "wellfound",
    name: "Wellfound",
    home: "https://wellfound.com/jobs",
  },
  {
    id: "builtin",
    name: "Built In",
    home: "https://builtin.com/jobs",
    search: (q) => `https://builtin.com/jobs?search=${enc(q)}`,
  },
  {
    id: "hn",
    name: "HN Who's Hiring",
    home: "https://hnhiring.com/",
  },
];

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
