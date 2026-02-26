"use strict";

const { EMPRESA } = require("../config");

function menuPrincipal(nome) {
  return (
    `Olá, *${nome}*! Como posso ajudá-lo(a) hoje? 😊\n\n` +
    `Selecione uma das opções abaixo:\n\n` +
    `*1️⃣* — Solicitar orçamento\n` +
    `*2️⃣* — Relatar problema técnico\n` +
    `*3️⃣* — Verificar status do equipamento\n` +
    `*4️⃣* — Agendar visita à loja\n` +
    `*5️⃣* — Informações (horário, endereço, PIX...)\n` +
    `*6️⃣* — Falar com atendente\n\n` +
    `_Digite o número da opção desejada ou_ *faça sua pergunta diretamente* _que responderei na hora!_ 💬`
  );
}

function menuRetorno(nome) {
  return (
    `Olá, *${nome}*! Que bom ter você de volta, bem-vindo(a) à *Infohouse Informática*. 👋\n\n` +
    `Como posso ajudá-lo(a) hoje?\n\n` +
    `*1️⃣* — Solicitar orçamento\n` +
    `*2️⃣* — Relatar problema técnico\n` +
    `*3️⃣* — Verificar status do equipamento\n` +
    `*4️⃣* — Agendar visita à loja\n` +
    `*5️⃣* — Informações (horário, endereço, PIX...)\n` +
    `*6️⃣* — Falar com atendente\n\n` +
    `_Digite o número da opção desejada ou_ *faça sua pergunta diretamente* _que responderei na hora!_ 💬`
  );
}

function respostaOpcao5() {
  const { EMPRESA: E } = require("../config");
  return (
    `*Informações Gerais* ℹ️\n\n` +
    `📍 *Endereço:*\n${E.endereco}\n\n` +
    `🕐 *Horário:*\n${E.horarios}\n\n` +
    `🗺️ *Como chegar:*\n• Google Maps: ${E.maps}\n• Waze: ${E.waze}\n\n` +
    `💸 *PIX:*\n${E.pix}\n\n` +
    `💳 *Pagamentos:* ${E.pagamentos}\n\n` +
    `📲 *Redes:* ${E.instagram} | ${E.site}\n\n` +
    `Digite *menu* para voltar às opções. 😊`
  );
}

module.exports = { menuPrincipal, menuRetorno, respostaOpcao5 };
