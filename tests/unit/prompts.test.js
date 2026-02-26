"use strict";

jest.mock("../../src/config", () => ({
  EMPRESA: {
    nome: "Infohouse Informática",
    cidade: "Igrejinha/RS",
    horarios: "Seg-Sex 08-18",
    endereco: "Rua Teste, 1",
    maps: "http://maps",
    waze: "http://waze",
    pix: "CNPJ teste",
    pagamentos: "PIX, Cartão",
    whatsapp: "(51) 99999-9999",
    instagram: "@test",
    site: "test.com",
    servicos: "\n• Serviço A",
    politicas: "\n• Política A",
  },
}));

const { getPrompt } = require("../../src/prompts");

describe("getPrompt", () => {
  test("retorna prompt para contexto geral", () => {
    const p = getPrompt("geral");
    expect(p).toContain("LIA");
    expect(p).toContain("Infohouse Informática");
  });

  test("prompt geral contém regra off-topic completa", () => {
    const p = getPrompt("geral");
    expect(p).toContain("atendente virtual da Infohouse Informática");
    expect(p).toContain("Redirecione a conversa");
  });

  test("retorna prompt para contexto orcamento", () => {
    const p = getPrompt("orcamento");
    expect(p).toContain("orçamento");
  });

  test("retorna prompt para contexto problema", () => {
    const p = getPrompt("problema");
    expect(p).toContain("problema técnico");
  });

  test("retorna prompt para contexto status", () => {
    const p = getPrompt("status");
    expect(p).toContain("status");
  });

  test("retorna prompt para contexto agendamento", () => {
    const p = getPrompt("agendamento");
    expect(p).toContain("agend");
  });

  test("contexto desconhecido retorna geral", () => {
    const p = getPrompt("invalido");
    expect(p).toContain("LIA");
  });
});
