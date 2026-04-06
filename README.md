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
# 1. Atualize a versão no package.json
npm version patch --no-git-tag-version   # ou minor / major
# ex: 0.0.9 → 0.0.10

# 2. Commit da alteração
git add package.json package-lock.json
git commit -m "chore: bump version to $(node -p "require('./package.json').version")"

# 3. Crie e publique a tag
git tag v$(node -p "require('./package.json').version")
git push origin main --tags
```

O GitHub Actions irá:
1. Compilar o instalador para Windows, macOS e Linux
2. Assinar o executável Windows com o certificado configurado nos secrets
3. Publicar os artefatos e o `latest.yml` no GitHub Release da tag

Usuários com o app instalado serão notificados automaticamente pelo auto-updater.