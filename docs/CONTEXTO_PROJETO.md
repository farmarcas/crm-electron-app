# Contexto do Projeto

## Objetivo
Aplicação Electron para exibir uma janela lateral fixa de 400px no lado direito da área útil da tela, carregando uma URL externa de sugestões com configuração segura de renderer.

## Stack e Runtime
- Electron `^31.0.0`
- Electron Builder `^26.4.0`
- Node.js (via runtime do Electron)

## Estrutura Principal
- `main.js`: processo principal, criação da janela, ícone e menu da tray, inicialização automática (login/autostart) por sistema operacional.
- `preload.js`: bridge segura com `contextBridge`, expondo somente `appInfo`.
- `package.json`: scripts de execução/build e configuração de empacotamento.
- `scripts/linux-install-autostart.sh`: script auxiliar incluído em builds Linux.

## Comportamento da Aplicação
- Cria uma `BrowserWindow` com:
  - largura fixa de `400`
  - altura igual ao `workArea.height`
  - posição no canto direito (`x = workArea.x + workArea.width - 400`)
- Carrega URL externa definida em `SUGGESTIONS_URL`.
- Remove menu da janela (`setMenu(null)`).
- Ao fechar a janela, oculta no tray em vez de encerrar o app.
- Ícone de tray com menu para abrir sugestões ou sair.

## Segurança
- `contextIsolation: true`
- `nodeIntegration: false`
- Exposição mínima no preload via `contextBridge.exposeInMainWorld`.

## Build e Distribuição
Scripts disponíveis:
- `npm run start`
- `npm run build`
- `npm run dist:win`
- `npm run dist:mac`
- `npm run dist:linux`

Targets configurados:
- Windows: `portable`
- macOS: `dmg`
- Linux: `deb` e `rpm`

Arquivos incluídos no pacote (`build.files`):
- `main.js`
- `preload.js`
- `package.json`

## Convenções importantes do projeto
- Preservar `contextIsolation: true` e `nodeIntegration: false`.
- Manter posicionamento por `screen.getPrimaryDisplay().workArea`.
- Manter largura lateral de `400px` salvo requisito explícito.
- Ao adicionar/remover arquivos essenciais, atualizar `build.files`.
