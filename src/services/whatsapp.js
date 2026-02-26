"use strict";

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const qrcode = require("qrcode-terminal");
const { WHATSAPP_SESSION_PATH } = require("../config");
const { processarMensagem } = require("../handlers/messageHandler");
const { setWhatsappStatus } = require("../monitoring/healthCheck");
const {
  getAllAguardandoHumano, deleteAguardandoHumano, deleteConversaIniciada,
  setEtapa, clearHistorico, deleteAvisadoMidia, deleteAvisadoForaHorario,
  clearAvisadosForaHorario, limparDadosInativos,
} = require("../services/database");
const { logger } = require("../utils/logger");
const { MINUTOS_COM_HUMANO } = require("../config");

let _verificadorAtivo = false;
let _lastDailyCleanup = new Date().toDateString();

function iniciarVerificadorPeriodico() {
  if (_verificadorAtivo) return;
  _verificadorAtivo = true;

  setInterval(async () => {
    const agora = Date.now();
    const aguardando = await getAllAguardandoHumano();
    let liberados = 0;

    for (const [numero, ts] of aguardando) {
      if (ts <= agora) {
        await deleteAguardandoHumano(numero);
        await deleteConversaIniciada(numero);
        setEtapa(numero, "menu");
        clearHistorico(numero);
        await deleteAvisadoMidia(numero);
        liberados++;
        logger.info("LIA retomou atendimento (timer expirado)", { numero: numero.replace("@s.whatsapp.net", "") });
      }
    }

    const hoje = new Date().toDateString();
    if (hoje !== _lastDailyCleanup) {
      _lastDailyCleanup = hoje;
      await clearAvisadosForaHorario();
      const removidos = limparDadosInativos(90);
      if (removidos > 0) {
        logger.info("Limpeza diária", { clientesRemovidos: removidos });
      }
    }
  }, 2 * 60 * 1000);

  logger.info("Verificador periódico iniciado (intervalo: 2 min)");
}

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState(WHATSAPP_SESSION_PATH);
  const { version } = await fetchLatestBaileysVersion();
  const waLogger = P({ level: "silent" });

  const sock = makeWASocket({
    version,
    auth: state,
    logger: waLogger,
    printQRInTerminal: false,
    browser: ["Chrome (Linux)", "Chrome", "126.0.6478.114"],
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    retryRequestDelayMs: 2000,
  });

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.clear();
      console.log("\n" + "═".repeat(58));
      logger.info("📱 ESCANEIE O QR CODE COM SEU WHATSAPP");
      console.log("═".repeat(58) + "\n");
      qrcode.generate(qr, { small: true });
      console.log("\n" + "═".repeat(58));
    }

    if (connection === "open") {
      setWhatsappStatus(true);
      console.clear();
      console.log("\n" + "═".repeat(58));
      logger.info("✅ LIA ONLINE — INFOHOUSE INFORMÁTICA");
      logger.info("💬 Aguardando mensagens...");
      console.log("═".repeat(58) + "\n");
      iniciarVerificadorPeriodico();
    }

    if (connection === "close") {
      setWhatsappStatus(false);
      const codigo = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = codigo === DisconnectReason.loggedOut;
      if (loggedOut) {
        logger.warn(`Sessão encerrada. Delete '${WHATSAPP_SESSION_PATH}' e rode novamente.`);
      } else {
        logger.info("Reconectando em 5 segundos...");
        setTimeout(iniciarBot, 5000);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg) return;
    await processarMensagem(sock, msg);
  });
}

module.exports = { iniciarBot };
