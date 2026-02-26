# ── Stage 1: build ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: production ─────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install sqlite3 native dependencies
RUN apk add --no-cache python3 make g++

# Create non-root user
RUN addgroup -S lia && adduser -S lia -G lia

COPY --from=builder /app/node_modules ./node_modules
COPY src ./src
COPY package*.json ./

# Create necessary directories
RUN mkdir -p data logs sessao_whatsapp && chown -R lia:lia /app

USER lia

ENV NODE_ENV=production
ENV LOG_FORMAT=json
ENV LOG_LEVEL=info

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "src/app.js"]
