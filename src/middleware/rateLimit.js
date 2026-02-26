"use strict";

const { RATE_LIMIT_MAX, RATE_LIMIT_SECS } = require("../config");
const { getRateLimit, setRateLimit } = require("../services/database");
const { logger } = require("../utils/logger");

async function verificarRateLimit(numero) {
  const agora = Date.now();
  const entry = await getRateLimit(numero);

  if (!entry || (agora - entry.desde) > RATE_LIMIT_SECS * 1000) {
    await setRateLimit(numero, { count: 1, desde: agora }, RATE_LIMIT_SECS);
    return false;
  }

  entry.count++;
  const remaining = RATE_LIMIT_SECS - Math.floor((agora - entry.desde) / 1000);
  await setRateLimit(numero, entry, remaining > 0 ? remaining : 1);

  if (entry.count > RATE_LIMIT_MAX) {
    logger.warn("Rate limit atingido", { numero, count: entry.count });
    return true;
  }
  return false;
}

module.exports = { verificarRateLimit };
