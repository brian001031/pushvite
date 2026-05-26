require('dotenv').config({ override: true });
const Redis = require('ioredis');

const sanitizeEnv = (value) => {
  if (!value) return undefined;
  return String(value).trim().replace(/^['"]|['"]$/g, '').replace(/,$/, '');
};

const rawUrl = sanitizeEnv(process.env.REDIS_URL);
const token = sanitizeEnv(process.env.REDIS_TOKEN);

let redisOptions = undefined;

if (rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      redisOptions = {
        host: parsed.hostname,
        port: Number(parsed.port || 6379),
        password: token,
        tls: {},
      };
    } else {
      redisOptions = {
        url: rawUrl,
        password: token,
      };
    }
  } catch {
    redisOptions = {
      url: rawUrl,
      password: token,
    };
  }
}

const redis = new Redis(
  redisOptions ?
  redisOptions
  : {
    host: '127.0.0.1',
    port: 6379,
  }
);

module.exports = redis;
