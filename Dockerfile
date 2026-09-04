# Paybox Telegram Bot — production image
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S paybox && adduser -S paybox -G paybox

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./

# Address book + stats live here; mount a volume to persist them.
RUN mkdir -p /app/data && chown -R paybox:paybox /app

USER paybox
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null 2>&1 || exit 1

CMD ["node", "src/index.js"]
