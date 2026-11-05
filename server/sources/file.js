// File source (DATA_SOURCE=file): reads a JSON file of daily records so the panel can be fed from
// anything (a script, a CSV export, another metrics system). Format (docs/contract.md):
//   { "records": [ { "day": "2026-11-03", "email": "ana@example.com", "team": "Platform",
//                    "tokens": { "input": 1200000, "output": 300000, "cacheCreation": 0, "cacheRead": 5000000 },
//                    "sessions": 3, "model": "opus", "hours": [24 token counts] } ] }
// `hours` is optional: it drives the live state ("building now", lit windows, the daily stage).
// Without it the panel is "end of day only": everyone idle, no cranes, pace 0. The file is re-read
// when it changes (checked at most once a minute).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { localMidnight } from '../config.js';

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const typeKey = (t) => String(t).toLowerCase().replace(/[^a-z]/g, '');

export function createFileSource(config) {
  const file = resolve(config.root, config.dataFile);
  const season = config.season;
  let records = [], mtime = -1, checkedAt = 0;

  function load() {
    const now = Date.now();
    if (now - checkedAt < MIN && mtime !== -1) return;
    checkedAt = now;
    const stamp = existsSync(file) ? statSync(file).mtimeMs : 0;
    if (stamp === mtime) return;
    mtime = stamp;
    if (!stamp) {
      records = [];
      console.warn(`[file] ${file} not found: the panel stays empty until it exists`);
      return;
    }
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      const off = season.utcOffsetHours;
      records = (Array.isArray(raw) ? raw : raw.records ?? [])
        .map((r) => {
          const dayTs = localMidnight(r.day, off);
          if (dayTs === null || !r.email) return null;
          const byType = {};
          for (const [t, v] of Object.entries(r.tokens ?? {})) if (Number.isFinite(Number(v))) byType[typeKey(t)] = Number(v);
          const hours = Array.isArray(r.hours) && r.hours.length === 24 ? r.hours.map((v) => Math.max(0, Number(v) || 0)) : null;
          return {
            dayTs,
            email: String(r.email).trim(),
            team: String(r.team ?? 'default').trim() || 'default',
            byType,
            score: scoreOf(byType),
            sessions: Number.isFinite(Number(r.sessions)) ? Number(r.sessions) : null,
            model: r.model ? String(r.model) : null,
            hours,
          };
        })
        .filter(Boolean);
      console.log(`[file] ${records.length} records read from ${config.dataFile}`);
    } catch (err) {
      console.warn(`[file] could not read ${file}: ${err.message}`);
    }
  }

  const counts = (byType) => (!config.scoreTypes.length ? Object.keys(byType) : Object.keys(byType).filter((t) => config.scoreTypes.includes(t)));
  function scoreOf(byType) {
    return counts(byType).reduce((a, t) => a + byType[t], 0);
  }

  const addTo = (map, key, v) => map.set(key, (map.get(key) ?? 0) + v);
  const sub = (map, key) => map.get(key) ?? map.set(key, new Map()).get(key);
  const inRange = (r, fromMs, toMs) => r.dayTs < toMs && r.dayTs + DAY > fromMs;

  // Minute buckets of a day record, from its `hours`, limited to [fromMs, toMs).
  function* minuteBuckets(r, fromMs, toMs) {
    if (!r.hours) return;
    for (let h = 0; h < 24; h++) {
      const tokens = r.hours[h];
      if (!(tokens > 0)) continue;
      const hourStart = r.dayTs + h * HOUR;
      for (let m = 0; m < 60; m++) {
        const ts = hourStart + m * MIN;
        if (ts >= fromMs && ts < toMs) yield [ts, tokens / 60];
      }
    }
  }
  // Whether the record has tokens in the hour that contains `at`.
  const activeAt = (r, at) => r.hours ? r.hours[Math.floor((at - r.dayTs) / HOUR)] > 0 : false;

  return {
    mode: 'file',

    async seasonUsage(season, now) {
      load();
      const out = new Map();
      for (const r of records) {
        if (r.dayTs < season.start || r.dayTs >= season.end || r.dayTs > now) continue;
        const u = out.get(r.email) ?? out.set(r.email, { email: r.email, byType: {}, daily: [], sessions: null }).get(r.email);
        for (const [t, v] of Object.entries(r.byType)) u.byType[t] = (u.byType[t] ?? 0) + v;
        let day = u.daily.find((d) => d.day === r.dayTs);
        if (!day) u.daily.push((day = { day: r.dayTs, byType: {} }));
        for (const [t, v] of Object.entries(r.byType)) day.byType[t] = (day.byType[t] ?? 0) + v;
        if (r.sessions !== null) u.sessions = (u.sessions ?? 0) + r.sessions;
      }
      return [...out.values()];
    },

    async seasonTotals(season) {
      load();
      const out = new Map();
      for (const r of records) {
        if (r.dayTs < season.start || r.dayTs >= season.end) continue;
        const t = out.get(r.email) ?? out.set(r.email, {}).get(r.email);
        for (const [k, v] of Object.entries(r.byType)) t[k] = (t[k] ?? 0) + v;
      }
      return out;
    },

    async dailyScores(fromMs, toMs) {
      load();
      const out = new Map();
      for (const r of records) if (r.dayTs >= fromMs && r.dayTs < toMs && r.score > 0) addTo(sub(out, r.email), r.dayTs, r.score);
      return out;
    },

    async recentUsage(fromMs, now) {
      load();
      const byUser = new Map();
      for (const r of records) {
        if (!inRange(r, fromMs, now) || !r.hours) continue;
        const ratio = r.score / Math.max(1, Object.values(r.byType).reduce((a, v) => a + v, 0));
        for (const [ts, v] of minuteBuckets(r, fromMs, now)) addTo(sub(byUser, r.email), ts, v * ratio);
      }
      return { bucketMs: MIN, byUser };
    },

    async orgDaily(fromMs, toMs) {
      load();
      const out = new Map();
      for (const r of records) if (r.dayTs >= fromMs && r.dayTs < toMs && r.score > 0) addTo(sub(sub(out, r.team), r.email), r.dayTs, r.score);
      return out;
    },

    async orgRecent(fromMs, now) {
      load();
      const out = new Map();
      for (const r of records) {
        if (!inRange(r, fromMs, now)) continue;
        if (activeAt(r, now - 1) || activeAt(r, fromMs)) (out.get(r.team) ?? out.set(r.team, new Set()).get(r.team)).add(r.email);
      }
      return out;
    },

    async orgHourly(fromMs, toMs) {
      load();
      const out = new Map();
      for (const r of records) {
        if (!inRange(r, fromMs, toMs) || !r.hours) continue;
        for (let h = 0; h < 24; h++) {
          const ts = r.dayTs + h * HOUR;
          if (r.hours[h] > 0 && ts >= fromMs && ts < toMs) addTo(sub(sub(out, r.team), r.email), ts, r.hours[h]);
        }
      }
      return out;
    },

    async orgSessions(fromMs, now) {
      load();
      const out = new Map();
      for (const r of records) {
        if (!inRange(r, fromMs, now) || !r.sessions || !activeAt(r, now - 1)) continue;
        addTo(out, r.team, Math.max(1, Math.round(r.sessions / 8)));
      }
      return out;
    },

    async orgModels(fromMs, toMs) {
      load();
      const out = new Map();
      for (const r of records) {
        if (!r.model || r.dayTs < fromMs || r.dayTs >= toMs) continue;
        addTo(sub(sub(out, r.team), r.email), r.model, Object.values(r.byType).reduce((a, v) => a + v, 0));
      }
      return out;
    },
  };
}
