"use strict";

const fs = require("fs");
const path = require("path");
const { LOG_FORMAT, LOG_LEVEL } = require("../config");

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[LOG_LEVEL] !== undefined ? LEVELS[LOG_LEVEL] : LEVELS.info;

const DIR_LOGS = path.join(process.cwd(), "logs");
if (!fs.existsSync(DIR_LOGS)) fs.mkdirSync(DIR_LOGS, { recursive: true });

function getLogFilePath() {
  const agora = new Date();
  const dataArq = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    .split("/").reverse().join("-");
  return path.join(DIR_LOGS, `${dataArq}.log`);
}

function formatEntry(level, message, context) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (context && Object.keys(context).length > 0) entry.context = context;
  return entry;
}

function writeToFile(jsonStr) {
  fs.appendFile(getLogFilePath(), jsonStr + "\n", (e) => {
    if (e) console.error(`[logger] Erro ao gravar log: ${e.message}`);
  });
}

function log(level, message, context = {}) {
  if (LEVELS[level] === undefined || LEVELS[level] > currentLevel) return;

  const entry = formatEntry(level, message, context);

  if (LOG_FORMAT === "json") {
    const jsonStr = JSON.stringify(entry);
    console.log(jsonStr);
    writeToFile(jsonStr);
  } else {
    const ts = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const ctx = context && Object.keys(context).length > 0
      ? ` | ${JSON.stringify(context)}`
      : "";
    const line = `[${ts}] [${level.toUpperCase()}] ${message}${ctx}`;
    console.log(line);
    writeToFile(JSON.stringify(entry));
  }
}

const logger = {
  info: (msg, ctx) => log("info", msg, ctx),
  warn: (msg, ctx) => log("warn", msg, ctx),
  error: (msg, ctx) => log("error", msg, ctx),
  debug: (msg, ctx) => log("debug", msg, ctx),
};

module.exports = { logger };
