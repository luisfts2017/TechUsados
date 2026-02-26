// ╔══════════════════════════════════════════════════════════════╗
// ║         LIA — Atendente Virtual | Infohouse Informática      ║
// ║         WhatsApp Bot  •  Baileys + OpenAI GPT-4o-mini        ║
// ║         v4.3 — Correções: prompt completo, avisadoMidia,     ║
// ║                race condition status, histórico, menu livre,  ║
// ║                retorno ao menu GPT, JSON atômico             ║
// ╚══════════════════════════════════════════════════════════════╝

require("dotenv").config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const OpenAI = require("openai");
const qrcode = require("qrcode-terminal");
const P = require("pino");
const fs = require("fs");
const path = require("path");

// ══════════════════════════════════════════════════════════════
//  📝  LOG EM ARQUIVO
// ══════════════════════════════════════════════════════════════
const DIR_LOGS = path.join(__dirname, "logs");
if (!fs.existsSync(DIR_LOGS)) fs.mkdirSync(DIR_LOGS);

function log(msg) {
  const agora    = new Date();
  const dataHora = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const dataArq  = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
                        .split("/").reverse().join("-"); // AAAA-MM-DD
  const linha    = `[${dataHora}] ${msg}`;
  console.log(linha);
  try {
    fs.appendFileSync(path.join(DIR_LOGS, 
    `${dataArq}.txt`), linha + "\n");
  } catch (e) { /* ignora erro de escrita */ }
}

// ══════════════════════════════════════════════════════════════
//  ⚙️  CONFIGURAÇÕES — edite aqui
// ══════════════════════════════════════════════════════════════

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  const msgChave = "❌ OPENAI_API_KEY não encontrada! Crie o arquivo .env com a chave.";
  console.error(msgChave);
  try { fs.appendFileSync(path.join(DIR_LOGS, "erro-inicializacao.txt"),
  `[${new Date().toISOString()}] ${msgChave}\n`); } catch (_) {}
  process.exit(1);
}
const MINUTOS_COM_HUMANO = 60;

// Horário comercial (24h)
const HORARIO = { abertura: 8, fechamento: 18, diasUteis: [1, 2, 3, 4, 5] };

const PAUSAR_FORA_DO_HORARIO = true;

const ARQUIVO_SESSAO = "sessao_clientes.json";

const EMPRESA = {
  nome: "Infohouse Informática",
  cidade: "Igrejinha/RS",
  horarios: "Segunda a Sexta: 08:00 às 18:00 | Sábado e Domingo: Fechado",
  endereco: "Rua dos Renck, 66 - Figueira, Igrejinha/RS, CEP 95650-000",
  maps: "https://maps.app.goo.gl/51gLqamujkWnH1oK7",
  waze: "https://www.waze.com/en/live-map/directions/br/rs/infohouse-informatica?navigate=yes&place=ChIJIzm_a6MjGZUR7qWKqJ98Cm8",
  pix: "CNPJ 18.475.105/0001-62 — Beneficiária: Cintia Carina Engelmann",
  pagamentos: "PIX, Cartão de crédito, Cartão de débito, Dinheiro (parcelamos em até 3x sem juros)",
  whatsapp: "(51) 99746-6591",
  instagram: "@infohouse.igrejinha",
  site: "infohouse.inf.br",
  servicos: `
• Manutenção e conserto de computadores e notebooks
• Formatação e instalação de sistemas operacionais
• Limpeza interna e troca de pasta térmica
• Upgrade de memória RAM e SSD
• Recuperação de dados
• Remoção de vírus e malwares
• Suporte técnico presencial e remoto
• Venda de peças, acessórios e periféricos`,
  politicas: `
• Orçamento gratuito mediante avaliação presencial na loja
• Garantia em todos os serviços realizados
• Equipamentos ficam prontos conforme complexidade — prazo informado na entrega
• Não nos responsabilizamos por dados não salvos previamente pelo cliente`,
};

// ══════════════════════════════════════════════════════════════
//  💾  PERSISTÊNCIA DE SESSÃO
// ══════════════════════════════════════════════════════════════

function carregarSessao() {
  try {
    if (fs.existsSync(ARQUIVO_SESSAO)) {
      const raw = JSON.parse(fs.readFileSync(ARQUIVO_SESSAO, "utf8"));
      const agora = Date.now();
      const aguardando = new Map();
      for (const [num, ts] of Object.entries(raw.aguardandoHumano || {})) {
        if (ts > agora) aguardando.set(num, ts);
      }
      const conversas = new Map();
      for (const [num, ts] of Object.entries(raw.conversasIniciadas || {})) {
        if (ts > agora) conversas.set(num, ts);
      }
      return {
        etapaCliente: raw.etapaCliente || {},
        dadosCliente: raw.dadosCliente || {},
        aguardandoHumano: aguardando,
        conversasIniciadas: conversas,
      };
    }
  } catch (e) {
    log(`⚠️  Erro ao carregar sessão: ${e.message}`);
  }
  return { etapaCliente: {}, dadosCliente: {}, aguardandoHumano: new Map(), conversasIniciadas: new Map() };
}

// ══════════════════════════════════════════════════════════════
//  🧠  ESTADO DOS CLIENTES
// ══════════════════════════════════════════════════════════════

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const sessao = carregarSessao();

const historico = {};
const aguardandoHumano   = sessao.aguardandoHumano;
const etapaCliente       = sessao.etapaCliente;
const dadosCliente       = sessao.dadosCliente;
const avisadoForaHorario = new Set();
const conversasIniciadas = sessao.conversasIniciadas || new Map();
const avisadoMidia       = new Set();

let sockGlobal = null;

// ══════════════════════════════════════════════════════════════
//  💾  SALVAR SESSÃO — escrita atômica via arquivo temporário
//  FIX #7: renameSync é atômico no mesmo filesystem, evita
//  corrupção do JSON em caso de queda durante writeFileSync.
// ══════════════════════════════════════════════════════════════
function salvarSessao() {
  try {
    const agora = Date.now();
    for (const [num, ts] of conversasIniciadas) {
      if (ts < agora) conversasIniciadas.delete(num);
    }
    const payload = {
      etapaCliente,
      dadosCliente,
      aguardandoHumano: Object.fromEntries(aguardandoHumano),
      conversasIniciadas: Object.fromEntries(conversasIniciadas),
    };
    const tmpFile = ARQUIVO_SESSAO + ".tmp";
    fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2));
    fs.renameSync(tmpFile, ARQUIVO_SESSAO); // FIX #7: atômico
  } catch (e) {
    log(`⚠️  Erro ao salvar sessão: ${e.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
//  🛡️  RATE LIMITING — proteção anti-flood
// ══════════════════════════════════════════════════════════════
const RATE_LIMIT_MAX  = 8;
const RATE_LIMIT_SECS = 60;
const contadorMensagens = new Map();

function verificarRateLimit(numero) {
  const agora  = Date.now();
  const entry  = contadorMensagens.get(numero);
  if (!entry || (agora - entry.desde) > RATE_LIMIT_SECS * 1000) {
    contadorMensagens.set(numero, { count: 1, desde: agora });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// ══════════════════════════════════════════════════════════════
//  🕐  HORÁRIO COMERCIAL
// ══════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════
//  📋  MENU PRINCIPAL
// ══════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════
//  🤖  PROMPTS GPT POR CONTEXTO
// ══════════════════════════════════════════════════════════════

function getPrompt(contexto = "geral") {
  const base = `
Você é a *LIA*, Atendente Virtual da ${EMPRESA.nome}, em ${EMPRESA.cidade}.
Tom: Responda em português, de forma simpática, profissional e prestativa. Use "você". Use emojis com moderação.
NUNCA invente informações. Use apenas os dados abaixo.
Não repita saudações se já cumprimentou o cliente.
Finalize sempre perguntando se pode ajudar em mais alguma coisa.

📍 ENDEREÇO: ${EMPRESA.endereco}
🗺️ Maps: ${EMPRESA.maps} | Waze: ${EMPRESA.waze}
🕐 HORÁRIOS: ${EMPRESA.horarios}
💸 PIX: ${EMPRESA.pix}
💳 PAGAMENTOS: ${EMPRESA.pagamentos}
📞 WhatsApp: ${EMPRESA.whatsapp} | Instagram: ${EMPRESA.instagram} | Site: ${EMPRESA.site}
🔧 SERVIÇOS:${EMPRESA.servicos}
📋 POLÍTICAS:${EMPRESA.politicas}
`;

  const contextos = {
    orcamento: base + `
CONTEXTO: Cliente solicitou orçamento.
- Orçamento é gratuito e feito presencialmente na loja após avaliação do equipamento.
- Pergunte qual equipamento e o problema para registrar e agilizar o atendimento.
- Forneça endereço e horário para que o cliente traga o equipamento.`,

    problema: base + `
CONTEXTO: Cliente relatou problema técnico.
- Demonstre empatia de forma profissional.
- Informe que é necessário trazer o equipamento à loja para diagnóstico presencial.
- Orçamento gratuito após avaliação.
- Se o cliente descrever o problema, ofereça orientações básicas apenas se forem seguras e óbvias.`,

    status: base + `
CONTEXTO: Cliente perguntou sobre o status do equipamento.
- Não temos acesso ao sistema de OS em tempo real neste canal.
- Informe que o atendente humano já foi acionado para verificar.
- NÃO use a palavra "redirecionar" pois o cliente já foi redirecionado.`,

    agendamento: base + `
CONTEXTO: Cliente quer agendar visita à loja.
- Horário: Segunda a Sexta, 08h às 18h.
- Atendimento por ordem de chegada ou com agendamento prévio.
- Confirme os dados coletados (nome, telefone, equipamento, dia/hora preferido).
- Diga que confirmaremos o agendamento por aqui mesmo.`,

    // FIX #1: Regra crítica off-topic COMPLETA — não truncada
    geral: base + `
CONTEXTO: Atendimento geral.
- Responda APENAS sobre serviços, políticas e informações da Infohouse Informática.
- NUNCA explique procedimentos técnicos detalhados (ex: como formatar, como instalar, como consertar).
- 🛑 REGRA CRÍTICA OFF-TOPIC: Se o cliente falar sobre qualquer coisa fora do escopo da loja (assuntos aleatórios, jogos, receitas, política, esportes, etc.), RECUSE educadamente dizendo que você é apenas a Atendente Virtual da Infohouse Informática e só pode ajudar com assuntos relacionados aos serviços da loja.
- Se perguntarem sobre procedimentos técnicos, informe que o diagnóstico é presencial na loja.
- Se a pergunta para a loja for muito complexa, não invente: use a palavra "redirecionar" para acionar atendente humano.`,
  };

  return contextos[contexto] || contextos.geral;
}

// ══════════════════════════════════════════════════════════════
//  💬  CHAMAR GPT
// ══════════════════════════════════════════════════════════════

async function chamarGPT(numero, texto, contexto = "geral") {
  if (!historico[numero]) historico[numero] = [];
  historico[numero].push({ role: "user", content: texto });
  if (historico[numero].length > 10) historico[numero] = historico[numero].slice(-10);

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 15000);

  let resposta;
  try {
    const res = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: getPrompt(contexto) },
          ...historico[numero],
        ],
        max_tokens: 600,
        temperature: 0.5,
      },
      { signal: controller.signal }
    );
    resposta = res.choices[0].message.content;
  } catch (e) {
    if (e.name === "AbortError" || e.code === "ERR_ABORTED") {
      log(`⏱️  [GPT TIMEOUT] ${numero.replace("@s.whatsapp.net"," ")} — resposta demorou >15s`);
      historico[numero].pop();
      return (
        "Desculpe, estou com lentidão no momento. 😕\n\n" +
        "Por favor, *tente novamente em alguns instantes* ou " +
        "escolha *6️⃣ Falar com atendente* para atendimento imediato. 🙏"
      );
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  historico[numero].push({ role: "assistant", content: resposta });

  if (contexto !== "status" && resposta.toLowerCase().includes("redirecionar")) {
    redirecionarParaHumano(numero);
  }

  return resposta;
}

// ══════════════════════════════════════════════════════════════
//  👤  REDIRECIONAR PARA HUMANO
// ══════════════════════════════════════════════════════════════

function redirecionarParaHumano(numero) {
  if (aguardandoHumano.has(numero)) return;
  const liberaEm = Date.now() + MINUTOS_COM_HUMANO * 60 * 1000;
  aguardandoHumano.set(numero, liberaEm);
  salvarSessao();

  const fmt = numero.replace("@s.whatsapp.net", "");
  const dados = dadosCliente[numero] || {};

  log(`\n${"━".repeat(58)}`);
  log(`🔔  ATENÇÃO — ATENDIMENTO HUMANO NECESSÁRIO`);
  log(`👤  Número   : ${fmt}`);
  if (dados.nome) log(`📋  Nome     : ${dados.nome}`);
  if (dados.telefone) log(`📞  Telefone : ${dados.telefone}`);
  if (dados.equipamento) log(`🖥️   Equip.   : ${dados.equipamento}`);
  log(`⏱️   LIA retoma automaticamente em ${MINUTOS_COM_HUMANO} minutos`);
  log(`💡  Para liberar antes: envie #liberar ${fmt} pelo WhatsApp`);
  log(`${"━".repeat(58)}\n`);
}

// ══════════════════════════════════════════════════════════════
//  ⏱️  VERIFICADOR PERIÓDICO — libera clientes com timer expirado
// ══════════════════════════════════════════════════════════════
let _verificadorAtivo = false;

function iniciarVerificadorPeriodico() {
  if (_verificadorAtivo) return;
  _verificadorAtivo = true;
  setInterval(() => {
    const agora = Date.now();
    let liberados = 0;

    for (const [numero, ts] of aguardandoHumano) {
      if (ts <= agora) {
        const fmt = numero.replace("@s.whatsapp.net", "");
        aguardandoHumano.delete(numero);
        conversasIniciadas.delete(numero);
        etapaCliente[numero] = "menu";
        // FIX #3: limpa histórico GPT ao expirar o timer do humano
        delete historico[numero];
        // FIX #2: remove número do Set de mídia ao liberar
        avisadoMidia.delete(numero);
        liberados++;
        log(`🤖  LIA retomou atendimento de ${fmt} (timer expirado)`);
      }
    }

    for (const [numero, ts] of conversasIniciadas) {
      if (ts <= agora) {
        conversasIniciadas.delete(numero);
        // FIX #2: remove do avisadoMidia também ao expirar conversa
        avisadoMidia.delete(numero);
      }
    }

    if (liberados > 0) salvarSessao();
  }, 2 * 60 * 1000);

  log("⏱️  Verificador periódico iniciado (intervalo: 2 min)");
}

// ══════════════════════════════════════════════════════════════
//  🔓  LIBERAR CLIENTE MANUALMENTE (comando via WhatsApp)
// ══════════════════════════════════════════════════════════════

async function processarComandoAdmin(msg, texto) {
  if (!msg.key.fromMe) return false;

  const textoL = texto.trim().toLowerCase();

  if (textoL.startsWith("#liberar")) {
    const partes = texto.trim().split(/\s+/);
    const alvo = partes[1];

    if (!alvo) {
      await sockGlobal.sendMessage(msg.key.remoteJid, {
        text: "⚠️ Uso: *#liberar 5551999999999*",
      });
      return true;
    }

    const numeroAlvo = `${alvo}@s.whatsapp.net`;
    const estaAguardando = aguardandoHumano.has(numeroAlvo);
    const estaEmConversa = conversasIniciadas.has(numeroAlvo);

    if (estaAguardando || estaEmConversa) {
      aguardandoHumano.delete(numeroAlvo);
      conversasIniciadas.delete(numeroAlvo);
      etapaCliente[numeroAlvo] = "menu";
      // FIX #3: limpa histórico GPT ao liberar manualmente
      delete historico[numeroAlvo];
      // FIX #2: limpa avisadoMidia ao liberar manualmente
      avisadoMidia.delete(numeroAlvo);
      salvarSessao();
      const nome = dadosCliente[numeroAlvo]?.nome || alvo;
      log(`🔓 [ADMIN] ${alvo} liberado manualmente — LIA retomará atendimento.\n`);
      await sockGlobal.sendMessage(msg.key.remoteJid, {
        text: `✅ *${nome}* (${alvo}) foi liberado. A LIA retomará o atendimento na próxima mensagem.`,
      });
    } else {
      await sockGlobal.sendMessage(msg.key.remoteJid, {
        text: `ℹ️ O número ${alvo} não está com atendimento humano ativo.`,
      });
    }
    return true;
  }

  if (textoL === "#lista") {
    if (aguardandoHumano.size === 0) {
      await sockGlobal.sendMessage(msg.key.remoteJid, {
        text: "✅ Nenhum cliente aguardando atendimento humano no momento.",
      });
    } else {
      const agora = Date.now();
      let lista = `👥 *Clientes com atendente humano (${aguardandoHumano.size}):*\n\n`;
      for (const [num, ts] of aguardandoHumano) {
        const fmt = num.replace("@s.whatsapp.net", "");
        const nome = dadosCliente[num]?.nome || "—";
        const restam = Math.ceil((ts - agora) / 60000);
        lista += `• *${fmt}* — ${nome} (~${restam} min restantes)\n`;
      }
      lista += `\n_Use #liberar <número> para liberar._`;
      await sockGlobal.sendMessage(msg.key.remoteJid, { text: lista });
    }
    return true;
  }

  return false;
}

// ══════════════════════════════════════════════════════════════
//  🔄  FLUXO PRINCIPAL
// ══════════════════════════════════════════════════════════════

async function processarMensagem(numero, texto) {
  let etapa = etapaCliente[numero] || "novo";
  const dados = dadosCliente[numero] || {};
  const textoN = texto.trim();
  const textoL = textoN.toLowerCase();

  const AGORA = Date.now();
  const ULTIMA = dados.ultimaInteracao || 0;
  if (ULTIMA > 0 && (AGORA - ULTIMA > 24 * 60 * 60 * 1000) && !aguardandoHumano.has(numero)) {
    etapa = "novo";
    etapaCliente[numero] = "novo";
  }
  dados.ultimaInteracao = AGORA;
  dadosCliente[numero] = dados;

  // ── Palavra-chave: voltar ao menu ────────────────────────────
  if (["menu", "inicio", "início", "voltar", "0"].includes(textoL) && etapa !== "novo") {
    etapaCliente[numero] = "menu";
    historico[numero] = [];
    salvarSessao();
    return menuPrincipal(dados.nome || "");
  }

  // ── NOVO CLIENTE ou CLIENTE RETORNANDO (boas-vindas) ───────────
  if (etapa === "novo") {
    if (dados.nome) {
      etapaCliente[numero] = "menu";
      historico[numero] = [];
      salvarSessao();
      log(`\n🔄 Cliente antigo retornou: ${dados.nome} | WA: ${numero.replace("@s.whatsapp.net", "")}\n`);
      return (
        `Olá, *${dados.nome}*! Que bom ter você de volta à *Infohouse Informática*. 👋\n\n` +
        `Como posso ajudá-lo(a) hoje?\n\n` +
        `*1️⃣* — Solicitar orçamento\n` +
        `*2️⃣* — Relatar problema técnico\n` +
        `*3️⃣* — Verificar status do equipamento\n` +
        `*4️⃣* — Agendar visita à loja\n` +
        `*5️⃣* — Informações (horário, endereço, PIX...)\n` +
        `*6️⃣* — Falar com atendente\n\n` +
        `_Digite o número da opção desejada ou_ *faça sua pergunta diretamente* _que responderei na hora!_ 💬`
      );
    } else {
      etapaCliente[numero] = "coletando_nome";
      dadosCliente[numero] = { ...dados, primeiraMensagem: textoN };
      historico[numero] = [];
      salvarSessao();
      return (
        `Olá! Seja bem-vindo(a) à *Infohouse Informática*. 👋\n\n` +
        `Sou a *LIA*, sua Atendente Virtual, e estou aqui para ajudá-lo(a)!\n\n` +
        `Para iniciar o atendimento, poderia me informar o seu *nome*, por favor?`
      );
    }
  }

  // ── COLETA NOME ──────────────────────────────────────────────
  if (etapa === "coletando_nome") {
    const promptNome = `O cliente respondeu: "${textoN}"
Extraia APENAS o primeiro nome ou nome completo da pessoa.
Regras:
- Se for claramente um nome (ex: "João", "Maria Silva", "me chamo Pedro"), retorne só o nome.
- Se misturou nome com outras informações (ex: "Carlos, tenho um notebook"), retorne só "Carlos".
- Se NÃO contiver nome de pessoa (ex: "Ela é um acer", "notebook Dell", "oi", números), retorne: NAO_IDENTIFICADO
Retorne APENAS o nome ou NAO_IDENTIFICADO, sem mais nenhum texto.`;

    let nomeExtraido = "";
    try {
      const resNome = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: promptNome }],
        max_tokens: 20,
        temperature: 0,
      });
      nomeExtraido = resNome.choices[0].message.content.trim();
    } catch (e) {
      nomeExtraido = textoN.split(" ").slice(0, 2).join(" ");
    }

    if (!nomeExtraido || nomeExtraido === "NAO_IDENTIFICADO" || nomeExtraido.length < 2) {
      return (
        `Desculpe, não consegui identificar seu nome. 😊\n\n` +
        `Poderia me informar apenas o seu *nome*? _(ex: João, Maria Silva)_`
      );
    }

    const nome = nomeExtraido.split(" ").slice(0, 2).join(" ");
    const primeiraMensagem = dados.primeiraMensagem || null;

    dadosCliente[numero] = { ...dados, nome, primeiraMensagem: undefined };
    etapaCliente[numero] = "menu";
    salvarSessao();

    log(`\n📋 Novo cliente: ${nome} | WA: ${numero.replace("@s.whatsapp.net", "")}\n`);

    if (primeiraMensagem) {
      historico[numero] = [];
      const respostaContexto = await chamarGPT(numero, `Meu nome é ${nome}. ${primeiraMensagem}`, "geral");
      return (
        `Olá, *${nome}*! Seja bem-vindo(a) à *Infohouse Informática*! 😊\n\n` +
        respostaContexto
      );
    }

    return menuPrincipal(nome);
  }

  // ── MENU PRINCIPAL ───────────────────────────────────────────
  if (etapa === "menu") {
    const opcao = textoN.trim().replace(/[^1-6]/g, "").slice(0, 1);

    if (opcao === "1") {
      etapaCliente[numero] = "orcamento";
      salvarSessao();
      return (
        `*Solicitação de Orçamento* 💻\n\n` +
        `Com prazer! Para agilizar seu atendimento, por favor me informe:\n\n` +
        `🔹 *Equipamento:* _(ex: notebook Dell, desktop, impressora...)_\n` +
        `🔹 *Problema ou serviço desejado:* _(descreva com o máximo de detalhes)_`
      );
    }

    if (opcao === "2") {
      etapaCliente[numero] = "problema";
      salvarSessao();
      return (
        `*Suporte Técnico* 🔧\n\n` +
        `Lamento que esteja com dificuldades! Vou ajudá-lo(a).\n\n` +
        `Para que possamos entender melhor, por favor descreva:\n\n` +
        `🔹 *Qual equipamento* apresenta o problema?\n` +
        `🔹 *O que está acontecendo* exatamente? Quando começou?`
      );
    }

    // FIX #4 (race condition opção 3): envia mensagem de status ANTES de redirecionar
    // para garantir que o cliente receba a resposta mesmo com a guarda dupla ativa.
    if (opcao === "3") {
      etapaCliente[numero] = "status";
      salvarSessao();
      // Retorna primeiro; o redirecionamento é feito no handler externo após o envio
      return (
        `*Status do Equipamento* 🔍\n\n` +
        `Para verificar o andamento do seu equipamento, precisarei acionar ` +
        `um de nossos atendentes que consultará diretamente no sistema.\n\n` +
        `⏳ Por favor, *aguarde um momento*. Em breve retornaremos! 🙏\n\n` +
        `_Você receberá uma confirmação assim que um atendente estiver disponível._`
      );
    }

    if (opcao === "4") {
      etapaCliente[numero] = "agendamento";
      salvarSessao();
      return (
        `*Agendamento de Visita* 📅\n\n` +
        `Ficamos felizes em recebê-lo(a) na loja!\n\n` +
        `🕐 *Horário de funcionamento:*\n` +
        `Segunda a Sexta: 08:00 às 18:00\n\n` +
        `Para confirmar o agendamento, informe por favor:\n\n` +
        `🔹 *Equipamento* que irá trazer\n` +
        `🔹 *Dia e horário* de preferência\n` +
        `🔹 *Breve descrição* do problema ou serviço\n\n` +
        `_O atendimento também pode ser feito por ordem de chegada, sem agendamento prévio._`
      );
    }

    if (opcao === "5") {
      etapaCliente[numero] = "atendendo";
      salvarSessao();
      return (
        `*Informações Gerais* ℹ️\n\n` +
        `📍 *Endereço:*\n${EMPRESA.endereco}\n\n` +
        `🕐 *Horário:*\n${EMPRESA.horarios}\n\n` +
        `🗺️ *Como chegar:*\n• Google Maps: ${EMPRESA.maps}\n• Waze: ${EMPRESA.waze}\n\n` +
        `💸 *PIX:*\n${EMPRESA.pix}\n\n` +
        `💳 *Pagamentos:* ${EMPRESA.pagamentos}\n\n` +
        `📲 *Redes:* ${EMPRESA.instagram} | ${EMPRESA.site}\n\n` +
        `Digite *menu* para voltar às opções. 😊`
      );
    }

    if (opcao === "6") {
      redirecionarParaHumano(numero);
      return (
        `Certo! Vou transferir você para um de nossos atendentes. 👤\n\n` +
        `⏳ Por favor, *aguarde um momento*. Em breve alguém irá atendê-lo(a) por aqui. 🙏`
      );
    }

    // FIX #5: Distingue texto livre (pergunta) de número inválido
    // Se o texto contém apenas dígitos mas nenhum válido (1-6) → orienta o cliente
    // Se o texto é uma pergunta livre → responde via GPT geral sem exigir opção
    if (!opcao) {
      const somenteDigitos = /^\d+$/.test(textoN.trim());
      if (somenteDigitos) {
        return menuPrincipal(dados.nome || "") +
          `\n\n_Por favor, escolha uma opção de *1 a 6*._`;
      }
      // Pergunta livre no menu → GPT geral, permanece no menu
      return await chamarGPT(numero, textoN, "geral");
    }

    return await chamarGPT(numero, textoN, "geral");
  }

  // ── FLUXOS COM GPT ───────────────────────────────────────────
  const mapaContexto = {
    orcamento: "orcamento",
    problema: "problema",
    status: "status",
    agendamento: "agendamento",
    atendendo: "geral",
  };

  const contexto = mapaContexto[etapa] || "geral";

  if (["orcamento", "problema"].includes(etapa) && !dados.equipamento) {
    dadosCliente[numero] = { ...dados, equipamento: textoN.slice(0, 80) };
    salvarSessao();
  }

  const resposta = await chamarGPT(numero, textoN, contexto);

  // FIX #6: Após resposta GPT em fluxos de orçamento/agendamento/problema,
  // retorna ao menu para evitar que o cliente fique preso na etapa "atendendo"
  // indefinidamente. A etapa muda para "menu" somente após a primeira resposta
  // satisfatória, sinalizando que o tópico principal foi tratado.
  if (["orcamento", "agendamento", "problema"].includes(etapa)) {
    etapaCliente[numero] = "menu";
    salvarSessao();
  }

  return resposta;
}

// ══════════════════════════════════════════════════════════════
//  🚀  INICIAR BOT
// ══════════════════════════════════════════════════════════════

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState("sessao_whatsapp");
  const { version } = await fetchLatestBaileysVersion();
  const logger = P({ level: "silent" });

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ["Chrome (Linux)", "Chrome", "126.0.6478.114"],
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    retryRequestDelayMs: 2000,
  });

  sockGlobal = sock;

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.clear();
      console.log("\n" + "═".repeat(58));
      log("  📱  ESCANEIE O QR CODE COM SEU WHATSAPP");
      log("       WhatsApp  ›  ⋮  ›  Dispositivos conectados  ›  +");
      console.log("═".repeat(58) + "\n");
      qrcode.generate(qr, { small: true });
      console.log("\n" + "═".repeat(58));
    }

    if (connection === "open") {
      console.clear();
      console.log("\n" + "═".repeat(58));
      log("  ✅  LIA ONLINE — INFOHOUSE INFORMÁTICA");
      log("  🏪  Igrejinha/RS  |  Seg-Sex 08h às 18h");
      log("  💬  Aguardando mensagens...");
      log("  💡  Comandos: #liberar <num> | #lista");
      log("  🛑  Parar: Ctrl + C");
      console.log("═".repeat(58) + "\n");

      iniciarVerificadorPeriodico();
    }

    if (connection === "close") {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = codigo === DisconnectReason.loggedOut;
      if (loggedOut) {
        log("🚪 Sessão encerrada. Delete 'sessao_whatsapp' e rode novamente.");
      } else {
        log("🔄 Reconectando em 5 segundos...");
        setTimeout(iniciarBot, 5000);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const msg = messages[0];
    if (!msg) return;

    const numero = msg.key.remoteJid;

    if (!numero) return;
    if (numero.endsWith("@g.us")) return;
    if (numero === "status@broadcast") return;

    const texto =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      null;

    const hora = new Date().toLocaleTimeString("pt-BR");
    const fmt = numero.replace("@s.whatsapp.net", "");
    const dados = dadosCliente[numero] || {};

    // ── MENSAGENS ENVIADAS POR VOCÊ (atendente humano) ──────────
    if (msg.key.fromMe) {
      if (texto) {
        const foiComando = await processarComandoAdmin(msg, texto);
        if (foiComando) return;
      }

      const expiraEm = Date.now() + MINUTOS_COM_HUMANO * 60 * 1000;
      conversasIniciadas.set(numero, expiraEm);
      if (!aguardandoHumano.has(numero)) {
        redirecionarParaHumano(numero);
        log(`👨‍💼 [${hora}] Você iniciou conversa com ${fmt} — bot silenciado automaticamente`);
      }

      return;
    }

    // ── CLIENTE RESPONDEU conversa iniciada por você ──────────
    const tsConversa = conversasIniciadas.get(numero);
    if ((tsConversa && tsConversa > Date.now()) || aguardandoHumano.has(numero)) {
      const restam = aguardandoHumano.has(numero)
        ? Math.ceil((aguardandoHumano.get(numero) - Date.now()) / 60000)
        : Math.ceil((tsConversa - Date.now()) / 60000);
      log(`👤 [${hora}] ${fmt} respondeu conversa humana (~${restam} min restantes) — bot silenciado`);
      return;
    }
    if (tsConversa) conversasIniciadas.delete(numero);

    // ── RATE LIMIT ─────────────────────────────────────────────
    if (verificarRateLimit(numero)) {
      log(`🚫 [${hora}] ${fmt} bloqueado por flood (>${RATE_LIMIT_MAX} msgs/${RATE_LIMIT_SECS}s)`);
      return;
    }

    // ── MÍDIA → redireciona ────────────────────────────────────
    if (!texto) {
      if (!aguardandoHumano.has(numero)) {
        redirecionarParaHumano(numero);
      }
      if (!avisadoMidia.has(numero)) {
        avisadoMidia.add(numero);
        await sock.sendMessage(numero, {
          text:
            `Olá! Sou a *LIA*, Atendente Virtual da *Infohouse Informática*. 😊\n\n` +
            `Recebemos sua mensagem! Para conteúdos como *fotos e áudios*, ` +
            `vou direcionar você para um de nossos atendentes.

` +
            `⏳ Por favor, *aguarde um momento*. Em breve alguém irá atendê-lo(a) por aqui. 🙏",
        });
      }
      log(`📎 [${hora}] ${fmt} enviou mídia — redirecionado para atendente humano`);
      return;
    }

    log(`📩 [${hora}] ${fmt}: ${texto}`);

    // ── FORA DO HORÁRIO COMERCIAL ────────────────────────────
    if (PAUSAR_FORA_DO_HORARIO && !dentroDoHorario()) {
      if (!avisadoForaHorario.has(numero)) {
        avisadoForaHorario.add(numero);
        await sock.sendMessage(numero, { text: mensagemForaDoHorario(dados.nome) });
        log(`🌙 [${hora}] Fora do horário — aviso enviado a ${fmt}`);
      } else {
        log(`🌙 [${hora}] ${fmt} (fora do horário): "${texto}" — aguardando resposta manual`);
      }
      return;
    }

    avisadoForaHorario.delete(numero);

    try {
      await sock.sendPresenceUpdate("composing", numero);

      const resposta = await processarMensagem(numero, texto);

      // ── Guarda dupla: verifica se humano assumiu durante processamento
      const tsConv = conversasIniciadas.get(numero);
      if (aguardandoHumano.has(numero) || (tsConv && tsConv > Date.now())) {
        await sock.sendPresenceUpdate("paused", numero);
        log(`🚫 [${hora}] Resposta descartada — humano assumiu durante processamento (${fmt})\n`);
        return;
      }

      // FIX #4 (race condition opção 3): redireciona APÓS garantir o envio da mensagem
      // Detecta etapa "status" recém-definida e aciona redirecionamento aqui,
      // depois que a resposta já foi preparada (fora do alcance da guarda dupla acima).
      if (etapaCliente[numero] === "status" && !aguardandoHumano.has(numero)) {
        redirecionarParaHumano(numero);
      }

      const delay = Math.min(Math.max(resposta.length * 25, 1000), 5000);
      await new Promise(r => setTimeout(r, delay));

      await sock.sendMessage(numero, { text: resposta });
      await sock.sendPresenceUpdate("paused", numero);

      log(`✅ [${hora}] LIA respondeu → ${fmt}\n`);
    } catch (err) {
      log(`❌ [ERRO] ${fmt} — ${err.message}`);

      let msgErro;
      if (err.status === 429 || err.message?.includes("quota") || err.message?.includes("rate limit")) {
        msgErro =
          "Estou com muitas solicitações no momento. 😕\n\n" +
          "Por favor, *aguarde 1 minuto* e tente novamente, ou escolha *6️⃣ Falar com atendente*. 🙏";
      } else if (err.message?.includes("network") || err.message?.includes("ECONNREFUSED") || err.message?.includes("fetch")) {
        msgErro =
          "Estou com dificuldades de conexão no momento. 😕\n\n" +
          "Por favor, *tente novamente em instantes* ou escolha *6️⃣ Falar com atendente*. 🙏";
      } else {
        msgErro =
          "Ocorreu um problema inesperado. 😕\n\n" +
          "Por favor, *tente novamente* ou escolha *6️⃣ Falar com atendente* para atendimento imediato. 🙏";
      }

      await sock.sendMessage(numero, { text: msgErro });
    }
  });
}

log("\n🤖 Iniciando LIA — Infohouse Informática...\n");
iniciarBot();