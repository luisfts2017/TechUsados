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
    pagamentos: "PIX",
    whatsapp: "(51) 99999-9999",
    instagram: "@test",
    site: "test.com",
    servicos: "\n• Serviço A",
    politicas: "\n• Política A",
  },
}));

const { menuPrincipal, menuRetorno } = require("../../src/handlers/menuHandler");

describe("menuHandler", () => {
  test("menuPrincipal contém as 6 opções", () => {
    const menu = menuPrincipal("João");
    expect(menu).toContain("João");
    expect(menu).toContain("1️⃣");
    expect(menu).toContain("2️⃣");
    expect(menu).toContain("3️⃣");
    expect(menu).toContain("4️⃣");
    expect(menu).toContain("5️⃣");
    expect(menu).toContain("6️⃣");
  });

  test("menuRetorno contém saudação de retorno", () => {
    const menu = menuRetorno("Maria");
    expect(menu).toContain("Maria");
    expect(menu).toContain("bem-vindo");
  });
});
