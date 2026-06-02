# cloud-playout

Sistema de playout de mídia na nuvem — transmissão programada de vídeo e áudio.

## Requisitos

- Node.js 20+
- npm
- [FFmpeg](https://ffmpeg.org/) no PATH (para playout real)

## Instalação

```bash
npm install
cp .env.example .env
```

## Desenvolvimento

```bash
npm run dev
```

Servidor em `http://localhost:3000`. Health check: `GET /health`.

## API REST

Dados persistidos em **SQLite** (`DATABASE_PATH`). Canais, assets e playlists sobrevivem a reinícios do servidor. O estado de playout (playing/paused) continua em memória durante a execução.

### Canais

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/channels` | Lista canais |
| GET | `/channels/:id` | Detalhe do canal |
| POST | `/channels` | Cria canal |
| PUT | `/channels/:id` | Atualiza canal |
| DELETE | `/channels/:id` | Remove canal |
| GET | `/channels/:channelId/playlists` | Playlists do canal |

### Assets

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/assets` | Lista assets |
| GET | `/assets/:id` | Detalhe do asset |
| POST | `/assets` | Cria asset |
| PUT | `/assets/:id` | Atualiza asset |
| DELETE | `/assets/:id` | Remove asset |

### Playlists

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/playlists` | Lista playlists |
| GET | `/playlists/:id` | Detalhe da playlist |
| POST | `/playlists` | Cria playlist |
| PUT | `/playlists/:id` | Atualiza playlist |
| DELETE | `/playlists/:id` | Remove playlist |
| POST | `/playlists/:id/items` | Adiciona asset à playlist |
| DELETE | `/playlists/:id/items/:assetId` | Remove asset da playlist |

### Scheduler (playout)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/channels/:channelId/playout` | Status do playout |
| POST | `/channels/:channelId/playout/start` | Inicia playlist `{ "playlistId": "..." }` |
| POST | `/channels/:channelId/playout/pause` | Pausa reprodução |
| POST | `/channels/:channelId/playout/resume` | Retoma reprodução |
| POST | `/channels/:channelId/playout/stop` | Para playout |
| POST | `/channels/:channelId/playout/skip` | Pula para o próximo item |

Estados: `idle`, `playing`, `paused`, `stopped`. O status inclui `engineMode` (`ffmpeg` ou `simulation`) e `outputTarget` (URL RTMP ou playlist HLS).

### Engine FFmpeg

Com `PLAYOUT_ENGINE=ffmpeg` (padrão), o scheduler dispara FFmpeg para cada item da fila.

| Saída | Configuração |
|-------|--------------|
| **HLS local** | Deixe `outputUrl` vazio no canal — playlist em `/channels/{id}/hls/stream.m3u8` |
| **RTMP** | Defina `outputUrl` como `rtmp://servidor/live/chave` no canal |

Variáveis de ambiente (ver `.env.example`):

| Variável | Descrição |
|----------|-----------|
| `PLAYOUT_ENGINE` | `ffmpeg` ou `simulation` |
| `MEDIA_ROOT` | Pasta base dos arquivos de mídia |
| `HLS_OUTPUT_DIR` | Pasta de saída HLS |
| `FFMPEG_PATH` | Caminho do binário ffmpeg |

Coloque os vídeos em `media/` e referencie no asset com path relativo (ex.: `intro.mp4`). A duração é detectada via `ffprobe` ao criar o asset.

Modo `simulation` usa timers sem FFmpeg (útil para desenvolvimento sem arquivos de mídia).

### HLS

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/channels/:channelId/hls/:file` | Serve `stream.m3u8` e segmentos `.ts` |

### Exemplo com playout HLS

```bash
# Criar canal (HLS local)
curl -X POST http://localhost:3000/channels -H "Content-Type: application/json" -d "{\"name\":\"Canal 1\"}"

# Asset apontando para media/intro.mp4
curl -X POST http://localhost:3000/assets -H "Content-Type: application/json" -d "{\"name\":\"Intro\",\"path\":\"intro.mp4\",\"type\":\"video\"}"

# Iniciar playout e assistir em VLC/browser:
# http://localhost:3000/channels/{channelId}/hls/stream.m3u8
```

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor com hot reload |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm start` | Executa build de produção |
| `npm run typecheck` | Verifica tipos sem compilar |

## Próximas etapas (roadmap)

1. ~~**API REST** — CRUD de canais, playlists e assets~~
2. ~~**Scheduler** — agendamento e fila de reprodução~~
3. ~~**Engine de playout** — integração com FFmpeg para saída RTMP/HLS~~
4. ~~**Storage** — upload e gestão de mídia (S3 ou local)~~
5. ~~**Painel web** — interface para operação do playout~~
6. ~~**Persistência** — SQLite para canais, assets e playlists~~
7. ~~**Deploy** — Docker, variáveis de ambiente e CI/CD~~

Acesse o painel em **http://localhost:3000/panel/** (rota pública; a API continua protegida por API key).

## Docker

### Requisitos

- [Docker](https://www.docker.com/) e Docker Compose v2

### Subir em produção

```bash
cp .env.example .env
# Defina API_KEY com valor forte antes de subir

docker compose up --build -d
docker compose logs -f
```

| URL | Descrição |
|-----|-----------|
| http://localhost:3000/panel/ | Painel web |
| http://localhost:3000/health | Health check |

### Volumes

| Volume | Caminho no container | Conteúdo |
|--------|-------------------|----------|
| `playout-data` | `/app/data` | Banco SQLite |
| `playout-media` | `/app/media` | Arquivos de mídia |
| `playout-output` | `/app/output` | Segmentos HLS |

### Variáveis no container

O `docker-compose.yml` define paths absolutos para volumes. Sobrescreva no `.env`:

| Variável | Valor no Docker |
|----------|-----------------|
| `API_KEY` | **Obrigatório** em produção |
| `NODE_ENV` | `production` |
| `DATABASE_PATH` | `/app/data/cloud-playout.db` |
| `MEDIA_ROOT` | `/app/media` |
| `HLS_OUTPUT_DIR` | `/app/output/hls` |

### Comandos úteis

```bash
docker compose down          # Para o serviço
docker compose down -v       # Para e remove volumes (apaga dados)
docker compose ps
docker compose exec playout sh
```

### CI

GitHub Actions (`.github/workflows/ci.yml`) executa `typecheck`, `build` e `docker build` em cada push/PR na branch `main`.

### Banco de dados

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `DATABASE_PATH` | `./data/cloud-playout.db` | Arquivo SQLite |

A pasta `data/` é criada automaticamente na primeira execução.

## Segurança

Proteções incluídas desde o storage:

| Camada | Proteção |
|--------|----------|
| **Autenticação** | API key via `Authorization: Bearer` ou `X-API-Key` |
| **Rate limiting** | 100 req/min global; 10 uploads/min por IP |
| **Headers** | Helmet (XSS, clickjacking, etc.) |
| **Upload** | Limite de tamanho, extensões permitidas, validação magic bytes |
| **Paths** | Bloqueio de path traversal (`..`, `/`, `\`) |
| **Input** | Validação de UUIDs, URLs RTMP, tamanho de campos |
| **HLS público** | Apenas `stream.m3u8` e `segment_*.ts` por canal |

Rotas públicas (sem API key): `GET /health`, `GET /channels/:id/hls/*`.

```bash
# Todas as requisições protegidas precisam do header:
curl -H "Authorization: Bearer sua-api-key" http://localhost:3000/channels
```

### Storage

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/storage/upload` | Upload multipart (`file`) |
| GET | `/storage` | Lista arquivos |
| GET | `/storage/:filename` | Detalhe do arquivo |
| DELETE | `/storage/:filename` | Remove arquivo |

```bash
curl -X POST http://localhost:3000/storage/upload \
  -H "Authorization: Bearer sua-api-key" \
  -F "file=@intro.mp4"
```

## Estrutura

```
src/
  index.ts              # Entry point Fastify
  types.ts              # Tipos de domínio
  store.ts              # Repositório de dados
  db/
    index.ts            # SQLite (better-sqlite3)
    schema.ts
  routes/
    channels.ts
    assets.ts
    playlists.ts
    scheduler.ts
    hls.ts
  scheduler/
    index.ts            # Motor de fila e timers
    types.ts
  engine/
    index.ts            # FFmpeg playout engine
    ffmpeg.ts
    probe.ts
    config.ts
  security/
    auth.ts             # API key authentication
    validate.ts         # Input sanitization
    parse.ts
    config.ts
  storage/
    local.ts            # Upload seguro local
  plugins/
    security.ts         # Helmet + rate limit
    static.ts           # Painel web estático
public/
  panel/                # UI de operação
```
