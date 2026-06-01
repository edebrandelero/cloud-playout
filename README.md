# cloud-playout

Sistema de playout de mídia na nuvem — transmissão programada de vídeo e áudio.

## Requisitos

- Node.js 20+
- npm

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

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor com hot reload |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm start` | Executa build de produção |
| `npm run typecheck` | Verifica tipos sem compilar |

## Próximas etapas (roadmap)

1. **API REST** — CRUD de canais, playlists e assets
2. **Scheduler** — agendamento e fila de reprodução
3. **Engine de playout** — integração com FFmpeg para saída RTMP/HLS
4. **Storage** — upload e gestão de mídia (S3 ou local)
5. **Painel web** — interface para operação do playout

## Estrutura

```
src/
  index.ts          # Entry point e servidor HTTP
```
