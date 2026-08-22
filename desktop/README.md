# GameShare Desktop

Cliente de desktop pro GameShare, feito em Electron — mesma ideia do
cliente do Discord: uma janela Chromium que abre o app web
(`https://gameshare-app.vercel.app`), com login do Google, notificacao
nativa e checagem automatica de atualizacao.

Nao tem nenhuma logica de app aqui dentro — tudo (login, servidores,
chamadas, chat) roda no site normal. Isso e so a "casca" nativa.

## Rodar localmente

```bash
cd desktop
npm install
npm start
```

## Gerar um instalador (sem publicar)

```bash
npm run dist
```

O `.exe` sai em `desktop/release/`.

## Publicar uma nova versao

1. Sobe a versao em `desktop/package.json` (`version`).
2. Cria e envia uma tag `desktop-vX.Y.Z`:
   ```bash
   git tag desktop-v1.0.1
   git push origin desktop-v1.0.1
   ```
3. O workflow `.github/workflows/build-desktop.yml` builda no Windows via
   GitHub Actions e publica o instalador como GitHub Release automaticamente.
   O app dos usuarios ja instalados vai detectar a atualizacao sozinho na
   proxima vez que abrirem (`electron-updater`, configurado pra olhar os
   Releases desse repositorio).

O link de download no site (`https://github.com/R1CKzo/gameshare-app/releases/latest/download/GameShare-Setup.exe`)
sempre aponta pro `.exe` da ultima release publicada, sem precisar mudar o
link a cada versao.
