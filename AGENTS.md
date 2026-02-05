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
