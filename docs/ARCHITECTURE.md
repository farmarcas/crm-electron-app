# Base Arquitetural

## Visão geral
Aplicação Electron com janela lateral fixa no lado direito do monitor, carregando uma URL externa em uma janela segura. O projeto segue o modelo clássico de processos do Electron: processo principal (main), preload com bridge segura, e renderer (conteúdo web).

## Componentes e responsabilidades
- Processo principal: cria e posiciona a janela, define tamanho usando `workArea` e carrega a URL externa.
- Preload: expõe um conjunto mínimo de informações de ambiente para o renderer, via `contextBridge`.
- Renderer: conteúdo web carregado a partir de URL externa.
- Configuração de build: empacotamento via `electron-builder` para Windows e macOS.

## Fluxo de execução
1. O Electron inicia pelo entrypoint definido em `main.js`.
2. O processo principal calcula o `workArea` e cria a janela lateral.
3. O preload é carregado e expõe APIs seguras ao `window`.
4. A janela navega para a URL externa.

## Segurança
- `contextIsolation` habilitado e `nodeIntegration` desabilitado.
- O preload limita a superfície de exposição ao renderer.

## Empacotamento
- Windows: alvo `portable`.
- macOS: alvos `dmg` e `zip`.
- Apenas arquivos essenciais são incluídos no build.

## Estrutura de arquivos
- `main.js`: processo principal e configuração da janela.
- `preload.js`: bridge segura com o renderer.
- `index.html`: recurso local usado no desenvolvimento inicial.
- `package.json`: scripts e configuração do `electron-builder`.
