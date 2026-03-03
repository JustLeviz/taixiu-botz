import Database from "better-sqlite3";

const dbPath = "./bot.db";
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  guild_id TEXT PRIMARY KEY,
  game_channel_id TEXT NOT NULL,
  min_bet INTEGER NOT NULL DEFAULT 1,
  max_bet INTEGER NOT NULL DEFAULT 1000000,
  start_money INTEGER NOT NULL DEFAULT 2000,
  daily_money INTEGER NOT NULL DEFAULT 1500,
  daily_cooldown_ms INTEGER NOT NULL DEFAULT 86400000
);

CREATE TABLE IF NOT EXISTS users (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  last_daily INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  choice TEXT NOT NULL,
  bet INTEGER NOT NULL,
  d1 INTEGER NOT NULL,
  d2 INTEGER NOT NULL,
  d3 INTEGER NOT NULL,
  sum INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_guild_user_time ON history (guild_id, user_id, created_at DESC);
`);

export function ensureSettings(guildId, defaults) {
  const row = db.prepare("SELECT * FROM settings WHERE guild_id=?").get(guildId);
  if (row) return row;

  db.prepare(`
    INSERT INTO settings (guild_id, game_channel_id, min_bet, max_bet, start_money, daily_money, daily_cooldown_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    guildId,
    defaults.game_channel_id,
    defaults.min_bet,
    defaults.max_bet,
    defaults.start_money,
    defaults.daily_money,
    defaults.daily_cooldown_ms
  );
  return db.prepare("SELECT * FROM settings WHERE guild_id=?").get(guildId);
}

export function updateSettings(guildId, patch) {
  const current = db.prepare("SELECT * FROM settings WHERE guild_id=?").get(guildId);
  const next = { ...current, ...patch };
  db.prepare(`
    UPDATE settings
    SET game_channel_id=?,
        min_bet=?,
        max_bet=?,
        start_money=?,
        daily_money=?,
        daily_cooldown_ms=?
    WHERE guild_id=?
  `).run(
    next.game_channel_id,
    next.min_bet,
    next.max_bet,
    next.start_money,
    next.daily_money,
    next.daily_cooldown_ms,
    guildId
  );
  return db.prepare("SELECT * FROM settings WHERE guild_id=?").get(guildId);
}

export function getUser(guildId, userId) {
  const row = db
    .prepare("SELECT * FROM users WHERE guild_id=? AND user_id=?")
    .get(guildId, userId);
  if (row) return row;

  const now = Date.now();
  db.prepare(
    "INSERT INTO users (guild_id, user_id, balance, last_daily, created_at) VALUES (?, ?, 0, 0, ?)"
  ).run(guildId, userId, now);

  return db
    .prepare("SELECT * FROM users WHERE guild_id=? AND user_id=?")
    .get(guildId, userId);
}

export function setBalance(guildId, userId, balance) {
  db.prepare("UPDATE users SET balance=? WHERE guild_id=? AND user_id=?").run(
    balance,
    guildId,
    userId
  );
}

export function setDaily(guildId, userId, lastDaily) {
  db.prepare("UPDATE users SET last_daily=? WHERE guild_id=? AND user_id=?").run(
    lastDaily,
    guildId,
    userId
  );
}

export function addHistory(row) {
  db.prepare(`
    INSERT INTO history (
      guild_id, user_id, choice, bet, d1, d2, d3, sum, outcome, delta, balance_after, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.guild_id,
    row.user_id,
    row.choice,
    row.bet,
    row.d1,
    row.d2,
    row.d3,
    row.sum,
    row.outcome,
    row.delta,
    row.balance_after,
    row.created_at
  );
}

export function topUsers(guildId, limit = 10) {
  return db
    .prepare(
      "SELECT user_id, balance FROM users WHERE guild_id=? ORDER BY balance DESC LIMIT ?"
    )
    .all(guildId, limit);
}

export function getHistory(guildId, userId, limit = 10) {
  return db
    .prepare(
      "SELECT * FROM history WHERE guild_id=? AND user_id=? ORDER BY created_at DESC LIMIT ?"
    )
    .all(guildId, userId, limit);
}

export function getStats(guildId, userId) {
  const win = db.prepare(`
    SELECT COUNT(*) AS c
    FROM history
    WHERE guild_id=? AND user_id=? AND delta > 0
  `).get(guildId, userId).c;

  const lose = db.prepare(`
    SELECT COUNT(*) AS c
    FROM history
    WHERE guild_id=? AND user_id=? AND delta < 0
  `).get(guildId, userId).c;

  const total = db.prepare(`
    SELECT COUNT(*) AS c
    FROM history
    WHERE guild_id=? AND user_id=?
  `).get(guildId, userId).c;

  const net = db.prepare(`
    SELECT COALESCE(SUM(delta), 0) AS s
    FROM history
    WHERE guild_id=? AND user_id=?
  `).get(guildId, userId).s;

  return { win, lose, total, net };
}

export function resetUser(guildId, userId) {
  db.prepare("DELETE FROM users WHERE guild_id=? AND user_id=?").run(guildId, userId);
  db.prepare("DELETE FROM history WHERE guild_id=? AND user_id=?").run(guildId, userId);
}

export function resetGuild(guildId) {
  db.prepare("DELETE FROM users WHERE guild_id=?").run(guildId);
  db.prepare("DELETE FROM history WHERE guild_id=?").run(guildId);
  // giữ settings để khỏi phải set lại kênh
}
