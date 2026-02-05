# Regras do Projeto

## Segurança Electron
- Mantenha `contextIsolation: true` e `nodeIntegration: false`.
- Use `preload.js` com `contextBridge` e exponha apenas APIs mínimas.
- Carregue apenas URLs confiáveis no `loadURL`.

## Janela e layout
- Preserve a lógica de posicionamento com `screen.getPrimaryDisplay().workArea`.
- Mantenha a largura do painel lateral em 400px, salvo requisito explícito.

## Build e empacotamento
- Atualize a lista `build.files` ao adicionar/remover arquivos essenciais.
- Gere builds apenas pelos scripts `npm run dist:win` e `npm run dist:mac`.
