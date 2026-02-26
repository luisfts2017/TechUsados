"use strict";

const path = require("path");
const fs = require("fs");
const { SQLITE_PATH, REDIS_URL } = require("../config");
const { logger } = require("../utils/logger");

let db = null;
let redis = null;
let redisAvailable = false;

// ── SQLite setup ─────────────────────────────────────────────────────────────

function initSQLite() {
  const dbPath = path.resolve(process.cwd(), SQLITE_PATH);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  try {
    const Database = require("better-sqlite3");
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    db.exec(`
      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT UNIQUE NOT NULL,
        nome TEXT,
        telefone TEXT,
        equipamento TEXT,
        primeira_mensagem TEXT,
        ultima_interacao INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      );

      CREATE TABLE IF NOT EXISTS sessoes (
        numero TEXT PRIMARY KEY,
        etapa TEXT NOT NULL DEFAULT 'novo',
        dados_json TEXT DEFAULT '{}',
        expires_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS historico_conversas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        contexto TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      );

      CREATE TABLE IF NOT EXISTS logs_atendimento (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT NOT NULL,
        tipo TEXT NOT NULL,
        detalhes TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      );

      CREATE INDEX IF NOT EXISTS idx_clientes_numero ON clientes(numero);
      CREATE INDEX IF NOT EXISTS idx_sessoes_numero ON sessoes(numero);
      CREATE INDEX IF NOT EXISTS idx_historico_numero ON historico_conversas(numero);
      CREATE INDEX IF NOT EXISTS idx_logs_numero ON logs_atendimento(numero);
    `);

    logger.info("SQLite inicializado", { path: dbPath });
    return true;
  } catch (e) {
    logger.error("Erro ao inicializar SQLite", { error: e.message });
    return false;
  }
}

// ── Redis setup ───────────────────────────────────────────────────────────────

async function initRedis() {
  if (!REDIS_URL) return false;
  try {
    const Redis = require("ioredis");
    redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
    await redis.connect();
    await redis.ping();
    redisAvailable = true;
    logger.info("Redis conectado", { url: REDIS_URL });
    return true;
  } catch (e) {
    logger.warn("Redis indisponível — usando SQLite como fallback", { error: e.message });
    redis = null;
    redisAvailable = false;
    return false;
  }
}

async function initDatabase() {
  initSQLite();
  await initRedis();
}

// ── Sessões ───────────────────────────────────────────────────────────────────

function getEtapa(numero) {
  if (!db) return "novo";
  const row = db.prepare("SELECT etapa FROM sessoes WHERE numero = ?").get(numero);
  return row ? row.etapa : "novo";
}

function setEtapa(numero, etapa) {
  if (!db) return;
  db.prepare(`
    INSERT INTO sessoes (numero, etapa) VALUES (?, ?)
    ON CONFLICT(numero) DO UPDATE SET etapa = excluded.etapa
  `).run(numero, etapa);
}

function getDadosCliente(numero) {
  if (!db) return {};
  const row = db.prepare("SELECT * FROM clientes WHERE numero = ?").get(numero);
  if (!row) return {};
  const sessao = db.prepare("SELECT dados_json FROM sessoes WHERE numero = ?").get(numero);
  const extras = sessao && sessao.dados_json ? JSON.parse(sessao.dados_json) : {};
  return { nome: row.nome, telefone: row.telefone, equipamento: row.equipamento, ultimaInteracao: row.ultima_interacao, ...extras };
}

function setDadosCliente(numero, dados) {
  if (!db) return;
  db.prepare(`
    INSERT INTO clientes (numero, nome, telefone, equipamento, primeira_mensagem, ultima_interacao)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(numero) DO UPDATE SET
      nome = COALESCE(excluded.nome, nome),
      telefone = COALESCE(excluded.telefone, telefone),
      equipamento = COALESCE(excluded.equipamento, equipamento),
      primeira_mensagem = COALESCE(excluded.primeira_mensagem, primeira_mensagem),
      ultima_interacao = excluded.ultima_interacao
  `).run(numero, dados.nome || null, dados.telefone || null, dados.equipamento || null, dados.primeiraMensagem || null, dados.ultimaInteracao || Date.now());

  // Store extras in sessoes.dados_json
  const extras = {};
  if (dados.primeiraMensagem !== undefined) extras.primeiraMensagem = dados.primeiraMensagem;
  if (Object.keys(extras).length > 0) {
    db.prepare(`
      INSERT INTO sessoes (numero, etapa, dados_json) VALUES (?, 'novo', ?)
      ON CONFLICT(numero) DO UPDATE SET dados_json = excluded.dados_json
    `).run(numero, JSON.stringify(extras));
  }
}

// ── Aguardando Humano (Redis ou SQLite) ───────────────────────────────────────

const KEY_AGUARDANDO = "lia:aguardando:";
const KEY_CONVERSAS = "lia:conversas:";
const KEY_AVISOSMID = "lia:avisadomidia:";
const KEY_AVISOSHOR = "lia:avisadohorario:";
const KEY_RATELIMIT = "lia:ratelimit:";

// In-memory fallback
const _inMemAguardando = new Map();
const _inMemConversas = new Map();
const _inMemAvisadoMidia = new Set();
const _inMemAvisadoHorario = new Set();
const _inMemRateLimit = new Map();

async function setAguardandoHumano(numero, expiresAt) {
  const ttl = Math.ceil((expiresAt - Date.now()) / 1000);
  if (redisAvailable && redis) {
    await redis.set(KEY_AGUARDANDO + numero, expiresAt.toString(), "EX", ttl);
  } else {
    _inMemAguardando.set(numero, expiresAt);
    // persist in SQLite sessoes expires_at
    if (db) {
      db.prepare(`
        INSERT INTO sessoes (numero, etapa, expires_at) VALUES (?, 'aguardando_humano', ?)
        ON CONFLICT(numero) DO UPDATE SET etapa = 'aguardando_humano', expires_at = excluded.expires_at
      `).run(numero, expiresAt);
    }
  }
}

async function getAguardandoHumano(numero) {
  if (redisAvailable && redis) {
    const val = await redis.get(KEY_AGUARDANDO + numero);
    return val ? parseInt(val, 10) : null;
  }
  const ts = _inMemAguardando.get(numero);
  if (ts && ts > Date.now()) return ts;
  if (ts) _inMemAguardando.delete(numero);
  return null;
}

async function hasAguardandoHumano(numero) {
  const val = await getAguardandoHumano(numero);
  return val !== null && val > Date.now();
}

async function deleteAguardandoHumano(numero) {
  if (redisAvailable && redis) {
    await redis.del(KEY_AGUARDANDO + numero);
  } else {
    _inMemAguardando.delete(numero);
    if (db) {
      const row = db.prepare("SELECT etapa FROM sessoes WHERE numero = ?").get(numero);
      if (row && row.etapa === "aguardando_humano") {
        db.prepare("UPDATE sessoes SET etapa = 'menu', expires_at = NULL WHERE numero = ?").run(numero);
      }
    }
  }
}

async function getAllAguardandoHumano() {
  if (redisAvailable && redis) {
    const keys = await redis.keys(KEY_AGUARDANDO + "*");
    const result = new Map();
    for (const key of keys) {
      const val = await redis.get(key);
      if (val) {
        const numero = key.replace(KEY_AGUARDANDO, "");
        const ts = parseInt(val, 10);
        if (ts > Date.now()) result.set(numero, ts);
      }
    }
    return result;
  }
  const result = new Map();
  for (const [n, ts] of _inMemAguardando) {
    if (ts > Date.now()) result.set(n, ts);
  }
  return result;
}

async function setConversaIniciada(numero, expiresAt) {
  const ttl = Math.ceil((expiresAt - Date.now()) / 1000);
  if (redisAvailable && redis) {
    await redis.set(KEY_CONVERSAS + numero, expiresAt.toString(), "EX", ttl);
  } else {
    _inMemConversas.set(numero, expiresAt);
  }
}

async function getConversaIniciada(numero) {
  if (redisAvailable && redis) {
    const val = await redis.get(KEY_CONVERSAS + numero);
    return val ? parseInt(val, 10) : null;
  }
  const ts = _inMemConversas.get(numero);
  if (ts && ts > Date.now()) return ts;
  if (ts) _inMemConversas.delete(numero);
  return null;
}

async function deleteConversaIniciada(numero) {
  if (redisAvailable && redis) {
    await redis.del(KEY_CONVERSAS + numero);
  } else {
    _inMemConversas.delete(numero);
  }
}

async function setAvisadoMidia(numero) {
  if (redisAvailable && redis) {
    await redis.set(KEY_AVISOSMID + numero, "1", "EX", 3600);
  } else {
    _inMemAvisadoMidia.add(numero);
  }
}

async function hasAvisadoMidia(numero) {
  if (redisAvailable && redis) {
    return (await redis.exists(KEY_AVISOSMID + numero)) === 1;
  }
  return _inMemAvisadoMidia.has(numero);
}

async function deleteAvisadoMidia(numero) {
  if (redisAvailable && redis) {
    await redis.del(KEY_AVISOSMID + numero);
  } else {
    _inMemAvisadoMidia.delete(numero);
  }
}

async function setAvisadoForaHorario(numero) {
  if (redisAvailable && redis) {
    await redis.set(KEY_AVISOSHOR + numero, "1", "EX", 86400);
  } else {
    _inMemAvisadoHorario.add(numero);
  }
}

async function hasAvisadoForaHorario(numero) {
  if (redisAvailable && redis) {
    return (await redis.exists(KEY_AVISOSHOR + numero)) === 1;
  }
  return _inMemAvisadoHorario.has(numero);
}

async function deleteAvisadoForaHorario(numero) {
  if (redisAvailable && redis) {
    await redis.del(KEY_AVISOSHOR + numero);
  } else {
    _inMemAvisadoHorario.delete(numero);
  }
}

async function clearAvisadosForaHorario() {
  if (redisAvailable && redis) {
    const keys = await redis.keys(KEY_AVISOSHOR + "*");
    if (keys.length > 0) await redis.del(...keys);
  } else {
    _inMemAvisadoHorario.clear();
  }
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

async function getRateLimit(numero) {
  if (redisAvailable && redis) {
    const val = await redis.get(KEY_RATELIMIT + numero);
    return val ? JSON.parse(val) : null;
  }
  return _inMemRateLimit.get(numero) || null;
}

async function setRateLimit(numero, entry, ttlSecs) {
  if (redisAvailable && redis) {
    await redis.set(KEY_RATELIMIT + numero, JSON.stringify(entry), "EX", ttlSecs);
  } else {
    _inMemRateLimit.set(numero, entry);
  }
}

// ── Histórico GPT ─────────────────────────────────────────────────────────────

const _inMemHistorico = {};

function getHistorico(numero) {
  return _inMemHistorico[numero] || [];
}

function setHistorico(numero, msgs) {
  _inMemHistorico[numero] = msgs;
}

function appendHistorico(numero, msg) {
  if (!_inMemHistorico[numero]) _inMemHistorico[numero] = [];
  _inMemHistorico[numero].push(msg);
  if (_inMemHistorico[numero].length > 10) {
    _inMemHistorico[numero] = _inMemHistorico[numero].slice(-10);
  }
}

function clearHistorico(numero) {
  delete _inMemHistorico[numero];
}

// ── Limpeza ───────────────────────────────────────────────────────────────────

function limparDadosInativos(diasInatividade = 90) {
  if (!db) return 0;
  const limite = Date.now() - diasInatividade * 24 * 60 * 60 * 1000;
  const result = db.prepare("DELETE FROM clientes WHERE ultima_interacao > 0 AND ultima_interacao < ?").run(limite);
  return result.changes;
}

function getStatus() {
  const sqliteOk = !!db;
  let clientesAtivos = 0;
  if (db) {
    const row = db.prepare("SELECT COUNT(*) as cnt FROM clientes WHERE ultima_interacao > ?").get(Date.now() - 86400000);
    clientesAtivos = row ? row.cnt : 0;
  }
  return { sqliteOk, redisAvailable, clientesAtivos };
}

module.exports = {
  initDatabase,
  getEtapa, setEtapa,
  getDadosCliente, setDadosCliente,
  setAguardandoHumano, getAguardandoHumano, hasAguardandoHumano, deleteAguardandoHumano, getAllAguardandoHumano,
  setConversaIniciada, getConversaIniciada, deleteConversaIniciada,
  setAvisadoMidia, hasAvisadoMidia, deleteAvisadoMidia,
  setAvisadoForaHorario, hasAvisadoForaHorario, deleteAvisadoForaHorario, clearAvisadosForaHorario,
  getRateLimit, setRateLimit,
  getHistorico, setHistorico, appendHistorico, clearHistorico,
  limparDadosInativos,
  getStatus,
};
