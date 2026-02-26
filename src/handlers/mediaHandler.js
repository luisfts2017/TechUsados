"use strict";

const {
  hasAguardandoHumano, setAvisadoMidia, hasAvisadoMidia,
} = require("../services/database");
const { logger } = require("../utils/logger");

async function processarMidia(sock, numero, msg) {
  const fmt = numero.replace("@s.whatsapp.net", "");

  if (!await hasAguardandoHumano(numero)) {
    // Will be handled by redirecionarParaHumano in messageHandler
  }

  if (!await hasAvisadoMidia(numero)) {
    await setAvisadoMidia(numero);
    await sock.sendMessage(numero, {
      text:
        `Olá! Sou a *LIA*, Atendente Virtual da *Infohouse Informática*. 😊\n\n` +
        `Recebemos sua mensagem! Para conteúdos como *fotos e áudios*, ` +
        `vou direcionar você para um de nossos atendentes.\n\n` +
        `⏳ Por favor, *aguarde um momento*. Em breve alguém irá atendê-lo(a) por aqui. 🙏`,
    });
  }
  logger.info("Mídia recebida — redirecionado para humano", { numero: fmt });
}

module.exports = { processarMidia };
