# GameShare

Plataforma web para transmissao ao vivo da tela em WebRTC (baixa latencia via PeerJS).

## Stack

- **Next.js 14 (App Router)** + Tailwind CSS
- **Neon (PostgreSQL Serverless)** + **Prisma**
- **NextAuth.js (Auth.js v4)** com Google OAuth
- **PeerJS** (WebRTC) para o streaming ponto a ponto

## 1. Instalar dependencias

```bash
npm install
```

## 2. Criar o banco no Neon

1. Crie uma conta em https://neon.tech e um novo projeto (ex: `gameshare`).
2. No painel do projeto, copie duas connection strings:
   - **Pooled connection** (usada em runtime) -> vai em `DATABASE_URL`
   - **Direct connection** (usada pelo Prisma Migrate) -> vai em `DIRECT_URL`

## 3. Configurar o Google OAuth

1. Acesse https://console.cloud.google.com/apis/credentials.
2. Crie um projeto (ou use um existente) e configure a **tela de consentimento OAuth**.
3. Crie uma credencial **OAuth Client ID** do tipo **Web application**.
4. Em **Authorized redirect URIs**, adicione:
   - `http://localhost:3000/api/auth/callback/google` (desenvolvimento)
   - `https://SEU_DOMINIO/api/auth/callback/google` (producao)
5. Copie o **Client ID** e o **Client Secret**.

## 4. Variaveis de ambiente

Copie o arquivo de exemplo e preencha os valores:

```bash
cp .env.local.example .env.local
```

```
DATABASE_URL="postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/gameshare?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/gameshare?sslmode=require"

NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="cole-aqui-o-resultado-do-comando-abaixo"

GOOGLE_CLIENT_ID="seu-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="seu-client-secret"
```

Gere o `NEXTAUTH_SECRET`:

```bash
openssl rand -base64 32
```

## 5. Rodar as migrations no Neon

```bash
npx prisma migrate dev --name init
```

Isso cria as tabelas `User`, `Account`, `Session`, `VerificationToken` e `Stream` no Neon.

## 6. Rodar o projeto

```bash
npm run dev
```

Acesse http://localhost:3000.

## Fluxo da aplicacao

1. Usuario clica em **Entrar com Google** -> autentica via NextAuth.
2. No primeiro acesso (sem `nickname`/`userTag`), o middleware redireciona para `/setup`.
3. Usuario escolhe um nickname -> o backend gera uma tag numerica unica de 6 digitos
   (`utils/generateTag.ts`), formando o identificador `Nick#123456`.
4. Em `/stream/new`, o usuario clica em "Selecionar tela e iniciar live":
   - `navigator.mediaDevices.getDisplayMedia` captura a tela/janela + audio do sistema.
   - `navigator.mediaDevices.getUserMedia` captura o microfone (opcional).
   - Os audios sao mixados via `AudioContext` e combinados com o video em um unico `MediaStream`.
   - Um `Peer` do PeerJS e criado com o `peerId` da live (persistido no Neon via `POST /api/stream`).
5. Espectadores acessam `/stream/Nick%23123456` (URL do link compartilhavel):
   - A pagina busca a live no banco (peerId + status `isLive`).
   - Um `Peer` de espectador chama `peer.call(peerId, ...)` e recebe o stream remoto no evento `stream`.
6. O streamer pode copiar o link da live e compartilhar; o espectador tambem tem um botao "Compartilhar".

## Notas de producao

- O PeerJS, sem configuracao adicional, usa o broker publico da nuvem (`0.peerjs.com`) apenas
  para **sinalizacao** (o video trafega P2P). Para producao, hospede seu proprio `PeerServer`
  (pacote `peer`) e configure `NEXT_PUBLIC_PEERJS_HOST/PORT/PATH`.
- O modelo atual usa PeerJS "malha" (um `call` por espectador) — adequado para poucos
  espectadores simultaneos. Para escalar para audiencias grandes, migre a camada de streaming
  para **LiveKit** (SFU) mantendo o mesmo schema Prisma (`peerId` -> `roomName`/`streamKey`).
- Habilite `DIRECT_URL` apenas para migrations; o app deve sempre falar com o Neon via
  `DATABASE_URL` (pooled) para nao esgotar conexoes em serverless.
