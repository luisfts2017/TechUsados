"use strict";

const { OpenAI } = require("openai");
const { OPENAI_API_KEY, GPT_MODEL, GPT_MAX_TOKENS, GPT_TEMPERATURE, GPT_TIMEOUT_MS } = require("../config");
const { getPrompt } = require("../prompts");
const { appendHistorico, getHistorico } = require("./database");
const { logger } = require("../utils/logger");

let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return openaiClient;
}

async function chamarGPT(numero, texto, contexto = "geral") {
  appendHistorico(numero, { role: "user", content: texto });
  const historico = getHistorico(numero);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GPT_TIMEOUT_MS);

  let resposta;
  const start = Date.now();

  try {
    const res = await getOpenAIClient().chat.completions.create(
      {
        model: GPT_MODEL,
        messages: [
          { role: "system", content: getPrompt(contexto) },
          ...historico,
        ],
        max_tokens: GPT_MAX_TOKENS,
        temperature: GPT_TEMPERATURE,
      },
      { signal: controller.signal }
    );
    resposta = res.choices[0].message.content;
    const duration = Date.now() - start;
    logger.debug("GPT respondeu", { numero, contexto, duration });
  } catch (e) {
    if (e.name === "AbortError" || e.code === "ERR_ABORTED") {
      logger.warn("GPT timeout", { numero, contexto });
      // Remove the user message we just appended
      const h = getHistorico(numero);
      h.pop();
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

  appendHistorico(numero, { role: "assistant", content: resposta });
  return resposta;
}

async function extrairNome(texto) {
  const prompt = `O cliente respondeu: "${texto}"
Extraia APENAS o primeiro nome ou nome completo da pessoa.
Regras:
- Se for claramente um nome (ex: "João", "Maria Silva", "me chamo Pedro"), retorne só o nome.
- Se misturou nome com outras informações (ex: "Carlos, tenho um notebook"), retorne só "Carlos".
- Se NÃO contiver nome de pessoa (ex: "Ela é um acer", "notebook Dell", "oi", números), retorne: NAO_IDENTIFICADO
Retorne APENAS o nome ou NAO_IDENTIFICADO, sem mais nenhum texto.`;

  try {
    const res = await getOpenAIClient().chat.completions.create({
      model: GPT_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 20,
      temperature: 0,
    });
    return res.choices[0].message.content.trim();
  } catch (e) {
    logger.warn("Erro ao extrair nome", { error: e.message });
    return texto.split(" ").slice(0, 2).join(" ");
  }
}

async function checkOpenAI() {
  try {
    await getOpenAIClient().models.list();
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { chamarGPT, extrairNome, checkOpenAI };
