"use strict";

const express = require("express");
const { HEALTH_PORT } = require("../config");
const { getStatus } = require("../services/database");
const { getMetrics } = require("./metrics");
const { getQueueStats } = require("../queue/messageQueue");
const { logger } = require("../utils/logger");

let server = null;
let whatsappStatus = false;

function setWhatsappStatus(connected) {
  whatsappStatus = connected;
}

function startHealthCheck() {
  const app = express();

  app.get("/health", async (req, res) => {
    const dbStatus = getStatus();
    const queueStats = await getQueueStats();
    const status = {
      status: whatsappStatus ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      whatsapp: whatsappStatus ? "connected" : "disconnected",
      sqlite: dbStatus.sqliteOk ? "ok" : "error",
      redis: dbStatus.redisAvailable ? "ok" : "unavailable",
      queue: queueStats,
    };
    res.status(whatsappStatus ? 200 : 503).json(status);
  });

  app.get("/metrics", async (req, res) => {
    const m = getMetrics();
    const dbStatus = getStatus();
    const queueStats = await getQueueStats();
    res.json({ ...m, clientesAtivos: dbStatus.clientesAtivos, queue: queueStats });
  });

  server = app.listen(HEALTH_PORT, () => {
    logger.info(`Health check disponível`, { port: HEALTH_PORT });
  });
}

function stopHealthCheck() {
  if (server) server.close();
}

module.exports = { startHealthCheck, stopHealthCheck, setWhatsappStatus };
