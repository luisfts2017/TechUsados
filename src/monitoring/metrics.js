"use strict";

const metrics = {
  mensagensRecebidas: 0,
  mensagensEnviadas: 0,
  errosGPT: 0,
  errosRede: 0,
  rateLimitsAtingidos: 0,
  gptDurations: [],
  startTime: Date.now(),
};

function incrementar(key) {
  if (key in metrics) metrics[key]++;
}

function registrarDuracaoGPT(ms) {
  metrics.gptDurations.push(ms);
  if (metrics.gptDurations.length > 100) metrics.gptDurations.shift();
}

function getMetrics() {
  const avg = metrics.gptDurations.length > 0
    ? Math.round(metrics.gptDurations.reduce((a, b) => a + b, 0) / metrics.gptDurations.length)
    : 0;
  return {
    uptime: Math.round((Date.now() - metrics.startTime) / 1000),
    mensagensRecebidas: metrics.mensagensRecebidas,
    mensagensEnviadas: metrics.mensagensEnviadas,
    errosGPT: metrics.errosGPT,
    errosRede: metrics.errosRede,
    rateLimitsAtingidos: metrics.rateLimitsAtingidos,
    tempoMedioRespostaGPT: avg,
  };
}

module.exports = { incrementar, registrarDuracaoGPT, getMetrics };
