"use strict";

const { dentroDoHorario, mensagemForaDoHorario, PAUSAR_FORA_DO_HORARIO } = require("../utils/helpers");
const { hasAvisadoForaHorario, setAvisadoForaHorario } = require("../services/database");
const { logger } = require("../utils/logger");

async function verificarHorario(sock, numero, dados) {
  if (!PAUSAR_FORA_DO_HORARIO) return false;
  if (dentroDoHorario()) return false;

  const jaAvisado = await hasAvisadoForaHorario(numero);
  if (!jaAvisado) {
    await setAvisadoForaHorario(numero);
    await sock.sendMessage(numero, { text: mensagemForaDoHorario(dados.nome) });
    logger.info("Fora do horário — aviso enviado", { numero });
  } else {
    logger.debug("Fora do horário — cliente já avisado", { numero });
  }
  return true;
}

module.exports = { verificarHorario };
