"use strict";

jest.mock("../../src/services/database", () => ({
  hasAguardandoHumano: jest.fn(),
  deleteAguardandoHumano: jest.fn(),
  deleteConversaIniciada: jest.fn(),
  setEtapa: jest.fn(),
  clearHistorico: jest.fn(),
  deleteAvisadoMidia: jest.fn(),
  getAllAguardandoHumano: jest.fn(),
  getDadosCliente: jest.fn(),
}));

jest.mock("../../src/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { processarComandoAdmin } = require("../../src/handlers/adminHandler");
const db = require("../../src/services/database");

const mockSock = { sendMessage: jest.fn().mockResolvedValue(undefined) };

describe("processarComandoAdmin", () => {
  beforeEach(() => jest.clearAllMocks());

  test("mensagem de cliente (não fromMe) → retorna false", async () => {
    const msg = { key: { fromMe: false, remoteJid: "5551@s.whatsapp.net" } };
    const result = await processarComandoAdmin(mockSock, msg, "oi");
    expect(result).toBe(false);
  });

  test("#liberar sem número → aviso de uso", async () => {
    const msg = { key: { fromMe: true, remoteJid: "5551@s.whatsapp.net" } };
    const result = await processarComandoAdmin(mockSock, msg, "#liberar");
    expect(result).toBe(true);
    expect(mockSock.sendMessage).toHaveBeenCalledWith(
      "5551@s.whatsapp.net",
      expect.objectContaining({ text: expect.stringContaining("#liberar") })
    );
  });

  test("#liberar com número ativo → libera cliente", async () => {
    db.hasAguardandoHumano.mockResolvedValue(true);
    db.getDadosCliente.mockReturnValue({ nome: "João" });
    const msg = { key: { fromMe: true, remoteJid: "5551@s.whatsapp.net" } };
    const result = await processarComandoAdmin(mockSock, msg, "#liberar 5552999999999");
    expect(result).toBe(true);
    expect(db.deleteAguardandoHumano).toHaveBeenCalled();
    expect(db.clearHistorico).toHaveBeenCalled();
  });

  test("#liberar com número inativo → mensagem informativa", async () => {
    db.hasAguardandoHumano.mockResolvedValue(false);
    const msg = { key: { fromMe: true, remoteJid: "5551@s.whatsapp.net" } };
    const result = await processarComandoAdmin(mockSock, msg, "#liberar 5552000000000");
    expect(result).toBe(true);
    expect(mockSock.sendMessage).toHaveBeenCalledWith(
      "5551@s.whatsapp.net",
      expect.objectContaining({ text: expect.stringContaining("não está com atendimento") })
    );
  });

  test("#lista vazia → mensagem de nenhum cliente", async () => {
    db.getAllAguardandoHumano.mockResolvedValue(new Map());
    const msg = { key: { fromMe: true, remoteJid: "5551@s.whatsapp.net" } };
    const result = await processarComandoAdmin(mockSock, msg, "#lista");
    expect(result).toBe(true);
    expect(mockSock.sendMessage).toHaveBeenCalledWith(
      "5551@s.whatsapp.net",
      expect.objectContaining({ text: expect.stringContaining("Nenhum") })
    );
  });

  test("#lista com clientes → lista formatada", async () => {
    const m = new Map([["5552@s.whatsapp.net", Date.now() + 3600000]]);
    db.getAllAguardandoHumano.mockResolvedValue(m);
    db.getDadosCliente.mockReturnValue({ nome: "Maria" });
    const msg = { key: { fromMe: true, remoteJid: "5551@s.whatsapp.net" } };
    const result = await processarComandoAdmin(mockSock, msg, "#lista");
    expect(result).toBe(true);
    expect(mockSock.sendMessage).toHaveBeenCalledWith(
      "5551@s.whatsapp.net",
      expect.objectContaining({ text: expect.stringContaining("Maria") })
    );
  });
});
