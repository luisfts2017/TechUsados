"use strict";

require("dotenv").config();

const { EMPRESA } = require("./empresa");
const { HORARIO, PAUSAR_FORA_DO_HORARIO } = require("./horario");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MINUTOS_COM_HUMANO = parseInt(process.env.MINUTOS_COM_HUMANO || "60", 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "8", 10);
const RATE_LIMIT_SECS = parseInt(process.env.RATE_LIMIT_SECS || "60", 10);
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || "3001", 10);
const LOG_FORMAT = process.env.LOG_FORMAT || "pretty";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const REDIS_URL = process.env.REDIS_URL || null;
const SQLITE_PATH = process.env.SQLITE_PATH || "data/lia.db";
const WHATSAPP_SESSION_PATH = process.env.WHATSAPP_SESSION_PATH || "sessao_whatsapp";
const GPT_MODEL = process.env.GPT_MODEL || "gpt-4o-mini";
const GPT_MAX_TOKENS = parseInt(process.env.GPT_MAX_TOKENS || "600", 10);
const GPT_TEMPERATURE = parseFloat(process.env.GPT_TEMPERATURE || "0.5");
const GPT_TIMEOUT_MS = parseInt(process.env.GPT_TIMEOUT_MS || "15000", 10);
const QUEUE_CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY || "5", 10);
const QUEUE_TIMEOUT_MS = parseInt(process.env.QUEUE_TIMEOUT_MS || "30000", 10);

module.exports = {
  EMPRESA,
  HORARIO,
  PAUSAR_FORA_DO_HORARIO,
  OPENAI_API_KEY,
  MINUTOS_COM_HUMANO,
  RATE_LIMIT_MAX,
  RATE_LIMIT_SECS,
  HEALTH_PORT,
  LOG_FORMAT,
  LOG_LEVEL,
  REDIS_URL,
  SQLITE_PATH,
  WHATSAPP_SESSION_PATH,
  GPT_MODEL,
  GPT_MAX_TOKENS,
  GPT_TEMPERATURE,
  GPT_TIMEOUT_MS,
  QUEUE_CONCURRENCY,
  QUEUE_TIMEOUT_MS,
};
