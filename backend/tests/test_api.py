import json
import os
import tempfile
from datetime import date, timedelta

import pytest

_tmp = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _tmp

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services import matcher, ollama  # noqa: E402


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def _new(client, **kw):
    body = {"company": "Acme", "role": "ML Engineer", **kw}
    r = client.post("/jobs", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_crud_and_status_flow(client):
    job = _new(client, location="Remote", salary_min=150000, salary_max=180000, job_description="Build models")
    # new jobs default to applied, dated today
    assert job["status"] == "applied"
    assert job["date_applied"] == date.today().isoformat()
    assert [e["to_status"] for e in job["events"]] == ["applied"]

    # status changes are logged
    r = client.patch(f"/jobs/{job['id']}", json={"status": "interview"})
    j = r.json()
    assert j["status"] == "interview"
    assert [e["to_status"] for e in j["events"]] == ["applied", "interview"]

    # an explicit date isn't overwritten
    other = _new(client, company="Dated", date_applied="2026-01-05")
    assert other["date_applied"] == "2026-01-05"
    assert client.post("/jobs", json={"company": "a", "role": "b", "status": "saved"}).status_code == 422

    # partial update leaves other fields alone; null clears
    r = client.patch(f"/jobs/{job['id']}", json={"notes": "Referral from Sam", "location": None})
    j = r.json()
    assert j["notes"] == "Referral from Sam" and j["location"] is None and j["salary_min"] == 150000

    assert client.get("/jobs", params={"q": "acme"}).json()[0]["id"] == job["id"]
    assert client.get("/jobs", params={"status": "offer"}).json() == []

    assert client.delete(f"/jobs/{job['id']}").status_code == 200
    assert client.get(f"/jobs/{job['id']}").status_code == 404


def test_validation(client):
    assert client.post("/jobs", json={"company": "", "role": "x"}).status_code == 422
    assert client.post("/jobs", json={"company": "a", "role": "b", "status": "found"}).status_code == 422
    assert client.post("/jobs", json={"company": "a", "role": "b", "salary_min": 10, "salary_max": 5}).status_code == 422
    j = _new(client)
    assert client.patch(f"/jobs/{j['id']}", json={"salary_min": 9, "salary_max": 1}).status_code == 400


def test_duplicates(client):
    _new(client, company="Globex", role="Data Scientist")
    d = client.get("/jobs/duplicates", params={"company": "globex", "role": "data"}).json()
    assert len(d["duplicates"]) >= 1
    assert client.get("/jobs/duplicates", params={"company": "nobody"}).json()["duplicates"] == []


def test_stats_and_follow_ups(client):
    old = (date.today() - timedelta(days=12)).isoformat()
    a = _new(client, company="Initech", status="applied", date_applied=old)
    b = _new(client, company="Hooli", status="applied")
    client.patch(f"/jobs/{b['id']}", json={"status": "interview"})
    s = client.get("/stats").json()
    assert s["by_status"]["interview"] >= 1
    assert any(f["id"] == a["id"] and f["days_waiting"] == 12 for f in s["follow_ups"])
    assert s["response_rate"] is not None
    assert len(s["weekly_activity"]) == 8
    assert s["applied_this_week"] >= 1


def test_resume_roundtrip(client):
    r = client.post("/resume", files={"file": ("cv.txt", b"Python, PyTorch, 5 years ML")})
    assert r.json()["exists"] and r.json()["characters"] > 0
    r = client.put("/resume", json={"text": "Edited resume"})
    assert r.json()["text"] == "Edited resume"
    assert client.post("/resume", files={"file": ("cv.exe", b"x")}).status_code == 400


def test_match_requires_description(client, monkeypatch):
    j = _new(client)
    assert client.get(f"/jobs/{j['id']}/match/stream").status_code == 400


def test_match_stream_saves_result(client, monkeypatch):
    client.put("/resume", json={"text": "Python ML engineer"})
    j = _new(client, job_description="Need Python and ML")

    result = {"score": 82, "summary": "Strong fit", "strengths": ["Python"], "gaps": ["K8s"], "suggestions": ["Lead with ML"]}

    def fake_stream(payload, timeout=600):
        yield {"message": {"thinking": "hmm"}}
        yield {"message": {"content": json.dumps(result)}}
        yield {"done": True, "message": {}}

    monkeypatch.setattr(ollama, "ensure_ready", lambda m: None)
    monkeypatch.setattr(ollama, "chat_stream", fake_stream)

    with client.stream("GET", f"/jobs/{j['id']}/match/stream") as r:
        events = [json.loads(line[6:]) for line in r.iter_lines() if line.startswith("data: ")]
    assert events[0]["type"] == "thinking"
    assert events[-1]["type"] == "done"

    saved = client.get(f"/jobs/{j['id']}").json()
    assert saved["match_score"] == 82
    assert saved["match_details"]["gaps"] == ["K8s"]

    # editing the JD invalidates the old match
    saved = client.patch(f"/jobs/{j['id']}", json={"job_description": "Different job"}).json()
    assert saved["match_score"] is None


def test_extract(client, monkeypatch):
    monkeypatch.setattr(ollama, "ensure_ready", lambda m: None)
    monkeypatch.setattr(
        ollama, "chat",
        lambda payload, timeout=180: json.dumps(
            {"company": "Acme", "role": "SWE", "location": None, "salary_min": "150000", "salary_max": None}
        ),
    )
    r = client.post("/jobs/extract", json={"text": "Acme is hiring a SWE, pay 150k, apply now please"})
    assert r.json() == {"company": "Acme", "role": "SWE", "location": None, "salary_min": 150000, "salary_max": None}


def test_extract_when_ollama_down(client):
    # Point at nothing; should be a clean 503, not a crash
    r = client.post("/jobs/extract", json={"text": "x" * 40})
    assert r.status_code == 503


def test_exports(client):
    _new(client, company="Umbrella")
    assert "Umbrella" in client.get("/export/csv").text
    r = client.get("/export/xlsx")
    assert r.status_code == 200 and r.content[:2] == b"PK"


def test_health(client):
    h = client.get("/health").json()
    assert h["status"] == "ok" and "ai" in h


def test_old_saved_rows_become_applied(client):
    from sqlalchemy import text

    from app.db import engine, init_db

    j = _new(client, company="Legacy")
    with engine.begin() as conn:
        conn.execute(text("UPDATE jobs SET status = 'saved' WHERE id = :id"), {"id": j["id"]})
    init_db()
    assert client.get(f"/jobs/{j['id']}").json()["status"] == "applied"


def test_settings_change_goal_and_follow_up(client):
    s = client.get("/settings").json()
    assert s == {"weekly_goal": 10, "follow_up_after_days": 7}

    r = client.patch("/settings", json={"weekly_goal": 25})
    assert r.json() == {"weekly_goal": 25, "follow_up_after_days": 7}
    assert client.get("/stats").json()["weekly_goal"] == 25

    # follow-up threshold drives the queue
    j = _new(client, company="Slowco", date_applied=(date.today() - timedelta(days=4)).isoformat())
    assert all(f["id"] != j["id"] for f in client.get("/stats").json()["follow_ups"])
    client.patch("/settings", json={"follow_up_after_days": 3})
    stats = client.get("/stats").json()
    assert stats["follow_up_after_days"] == 3
    assert any(f["id"] == j["id"] for f in stats["follow_ups"])

    assert client.patch("/settings", json={"weekly_goal": 0}).status_code == 422
    assert client.patch("/settings", json={"follow_up_after_days": 500}).status_code == 422
    client.patch("/settings", json={"weekly_goal": 10, "follow_up_after_days": 7})
