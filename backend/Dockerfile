# ── Build stage ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Instala dependências
COPY package.json ./
RUN npm install

# Copia código-fonte e schema Prisma
COPY prisma ./prisma
COPY src    ./src

# Gera o Prisma Client
RUN npx prisma generate

# ── Runtime stage ──────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Apenas dependências de produção
COPY package.json ./
RUN npm install --omit=dev

# Copia build + prisma client gerado
COPY --from=builder /app/node_modules/.prisma  ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma  ./node_modules/@prisma
COPY prisma ./prisma
COPY src    ./src

# Porta exposta
EXPOSE 3333

# Health-check nativo do Docker
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3333/health || exit 1

CMD ["node", "src/server.js"]
