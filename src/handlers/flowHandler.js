"use strict";

const { chamarGPT } = require("../services/openai");
const { setEtapa, setDadosCliente, getDadosCliente, setHistorico, clearHistorico } = require("../services/database");
const { menuPrincipal, menuRetorno } = require("./menuHandler");
const { extrairNome } = require("../services/openai");
const { logger } = require("../utils/logger");

async function processarFluxo(numero, texto, etapa, dados) {
  const textoN = texto.trim().slice(0, 2000);
  const textoL = textoN.toLowerCase();

  // ── Palavra-chave: voltar ao menu
  if (["menu", "inicio", "início", "voltar", "0"].includes(textoL) && etapa !== "novo") {
    setEtapa(numero, "menu");
    clearHistorico(numero);
    return menuPrincipal(dados.nome || "");
  }

  // ── NOVO CLIENTE ou CLIENTE RETORNANDO
  if (etapa === "novo") {
    if (dados.nome) {
      setEtapa(numero, "menu");
      clearHistorico(numero);
      logger.info("Cliente antigo retornou", { numero, nome: dados.nome });
      return menuRetorno(dados.nome);
    } else {
      setEtapa(numero, "coletando_nome");
      setDadosCliente(numero, { ...dados, primeiraMensagem: textoN, ultimaInteracao: Date.now() });
      clearHistorico(numero);
      return (
        `Olá! Seja bem-vindo(a) à *Infohouse Informática*. 👋\n\n` +
        `Sou a *LIA*, sua Atendente Virtual, e estou aqui para ajudá-lo(a)!\n\n` +
        `Para iniciar o atendimento, poderia me informar o seu *nome*, por favor?`
      );
    }
  }

  // ── COLETA NOME
  if (etapa === "coletando_nome") {
    let nomeExtraido = await extrairNome(textoN);

    if (!nomeExtraido || nomeExtraido === "NAO_IDENTIFICADO" || nomeExtraido.length < 2) {
      return (
        `Desculpe, não consegui identificar seu nome. 😊\n\n` +
        `Poderia me informar apenas o seu *nome*? _(ex: João, Maria Silva)_`
      );
    }

    const nome = nomeExtraido.split(" ").slice(0, 2).join(" ");
    const primeiraMensagem = dados.primeiraMensagem || null;

    setDadosCliente(numero, { ...dados, nome, primeiraMensagem: undefined, ultimaInteracao: Date.now() });
    setEtapa(numero, "menu");
    logger.info("Novo cliente registrado", { numero, nome });

    if (primeiraMensagem) {
      clearHistorico(numero);
      const respostaContexto = await chamarGPT(numero, `Meu nome é ${nome}. ${primeiraMensagem}`, "geral");
      return (
        `Olá, *${nome}*! Seja bem-vindo(a) à *Infohouse Informática*! 😊\n\n` +
        respostaContexto
      );
    }

    return menuPrincipal(nome);
  }

  // ── MENU PRINCIPAL
  if (etapa === "menu") {
    return await processarMenu(numero, textoN, textoL, dados);
  }

  // ── FLUXOS GPT
  const mapaContexto = {
    orcamento: "orcamento",
    problema: "problema",
    status: "status",
    agendamento: "agendamento",
    atendendo: "geral",
  };

  const contexto = mapaContexto[etapa] || "geral";

  if (["orcamento", "problema"].includes(etapa) && !dados.equipamento) {
    setDadosCliente(numero, { ...dados, equipamento: textoN.slice(0, 80), ultimaInteracao: Date.now() });
  }

  const resposta = await chamarGPT(numero, textoN, contexto);

  if (["orcamento", "agendamento", "problema", "atendendo"].includes(etapa)) {
    setEtapa(numero, "menu");
  }

  return resposta;
}

async function processarMenu(numero, textoN, textoL, dados) {
  const { chamarGPT } = require("../services/openai");
  const opcao = textoN.trim().replace(/[^1-6]/g, "").slice(0, 1);

  if (opcao === "1") {
    setEtapa(numero, "orcamento");
    return (
      `*Solicitação de Orçamento* 💻\n\n` +
      `Com prazer! Para agilizar seu atendimento, por favor me informe:\n\n` +
      `🔹 *Equipamento:* _(ex: notebook Dell, desktop, impressora...)_\n` +
      `🔹 *Problema ou serviço desejado:* _(descreva com o máximo de detalhes)_`
    );
  }

  if (opcao === "2") {
    setEtapa(numero, "problema");
    return (
      `*Suporte Técnico* 🔧\n\n` +
      `Lamento que esteja com dificuldades! Vou ajudá-lo(a).\n\n` +
      `Para que possamos entender melhor, por favor descreva:\n\n` +
      `🔹 *Qual equipamento* apresenta o problema?\n` +
      `🔹 *O que está acontecendo* exatamente? Quando começou?`
    );
  }

  if (opcao === "3") {
    setEtapa(numero, "status");
    return (
      `*Status do Equipamento* 🔍\n\n` +
      `Para verificar o andamento do seu equipamento, precisarei acionar ` +
      `um de nossos atendentes que consultará diretamente no sistema.\n\n` +
      `⏳ Por favor, *aguarde um momento*. Em breve retornaremos! 🙏\n\n` +
      `_Você receberá uma confirmação assim que um atendente estiver disponível._`
    );
  }

  if (opcao === "4") {
    setEtapa(numero, "agendamento");
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
    setEtapa(numero, "atendendo");
    const { respostaOpcao5 } = require("./menuHandler");
    return respostaOpcao5();
  }

  if (opcao === "6") {
    return { tipo: "redirecionar_humano" };
  }

  if (!opcao) {
    const somenteDigitos = /^\d+$/.test(textoN.trim());
    if (somenteDigitos) {
      const { menuPrincipal } = require("./menuHandler");
      return menuPrincipal(dados.nome || "") + `\n\n_Por favor, escolha uma opção de *1 a 6*._`;
    }
    return await chamarGPT(numero, textoN, "geral");
  }

  return await chamarGPT(numero, textoN, "geral");
}

module.exports = { processarFluxo };
