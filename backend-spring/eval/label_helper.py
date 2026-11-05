#!/usr/bin/env python3
"""Build the labelled dataset for the extraction eval.

Posting text comes from your tracker (jobs that have a description) or from a folder of .txt files.
For each posting the API's /jobs/extract pre-fills the answers; you press Enter to accept a field,
type a correction, or type - for "not stated". Each finished posting is appended to dataset.jsonl,
so you can quit (q) and resume later.

    python eval/label_helper.py --api http://localhost:9500
    python eval/label_helper.py --dir eval/raw

Careful: pre-filling anchors you on the model's guess. Read the posting, not the suggestion. The
cleanest labels come from labelling with the pre-fill turned off (--no-prefill).
"""
import argparse
import json
import re
import sys
import urllib.request

FIELDS = ["company", "role", "location", "salary_min", "salary_max"]
NUMERIC = {"salary_min", "salary_max"}


def api(base, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base + path, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


def parse_number(s):
    """'$120k' -> 120000, '120,000' -> 120000, '' or '-' -> None."""
    s = s.strip().lower().replace(",", "").replace("$", "")
    if not s or s == "-":
        return None
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*k?", s)
    if not m:
        raise ValueError(s)
    value = float(m.group(1)) * (1000 if s.endswith("k") else 1)
    return int(round(value))


def ask(field, suggestion, inp=input, out=print):
    """Prompt for one field. Returns the final value (str, int or None)."""
    shown = "" if suggestion in (None, "") else str(suggestion)
    while True:
        raw = inp(f"  {field} [{shown}]: ").strip()
        if raw.lower() == "q":
            raise KeyboardInterrupt
        if raw == "":
            value = suggestion
        elif raw == "-":
            value = None
        else:
            value = raw
        if field in NUMERIC:
            try:
                return parse_number(str(value)) if value is not None else None
            except ValueError:
                out("  Enter a number like 120000 or 120k, or - for none.")
                continue
        return None if value in (None, "") else str(value).strip()


def load_sources(args):
    if args.dir:
        import pathlib
        for p in sorted(pathlib.Path(args.dir).glob("*.txt")):
            yield f"file:{p.name}", p.read_text(encoding="utf-8")
    else:
        for job in api(args.api, "/jobs"):
            detail = api(args.api, f"/jobs/{job['id']}")
            text = detail.get("job_description") or ""
            if len(text) >= 20:
                yield f"tracker:{job['id']}", text


def done_ids(path):
    try:
        with open(path, encoding="utf-8") as f:
            return {json.loads(line)["id"] for line in f if line.strip()}
    except FileNotFoundError:
        return set()


def main(argv=None, inp=input, out=print):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default="http://localhost:9500")
    ap.add_argument("--dir", help="folder of .txt postings instead of the tracker")
    ap.add_argument("--out", default="eval/dataset.jsonl")
    ap.add_argument("--no-prefill", action="store_true", help="start blank to avoid anchoring on model guesses")
    args = ap.parse_args(argv)

    seen = done_ids(args.out)
    todo = [(i, t) for i, t in load_sources(args) if i not in seen]
    out(f"{len(seen)} labelled, {len(todo)} to go. Enter accepts, - means not stated, q quits.\n")

    labelled = 0
    try:
        for ident, text in todo:
            out("=" * 70)
            out(f"{ident}\n")
            out(text[:1500] + ("\n[...truncated for display; the full text is saved]" if len(text) > 1500 else ""))
            out("")
            guess = {}
            if not args.no_prefill:
                try:
                    guess = api(args.api, "/jobs/extract", {"text": text})
                except Exception as e:  # noqa: BLE001
                    out(f"  (no pre-fill: {e})")
            expected = {f: ask(f, guess.get(f), inp, out) for f in FIELDS}
            with open(args.out, "a", encoding="utf-8") as f:
                f.write(json.dumps({"id": ident, "text": text, "expected": expected}, ensure_ascii=False) + "\n")
            labelled += 1
    except (KeyboardInterrupt, EOFError):
        out("\nStopped.")
    out(f"Labelled {labelled} this session; {len(seen) + labelled} total in {args.out}.")


if __name__ == "__main__":
    main()
