"use strict";

const {
  hasAguardandoHumano, deleteAguardandoHumano, deleteConversaIniciada,
  setEtapa, clearHistorico, deleteAvisadoMidia, getAllAguardandoHumano,
  getDadosCliente,
} = require("../services/database");
const { logger } = require("../utils/logger");

async function processarComandoAdmin(sock, msg, texto) {
  if (!msg.key.fromMe) return false;

  const textoL = texto.trim().toLowerCase();

  if (textoL.startsWith("#liberar")) {
    const partes = texto.trim().split(/\s+/);
    const alvo = partes[1];

    if (!alvo) {
      await sock.sendMessage(msg.key.remoteJid, { text: "⚠️ Uso: *#liberar 5551999999999*" });
      return true;
    }

    const numeroAlvo = `${alvo}@s.whatsapp.net`;
    const estaAguardando = await hasAguardandoHumano(numeroAlvo);

    if (estaAguardando) {
      await deleteAguardandoHumano(numeroAlvo);
      await deleteConversaIniciada(numeroAlvo);
      setEtapa(numeroAlvo, "menu");
      clearHistorico(numeroAlvo);
      await deleteAvisadoMidia(numeroAlvo);
      const dados = getDadosCliente(numeroAlvo);
      const nome = dados.nome || alvo;
      logger.info("Cliente liberado manualmente", { numero: alvo });
      await sock.sendMessage(msg.key.remoteJid, {
        text: `✅ *${nome}* (${alvo}) foi liberado. A LIA retomará o atendimento na próxima mensagem.`,
      });
    } else {
      await sock.sendMessage(msg.key.remoteJid, {
        text: `ℹ️ O número ${alvo} não está com atendimento humano ativo.`,
      });
    }
    return true;
  }

  if (textoL === "#lista") {
    const aguardando = await getAllAguardandoHumano();
    if (aguardando.size === 0) {
      await sock.sendMessage(msg.key.remoteJid, {
        text: "✅ Nenhum cliente aguardando atendimento humano no momento.",
      });
    } else {
      const agora = Date.now();
      let lista = `👥 *Clientes com atendente humano (${aguardando.size}):*\n\n`;
      for (const [num, ts] of aguardando) {
        const fmt = num.replace("@s.whatsapp.net", "");
        const dados = getDadosCliente(num);
        const nome = dados.nome || "—";
        const restam = Math.ceil((ts - agora) / 60000);
        lista += `• *${fmt}* — ${nome} (~${restam} min restantes)\n`;
      }
      lista += `\n_Use #liberar <número> para liberar._`;
      await sock.sendMessage(msg.key.remoteJid, { text: lista });
    }
    return true;
  }

  return false;
}

module.exports = { processarComandoAdmin };
