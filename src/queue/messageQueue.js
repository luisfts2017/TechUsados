"use strict";

const { QUEUE_CONCURRENCY, QUEUE_TIMEOUT_MS } = require("../config");
const { logger } = require("../utils/logger");

let PQueue;
let queue;

async function getQueue() {
  if (queue) return queue;
  if (!PQueue) {
    const mod = await import("p-queue");
    PQueue = mod.default;
  }
  queue = new PQueue({ concurrency: QUEUE_CONCURRENCY, timeout: QUEUE_TIMEOUT_MS, throwOnTimeout: false });

  queue.on("active", () => {
    if (queue.size > 10) {
      logger.warn("Fila de mensagens com atraso", { size: queue.size, pending: queue.pending });
    }
  });

  return queue;
}

async function enqueue(fn) {
  const q = await getQueue();
  return q.add(fn);
}

async function getQueueStats() {
  if (!queue) return { size: 0, pending: 0 };
  return { size: queue.size, pending: queue.pending };
}

module.exports = { enqueue, getQueueStats };
