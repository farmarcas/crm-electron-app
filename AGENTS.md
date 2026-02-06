# Guia para Agents

## Objetivo
- Manter o app Electron seguro e minimalista.
- Evitar mudanças que adicionem renderers locais desnecessários.

## Tarefas comuns
- Ajustes na janela: edite `main.js`.
- Exposição de API: edite `preload.js`.
- Scripts e build: edite `package.json`.

## Cuidados
- Não habilite `nodeIntegration`.
- Não desabilite `contextIsolation`.
- Não inclua arquivos não usados em `build.files`.

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


