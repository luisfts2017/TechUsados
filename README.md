# LIA — Atendente Virtual | Infohouse Informática

Bot WhatsApp profissional da Infohouse Informática, desenvolvido com Baileys + OpenAI GPT-4o-mini.

## Tecnologias

- **Node.js 20+**
- **@whiskeysockets/baileys** — conexão WhatsApp
- **OpenAI GPT-4o-mini** — respostas inteligentes
- **SQLite (better-sqlite3)** — persistência
- **Redis (ioredis)** — cache e sessões (opcional)
- **p-queue** — fila de mensagens
- **Express** — health check
- **Winston/Logger** — logs estruturados JSON
- **Jest** — testes automatizados

## Requisitos

- Node.js >= 18
- OpenAI API Key
- Redis (opcional, recomendado para produção)

## Instalação

```bash
git clone <repo>
cd TechUsados
npm install
cp .env.example .env
# Edite .env com sua OPENAI_API_KEY
```

## Configuração

Copie `.env.example` para `.env` e configure:

| Variável | Padrão | Descrição |
|---|---|---|
| `OPENAI_API_KEY` | — | Chave da API OpenAI (obrigatória) |
| `MINUTOS_COM_HUMANO` | 60 | Minutos antes da LIA retomar após humano |
| `REDIS_URL` | — | URL do Redis (opcional) |
| `HEALTH_PORT` | 3001 | Porta do health check |
| `LOG_FORMAT` | pretty | `json` ou `pretty` |
| `LOG_LEVEL` | info | `debug`, `info`, `warn`, `error` |

## Comandos

```bash
# Desenvolvimento
npm start

# Testes
npm test
npm run test:coverage

# Lint
npm run lint
```

## Docker

```bash
# Subir com Redis
docker-compose up -d

# Ver logs
docker-compose logs -f bot
```

## Estrutura de Pastas

```
src/
  app.js                  → Ponto de entrada
  config/                 → Configurações
  handlers/               → Handlers de mensagens
  middleware/             → Rate limit, horário
  monitoring/             → Health check, métricas
  prompts/                → Prompts GPT
  queue/                  → Fila de processamento
  services/               → OpenAI, Database, WhatsApp
  utils/                  → Logger, Helpers
tests/
  unit/                   → Testes unitários
```

## Comandos Admin (WhatsApp)

Envie do seu próprio número:

- `#lista` — lista clientes aguardando atendimento humano
- `#liberar <número>` — libera cliente para a LIA retomar

## Monitoramento

- `GET http://localhost:3001/health` — status do bot
- `GET http://localhost:3001/metrics` — métricas
