"""One-off copy of jobs and job_events from the old SQLite file into Postgres.

    pip install psycopg[binary]
    python scripts/migrate_sqlite_to_postgres.py \
        ../backend/data/jobcompass.db "postgresql://jobcompass:jobcompass@localhost:5432/jobcompass" \
        [../backend/data/resume.txt]

Run it after the Spring app has started once (Flyway creates the tables). IDs are preserved
so links like /tracker/12 keep working. Refuses to run if jobs already has rows.
"""
import sqlite3
import sys

import psycopg

JOB_COLS = [
    "id", "company", "role", "location", "date_applied", "salary_min", "salary_max", "notes",
    "status", "job_description", "job_url", "match_score", "match_summary", "match_details",
    "matched_at", "created_at", "updated_at", "status_changed_at",
]
EVENT_COLS = ["id", "job_id", "from_status", "to_status", "created_at"]


def copy(src, dst, table, cols):
    rows = src.execute(f"SELECT {', '.join(cols)} FROM {table}").fetchall()
    placeholders = ", ".join(["%s"] * len(cols))
    with dst.cursor() as cur:
        cur.executemany(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders})", rows)
        cur.execute(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE(MAX(id), 1)) FROM {table}")
    return len(rows)


def main(sqlite_path, pg_url, resume_path=None):
    src = sqlite3.connect(sqlite_path)
    with psycopg.connect(pg_url) as dst:
        with dst.cursor() as cur:
            cur.execute("SELECT count(*) FROM jobs")
            if cur.fetchone()[0]:
                sys.exit("Postgres jobs table is not empty; aborting.")
        n_jobs = copy(src, dst, "jobs", JOB_COLS)
        n_events = copy(src, dst, "job_events", EVENT_COLS)
        for table, cols in (("settings", ["key", "value"]),):
            rows = src.execute(f"SELECT {', '.join(cols)} FROM {table}").fetchall()
            with dst.cursor() as cur:
                cur.executemany(f"INSERT INTO {table} VALUES (%s, %s)", rows)
        if resume_path:
            with open(resume_path, encoding="utf-8") as f, dst.cursor() as cur:
                cur.execute("UPDATE resume SET text = %s, updated_at = now() WHERE id = 1", (f.read(),))
        with dst.cursor() as cur:
            cur.execute("DELETE FROM boards")  # replace the seeded defaults with your own list
        boards = src.execute(
            "SELECT id, name, home, search, position, builtin, hidden FROM boards").fetchall()
        with dst.cursor() as cur:
            cur.executemany(
                "INSERT INTO boards (id, name, home, search, position, builtin, hidden) "
                "VALUES (%s, %s, %s, %s, %s, %s::int::boolean, %s::int::boolean)", boards)
            cur.execute("SELECT setval(pg_get_serial_sequence('boards', 'id'), COALESCE(MAX(id), 1)) FROM boards")
    print(f"Copied {n_jobs} jobs, {n_events} events, {len(boards)} boards.")


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    main(*sys.argv[1:])
