#!/usr/bin/env python3
"""Check and calibrate the resume-to-job `fit` score against your own judgement.

Step 1: label how good a match each saved job really is for you.

    python eval/calibrate_fit.py label --api http://localhost:9500

Step 2: see how well similarity separates good from poor matches (AUC) and get suggested
SIM_LOW / SIM_HIGH values for EmbeddingService.

    python eval/calibrate_fit.py report --api http://localhost:9500

AUC is the chance that a random "good" job scores higher than a random "poor" one:
0.5 is a coin flip, 0.8+ is useful. Labels live in eval/fit_labels.jsonl.
"""
import argparse
import json
import statistics
import urllib.request

LABELS = {"g": "good", "o": "ok", "p": "poor"}


def get_ranked(base):
    with urllib.request.urlopen(base + "/jobs/ranked", timeout=60) as r:
        return json.loads(r.read())


def load_labels(path):
    labels = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    d = json.loads(line)
                    labels[d["job_id"]] = d["label"]
    except FileNotFoundError:
        pass
    return labels


def auc(pos, neg):
    """Probability a random positive outranks a random negative (ties count half)."""
    if not pos or not neg:
        return None
    wins = sum(1.0 if p > n else 0.5 if p == n else 0.0 for p in pos for n in neg)
    return wins / (len(pos) * len(neg))


def suggest_band(good, poor):
    """Map the median poor match to fit 0 and the median good match to fit 100."""
    if not good or not poor:
        return None
    low, high = statistics.median(poor), statistics.median(good)
    if high <= low:
        return None
    return round(low, 2), round(high, 2)


def report(ranked, labels, out=print):
    sims = {r["job"]["id"]: r["similarity"] for r in ranked}
    by = {"good": [], "ok": [], "poor": []}
    for job_id, label in labels.items():
        if job_id in sims and label in by:
            by[label].append(sims[job_id])
    for name, vals in by.items():
        mean = f"{statistics.mean(vals):.3f}" if vals else "n/a"
        out(f"{name:>5}: n={len(vals):<3} mean similarity {mean}")
    a = auc(by["good"], by["poor"])
    out("AUC good vs poor: " + ("n/a (need both labels)" if a is None else f"{a:.2f}"))
    band = suggest_band(by["good"], by["poor"])
    if band:
        out(f"Suggested SIM_LOW={band[0]}, SIM_HIGH={band[1]} (currently 0.40 and 0.80)")
    return a, band


def label_mode(args):
    ranked = get_ranked(args.api)
    labels = load_labels(args.labels)
    print("g = good match, o = ok, p = poor, s = skip, q = quit\n")
    for r in ranked:
        job = r["job"]
        if job["id"] in labels:
            continue
        ans = input(f"#{job['id']} {job['company']} - {job['role']} (fit {r['fit']}): ").strip().lower()
        if ans == "q":
            break
        if ans in LABELS:
            with open(args.labels, "a", encoding="utf-8") as f:
                f.write(json.dumps({"job_id": job["id"], "label": LABELS[ans]}) + "\n")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=["label", "report"])
    ap.add_argument("--api", default="http://localhost:9500")
    ap.add_argument("--labels", default="eval/fit_labels.jsonl")
    args = ap.parse_args(argv)
    if args.mode == "label":
        label_mode(args)
    else:
        report(get_ranked(args.api), load_labels(args.labels))


if __name__ == "__main__":
    main()
