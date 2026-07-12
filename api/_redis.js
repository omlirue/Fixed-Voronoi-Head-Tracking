// Shared Upstash Redis client.
// File starts with `_` so Vercel does NOT expose it as a route.
//
// This project uses the "KV" custom prefix configured in the Vercel
// integration, so the env vars are KV_REST_API_URL / KV_REST_API_TOKEN.
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const PARTICIPANTS_KEY = 'participants';

async function readParticipants() {
  const data = await redis.get(PARTICIPANTS_KEY);
  if (!data) return [];
  // Upstash returns either a parsed object/array or a JSON string depending on
  // how it was stored, so handle both cases.
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return []; }
  }
  return Array.isArray(data) ? data : [];
}

async function writeParticipants(participants) {
  await redis.set(PARTICIPANTS_KEY, JSON.stringify(participants));
}

module.exports = { redis, readParticipants, writeParticipants };
