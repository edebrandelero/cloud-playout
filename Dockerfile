# --- Dependências e build ---
FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY public ./public

RUN npm run build

# --- Produção ---
FROM node:22-alpine AS production

RUN apk add --no-cache ffmpeg python3 make g++

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/app/data/cloud-playout.db \
    MEDIA_ROOT=/app/media \
    HLS_OUTPUT_DIR=/app/output/hls

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm rebuild better-sqlite3 && npm cache clean --force

RUN apk del python3 make g++

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public

RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app \
    && mkdir -p /app/data /app/media /app/output/hls \
    && chown -R app:app /app

USER app

EXPOSE 3000

VOLUME ["/app/data", "/app/media", "/app/output"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
