"use strict";

const { HORARIO, PAUSAR_FORA_DO_HORARIO } = require("../config");

function dentroDoHorario() {
  const agora = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  const data = new Date(agora);
  const hora = data.getHours();
  const dia = data.getDay();
  return HORARIO.diasUteis.includes(dia) &&
    hora >= HORARIO.abertura &&
    hora < HORARIO.fechamento;
}

function mensagemForaDoHorario(nome = "") {
  const saudacao = nome ? `, *${nome}*` : "";
  return (
    `Olá${saudacao}! 👋\n\n` +
    `Obrigada pelo contato com a *Infohouse Informática*.\n\n` +
    `🕐 *Horário de atendimento:*\n` +
    `Segunda a Sexta: 08:00 às 18:00\n\n` +
    `No momento estamos fora do expediente, mas *eventualmente respondemos por aqui mesmo*. ` +
    `Deixe sua mensagem que retornaremos o mais breve possível! 😊\n\n` +
    `_Caso seja urgente, tente novamente durante o horário comercial._`
  );
}

function formatarNumero(numero) {
  return numero.replace("@s.whatsapp.net", "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { dentroDoHorario, mensagemForaDoHorario, formatarNumero, sleep, PAUSAR_FORA_DO_HORARIO };
