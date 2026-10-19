# CRM Electron App

## Descritivo
App Electron de exemplo com janela lateral de 400px posicionada no lado direito do workArea, carregando uma URL externa em uma janela segura (contextIsolation habilitado e nodeIntegration desabilitado).

## Comandos básicos
- Instalar dependências: `npm install`
- Iniciar o app: `npm run start`
- Build padrão: `npm run build`
- Gerar build Windows: `npm run dist:win`
- Gerar build macOS: `npm run dist:mac`
- Lint: `npm run lint`
- Testes: `npm run test`

Os artefatos são gerados em `dist/`.

## Boas práticas
- Mantenha `contextIsolation: true` e `nodeIntegration: false`.
- Exponha APIs mínimas via `preload.js` com `contextBridge`.
- Defina tamanho e posição usando `screen.getPrimaryDisplay().workArea`.
- Carregue apenas URLs confiáveis no `loadURL`.
- Restrinja arquivos incluídos no build para reduzir tamanho e superfície de ataque.


### Arquitetura

[Base Arquitetural](docs/ARCHITECTURE.md#base-arquitetural)

### Testes
- [SO - Inicializar Automaticamente](docs/teste-autostart.md)

## Publicando uma nova versão

O pipeline de release é disparado automaticamente ao criar uma tag com prefixo `v`.

```bash
# 1. Escolha o tipo de incremento:
npm version patch --no-git-tag-version   # 0.0.10 → 0.0.11  (correção)
npm version minor --no-git-tag-version   # 0.0.10 → 0.1.0   (funcionalidade nova)
npm version major --no-git-tag-version   # 0.0.10 → 1.0.0   (mudança incompatível)
# Ou defina diretamente:
npm version 1.0.1 --no-git-tag-version

# 2. Commit da alteração
git add package.json package-lock.json
git commit -m "chore: bump version to $(node -p "require('./package.json').version")"

# 3. Crie e publique a tag separadamente da branch
git tag v$(node -p "require('./package.json').version")
git push origin main
git push origin v$(node -p "require('./package.json').version")
```

O GitHub Actions irá:
1. Compilar o instalador para Windows (atual e legado), macOS e Linux
2. Assinar os executáveis Windows com o certificado configurado nos secrets
3. Publicar os artefatos, o `latest.yml` e o `legacy.yml` no GitHub Release da tag

Usuários com o app instalado serão notificados automaticamente pelo auto-updater.

### Build legado (Windows 7/8/8.1)

O Electron atual não roda em Windows 7/8/8.1. Para essas máquinas existe o instalador `CRM-Radar-Setup-legacy-<versão>.exe` (`npm run dist:win:legacy`, configurado em `electron-builder.legacy.js`): mesmo código, mas com Electron 22 e x64 + ia32.

- Ele se atualiza pelo canal `legacy` (`legacy.yml`), e o build atual pelo `latest.yml`. Um nunca é oferecido ao outro.
- O Electron 22 não recebe mais correções de segurança do Chromium. Use o legado só onde o atual não roda.
- Em tempo de execução ele usa Node 16: o código do processo principal e de `server/` não pode usar APIs mais novas.
- A primeira instalação é manual. Se a máquina for atualizada para o Windows 10/11, basta instalar o instalador atual por cima (é o mesmo app).