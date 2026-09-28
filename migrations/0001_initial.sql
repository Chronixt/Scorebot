PRAGMA foreign_keys = ON;

CREATE TABLE players (
    discord_user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_number INTEGER NOT NULL UNIQUE CHECK (case_number > 0),
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    discord_message_id TEXT NOT NULL UNIQUE,
    easypoll_poll_id TEXT NOT NULL UNIQUE,
    question TEXT NOT NULL,
    correct_answer_id TEXT NOT NULL,
    correct_answer_text TEXT NOT NULL,
    scored_by_user_id TEXT NOT NULL,
    scored_at TEXT NOT NULL DEFAULT (datetime('now')),
    corrected_by_user_id TEXT,
    corrected_at TEXT
);

CREATE TABLE answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    discord_user_id TEXT NOT NULL REFERENCES players(discord_user_id),
    easypoll_vote_id TEXT NOT NULL,
    selected_answer_id TEXT NOT NULL,
    selected_answer_text TEXT NOT NULL,
    points INTEGER NOT NULL CHECK (points IN (0, 1)),
    vote_weight INTEGER NOT NULL DEFAULT 1,
    voted_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (case_id, discord_user_id),
    UNIQUE (case_id, easypoll_vote_id)
);

CREATE TABLE legacy_score_imports (
    discord_user_id TEXT PRIMARY KEY REFERENCES players(discord_user_id),
    points INTEGER NOT NULL CHECK (points >= 0),
    imported_by_user_id TEXT NOT NULL,
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX answers_user_idx ON answers(discord_user_id);
CREATE INDEX answers_case_points_idx ON answers(case_id, points);
