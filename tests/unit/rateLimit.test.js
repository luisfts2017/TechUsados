"use strict";

// Mock dependencies
jest.mock("../../src/config", () => ({
  RATE_LIMIT_MAX: 3,
  RATE_LIMIT_SECS: 60,
}));

jest.mock("../../src/services/database", () => ({
  getRateLimit: jest.fn(),
  setRateLimit: jest.fn(),
}));

jest.mock("../../src/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { verificarRateLimit } = require("../../src/middleware/rateLimit");
const { getRateLimit, setRateLimit } = require("../../src/services/database");

describe("verificarRateLimit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("primeira mensagem — não bloqueia", async () => {
    getRateLimit.mockResolvedValue(null);
    const result = await verificarRateLimit("5551999999999@s.whatsapp.net");
    expect(result).toBe(false);
  });

  test("dentro do limite — não bloqueia", async () => {
    getRateLimit.mockResolvedValue({ count: 2, desde: Date.now() - 5000 });
    const result = await verificarRateLimit("5551999999999@s.whatsapp.net");
    expect(result).toBe(false);
  });

  test("acima do limite — bloqueia", async () => {
    getRateLimit.mockResolvedValue({ count: 4, desde: Date.now() - 5000 });
    const result = await verificarRateLimit("5551999999999@s.whatsapp.net");
    expect(result).toBe(true);
  });

  test("entrada expirada — reinicia e não bloqueia", async () => {
    getRateLimit.mockResolvedValue({ count: 10, desde: Date.now() - 70000 });
    const result = await verificarRateLimit("5551999999999@s.whatsapp.net");
    expect(result).toBe(false);
  });
});
