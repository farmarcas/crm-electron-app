# CRM Electron App

## Descritivo
App Electron de exemplo com janela lateral de 400px posicionada no lado direito do workArea, carregando uma URL externa em uma janela segura (contextIsolation habilitado e nodeIntegration desabilitado).

## Setup
1. Instale dependências:
   - `npm install`
2. Inicie o app:
   - `npm run start`

### Build
- Windows: `npm run dist:win`
- macOS: `npm run dist:mac`

Os artefatos são gerados em `dist/`.

## Boas práticas
- Use `contextIsolation: true` e `nodeIntegration: false`.
- Exponha APIs mínimas via `preload.js` com `contextBridge`.
- Defina tamanho e posição usando `screen.getPrimaryDisplay().workArea` para evitar cobrir dock/barra de tarefas.
- Restrinja arquivos incluídos no build para reduzir tamanho e superfície de ataque.


### Arquitetura

[Base Arquitetural](docs/ARCHITECTURE.md#base-arquitetural)
