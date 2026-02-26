"use strict";

jest.mock("../../src/config", () => ({
  HORARIO: { abertura: 8, fechamento: 18, diasUteis: [1, 2, 3, 4, 5] },
  PAUSAR_FORA_DO_HORARIO: true,
}));

const { formatarNumero, sleep } = require("../../src/utils/helpers");

describe("helpers", () => {
  test("formatarNumero remove sufixo WhatsApp", () => {
    expect(formatarNumero("5551999999999@s.whatsapp.net")).toBe("5551999999999");
  });

  test("formatarNumero sem sufixo retorna original", () => {
    expect(formatarNumero("5551999999999")).toBe("5551999999999");
  });

  test("sleep aguarda o tempo especificado", async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });
});
