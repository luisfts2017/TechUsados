"use strict";

const {
  getEtapa, setEtapa, getDadosCliente, setDadosCliente,
  hasAguardandoHumano, setAguardandoHumano, deleteAguardandoHumano, deleteConversaIniciada,
  getConversaIniciada, setConversaIniciada,
  clearHistorico, deleteAvisadoMidia, deleteAvisadoForaHorario,
  getAllAguardandoHumano, hasAvisadoMidia,
} = require("../services/database");
const { verificarRateLimit } = require("../middleware/rateLimit");
const { verificarHorario } = require("../middleware/horarioCheck");
const { processarComandoAdmin } = require("./adminHandler");
const { processarMidia } = require("./mediaHandler");
const { processarFluxo } = require("./flowHandler");
const { enqueue } = require("../queue/messageQueue");
const { incrementar } = require("../monitoring/metrics");
const { logger } = require("../utils/logger");
const { MINUTOS_COM_HUMANO } = require("../config");
const { sleep } = require("../utils/helpers");

function redirecionarParaHumano(numero, dados = {}) {
  const liberaEm = Date.now() + MINUTOS_COM_HUMANO * 60 * 1000;
  setAguardandoHumano(numero, liberaEm);

  const fmt = numero.replace("@s.whatsapp.net", "");
  logger.info("Atendimento humano necessário", {
    numero: fmt,
    nome: dados.nome,
    equipamento: dados.equipamento,
    liberaEm: new Date(liberaEm).toISOString(),
  });

  return liberaEm;
}

async function processarMensagem(sock, msg) {
  const numero = msg.key.remoteJid;
  if (!numero) return;
  if (numero.endsWith("@g.us")) return;
  if (numero === "status@broadcast") return;

  const texto =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.buttonsResponseMessage?.selectedDisplayText ||
    msg.message?.listResponseMessage?.title ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    msg.message?.documentMessage?.caption ||
    null;

  const fmt = numero.replace("@s.whatsapp.net", "");
  const hora = new Date().toLocaleTimeString("pt-BR");
  const dados = getDadosCliente(numero);

  // ── Mensagens enviadas por você (atendente humano)
  if (msg.key.fromMe) {
    if (texto) {
      const foiComando = await processarComandoAdmin(sock, msg, texto);
      if (foiComando) return;
    }

    const expiraEm = Date.now() + MINUTOS_COM_HUMANO * 60 * 1000;
    await setConversaIniciada(numero, expiraEm);
    if (!await hasAguardandoHumano(numero)) {
      redirecionarParaHumano(numero, dados);
      logger.info("Você iniciou conversa — bot silenciado", { numero: fmt });
    }
    return;
  }

  incrementar("mensagensRecebidas");

  // ── Cliente respondeu conversa iniciada por você
  const tsConversa = await getConversaIniciada(numero);
  if ((tsConversa && tsConversa > Date.now()) || await hasAguardandoHumano(numero)) {
    const restam = await hasAguardandoHumano(numero)
      ? Math.ceil(((await hasAguardandoHumano(numero)) - Date.now()) / 60000)
      : Math.ceil((tsConversa - Date.now()) / 60000);
    logger.debug("Cliente em conversa humana — bot silenciado", { numero: fmt });
    return;
  }
  if (tsConversa) await deleteConversaIniciada(numero);

  // ── Rate limit
  if (await verificarRateLimit(numero)) {
    incrementar("rateLimitsAtingidos");
    logger.warn("Rate limit atingido — mensagem ignorada", { numero: fmt });
    return;
  }

  // ── Mídia
  if (!texto) {
    if (!await hasAguardandoHumano(numero)) {
      redirecionarParaHumano(numero, dados);
    }
    await processarMidia(sock, numero, msg);
    return;
  }

  logger.info("Mensagem recebida", { numero: fmt, texto: texto.slice(0, 80) });

  // ── Fora do horário
  if (await verificarHorario(sock, numero, dados)) {
    return;
  }

  await deleteAvisadoForaHorario(numero);

  // ── Atualizar última interação
  const agora = Date.now();
  const ultima = dados.ultimaInteracao || 0;
  let etapa = getEtapa(numero) || "novo";

  if (ultima > 0 && (agora - ultima > 24 * 60 * 60 * 1000) && !await hasAguardandoHumano(numero)) {
    etapa = "novo";
    setEtapa(numero, "novo");
  }

  setDadosCliente(numero, { ...dados, ultimaInteracao: agora });

  // ── Enfileirar processamento
  await enqueue(async () => {
    try {
      const dadosAtual = getDadosCliente(numero);
      const etapaAtual = getEtapa(numero) || "novo";
      const resposta = await processarFluxo(numero, texto, etapaAtual, dadosAtual);

      // Verifica se humano assumiu durante processamento
      if (await hasAguardandoHumano(numero) || await getConversaIniciada(numero) > Date.now()) {
        await sock.sendPresenceUpdate("paused", numero);
        logger.debug("Resposta descartada — humano assumiu", { numero: fmt });
        return;
      }

      // FIX: redireciona para humano após opção 3 (status)
      if (getEtapa(numero) === "status" && !await hasAguardandoHumano(numero)) {
        redirecionarParaHumano(numero, dadosAtual);
      }

      // Trata retorno especial (redirecionar_humano)
      let textoResposta = resposta;
      if (resposta && typeof resposta === "object" && resposta.tipo === "redirecionar_humano") {
        redirecionarParaHumano(numero, dadosAtual);
        textoResposta =
          `Certo! Vou transferir você para um de nossos atendentes. 👤\n\n` +
          `⏳ Por favor, *aguarde um momento*. Em breve alguém irá atendê-lo(a) por aqui. 🙏`;
      }

      // Verifica se GPT retornou "redirecionar"
      if (typeof textoResposta === "string" &&
          getEtapa(numero) !== "status" &&
          textoResposta.toLowerCase().includes("redirecionar") &&
          !await hasAguardandoHumano(numero)) {
        redirecionarParaHumano(numero, dadosAtual);
      }

      await sock.sendPresenceUpdate("composing", numero);
      const delay = Math.min(Math.max(textoResposta.length * 25, 1000), 5000);
      await sleep(delay);
      await sock.sendMessage(numero, { text: textoResposta });
      await sock.sendPresenceUpdate("paused", numero);

      incrementar("mensagensEnviadas");
      logger.info("LIA respondeu", { numero: fmt });
    } catch (err) {
      logger.error("Erro ao processar mensagem", { numero: fmt, error: err.message });
      incrementar("errosGPT");

      let msgErro;
      if (err.status === 429 || err.message?.includes("quota") || err.message?.includes("rate limit")) {
        msgErro =
          "Estou com muitas solicitações no momento. 😕\n\n" +
          "Por favor, *aguarde 1 minuto* e tente novamente, ou escolha *6️⃣ Falar com atendente*. 🙏";
      } else if (err.message?.includes("network") || err.message?.includes("ECONNREFUSED") || err.message?.includes("fetch")) {
        incrementar("errosRede");
        msgErro =
          "Estou com dificuldades de conexão no momento. 😕\n\n" +
          "Por favor, *tente novamente em instantes* ou escolha *6️⃣ Falar com atendente*. 🙏";
      } else {
        msgErro =
          "Ocorreu um problema inesperado. 😕\n\n" +
          "Por favor, *tente novamente* ou escolha *6️⃣ Falar com atendente* para atendimento imediato. 🙏";
      }

      try {
        await sock.sendMessage(numero, { text: msgErro });
      } catch (_) {}
    }
  });
}

module.exports = { processarMensagem, redirecionarParaHumano };
