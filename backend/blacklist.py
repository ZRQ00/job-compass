"""
Company blacklist — companies whose listings should never be added to the
tracker (staffing agencies, recruiters-as-employer-of-record, etc.)
Matching is case-insensitive substring matching, so a generic term like
"staffing" blocks any company with that word in its name, not just exact matches.
"""
import json
from pathlib import Path

BLACKLIST_PATH = Path(__file__).parent / "blacklist.json"

DEFAULT_BLACKLIST = [
    "DataAnnotation",
    "Jack and Jill",
]


def load_blacklist() -> list[str]:
    if not BLACKLIST_PATH.exists():
        BLACKLIST_PATH.write_text(json.dumps(DEFAULT_BLACKLIST, indent=2))
        return DEFAULT_BLACKLIST.copy()
    return json.loads(BLACKLIST_PATH.read_text())


def save_blacklist(companies: list[str]):
    BLACKLIST_PATH.write_text(json.dumps(companies, indent=2))


def is_blacklisted(company: str) -> bool:
    if not company:
        return False
    company_lower = company.lower()
    return any(term.lower() in company_lower for term in load_blacklist())