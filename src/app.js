"use strict";

require("dotenv").config();

const { OPENAI_API_KEY } = require("./config");
const { initDatabase } = require("./services/database");
const { iniciarBot } = require("./services/whatsapp");
const { startHealthCheck } = require("./monitoring/healthCheck");
const { logger } = require("./utils/logger");

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY não encontrada! Crie o arquivo .env com a chave.");
  process.exit(1);
}

process.on("uncaughtException", (err) => {
  try { logger.error("UNCAUGHT EXCEPTION", { error: err.message, stack: err.stack }); } catch (_) {}
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  try { logger.error("UNHANDLED REJECTION", { reason: String(reason) }); } catch (_) {}
});

function encerrarGracioso(sinal) {
  logger.info(`Sinal ${sinal} recebido — encerrando LIA...`);
  process.exit(0);
}

process.on("SIGINT", () => encerrarGracioso("SIGINT"));
process.on("SIGTERM", () => encerrarGracioso("SIGTERM"));

async function main() {
  logger.info("Iniciando LIA — Infohouse Informática...");

  await initDatabase();
  startHealthCheck();
  await iniciarBot();
}

main().catch((err) => {
  logger.error("Falha crítica ao iniciar o bot", { error: err.message });
  process.exit(1);
});
