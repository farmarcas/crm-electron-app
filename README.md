# CRM Electron App

## Descritivo
App Electron de exemplo com janela lateral de 400px posicionada no lado direito do workArea, carregando uma URL externa em uma janela segura (contextIsolation habilitado e nodeIntegration desabilitado).

## Comandos básicos
- Instalar dependências: `npm install`
- Iniciar o app: `npm run start`
- Gerar build Windows: `npm run dist:win`
- Gerar build macOS: `npm run dist:mac`

Os artefatos são gerados em `dist/`.

## Boas práticas
- Mantenha `contextIsolation: true` e `nodeIntegration: false`.
- Exponha APIs mínimas via `preload.js` com `contextBridge`.
- Defina tamanho e posição usando `screen.getPrimaryDisplay().workArea`.
- Carregue apenas URLs confiáveis no `loadURL`.
- Restrinja arquivos incluídos no build para reduzir tamanho e superfície de ataque.


### Arquitetura

[Base Arquitetural](docs/ARCHITECTURE.md#base-arquitetural)
