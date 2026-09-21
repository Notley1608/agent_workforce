"""Local-first persistence. One SQLite file, stdlib only."""

import sqlite3
import time
import uuid
from pathlib import Path

DB_PATH = Path.home() / ".agent_workforce" / "crew.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    avatar TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    desk_x REAL NOT NULL,
    desk_y REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    input TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    output TEXT,
    error TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    tools_used TEXT,
    cost REAL,
    workflow_run_id TEXT,
    step_index INTEGER,
    created_at REAL NOT NULL,
    started_at REAL,
    completed_at REAL
);

CREATE TABLE IF NOT EXISTS infrastructure (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    agent_ids TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    status TEXT NOT NULL DEFAULT 'running',
    input TEXT NOT NULL,
    created_at REAL NOT NULL,
    completed_at REAL
);

CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    schedule_type TEXT NOT NULL,
    interval_minutes INTEGER,
    daily_at TEXT,
    input TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    next_run_at REAL,
    last_run_at REAL,
    last_run_status TEXT,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS job_events (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id),
    label TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    objective TEXT NOT NULL,
    summary TEXT NOT NULL,
    steps TEXT NOT NULL,
    warnings TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'proposed',
    workflow_id TEXT,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'discovered',
    forecast_value REAL,
    workflow_id TEXT,
    notes TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS orchestrator_messages (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    amount REAL NOT NULL,
    opportunity_id TEXT,
    job_id TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at REAL NOT NULL
);
"""

SEED_INFRASTRUCTURE = [
    ("web", "Network Station (web access)"),
    ("files", "File Cabinet (write output to disk)"),
    ("terminal", "Workbench (run shell commands)"),
]

# columns added after the initial release; ALTER TABLE ADD COLUMN if missing
# rather than a migration framework, since this is a single local db file.
JOB_COLUMN_MIGRATIONS = {
    "tools_used": "ALTER TABLE jobs ADD COLUMN tools_used TEXT",
    "cost": "ALTER TABLE jobs ADD COLUMN cost REAL",
    "workflow_run_id": "ALTER TABLE jobs ADD COLUMN workflow_run_id TEXT",
    "step_index": "ALTER TABLE jobs ADD COLUMN step_index INTEGER",
    "risky_capabilities": "ALTER TABLE jobs ADD COLUMN risky_capabilities TEXT",
}

AGENT_COLUMN_MIGRATIONS = {
    "role_type": "ALTER TABLE agents ADD COLUMN role_type TEXT NOT NULL DEFAULT 'worker'",
    "capabilities_override": "ALTER TABLE agents ADD COLUMN capabilities_override TEXT",
}

PLAN_COLUMN_MIGRATIONS = {
    "opportunity_id": "ALTER TABLE plans ADD COLUMN opportunity_id TEXT",
}

OPPORTUNITY_COLUMN_MIGRATIONS = {
    "notes": "ALTER TABLE opportunities ADD COLUMN notes TEXT",
}


def get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.row_factory = sqlite3.Row
    # WAL lets readers and writers overlap; busy_timeout retries instead of
    # raising "database is locked" when multiple agents finish at once.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.executescript(SCHEMA)
    existing_columns = {row["name"] for row in conn.execute("PRAGMA table_info(jobs)")}
    for column, ddl in JOB_COLUMN_MIGRATIONS.items():
        if column not in existing_columns:
            conn.execute(ddl)
    existing_agent_columns = {row["name"] for row in conn.execute("PRAGMA table_info(agents)")}
    for column, ddl in AGENT_COLUMN_MIGRATIONS.items():
        if column not in existing_agent_columns:
            conn.execute(ddl)
            if column == "role_type":
                # backfill: agents already named/roled like a researcher keep
                # acting like one instead of silently becoming "worker".
                conn.execute("UPDATE agents SET role_type = 'researcher' WHERE role LIKE '%research%'")
    existing_plan_columns = {row["name"] for row in conn.execute("PRAGMA table_info(plans)")}
    for column, ddl in PLAN_COLUMN_MIGRATIONS.items():
        if column not in existing_plan_columns:
            conn.execute(ddl)
    existing_opportunity_columns = {row["name"] for row in conn.execute("PRAGMA table_info(opportunities)")}
    for column, ddl in OPPORTUNITY_COLUMN_MIGRATIONS.items():
        if column not in existing_opportunity_columns:
            conn.execute(ddl)
    conn.executemany(
        "INSERT OR IGNORE INTO infrastructure (key, label, enabled) VALUES (?, ?, 0)",
        SEED_INFRASTRUCTURE,
    )
    conn.commit()
    return conn


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def now() -> float:
    return time.time()
