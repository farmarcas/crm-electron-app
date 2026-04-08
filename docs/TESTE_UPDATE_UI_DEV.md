# Testar a barra de atualização (update UI) em desenvolvimento

O `electron-updater` **só roda** com app **empacotado** (`app.isPackaged`). Para ajustar HTML/CSS da barra injetada na página **sem** gerar instalador, use o modo **preview local**.

## O que acontece nesse modo

- O `main` carrega **`preload.dev.js`** em vez de `preload.js` e abre o **DevTools** (janela separada).
- A UI da barra continua em **`preload-updater-ui.js`** (mesmo código que vai no build).
- O código **só de preview** fica em `preload.dev.js` — **não** entra no `electron-builder` (`build.files` não lista `preload.dev.js`).
- A barra é mostrada **no mesmo documento** da URL configurada em `SUGGESTIONS_URL` (`main.js`), após um atraso (para a SPA montar o `body`).
- No terminal deve aparecer uma linha como:
  `[CRM Radar] preview bar UI | snapshot=banner delayMs=1200 argv flag=true`

Se `argv flag=false`, o Electron não recebeu `--update-ui-dev` — veja [Problemas comuns](#problemas-comuns).

---

## Comandos (npm)

Na raiz do repositório, com dependências instaladas (`npm install`):

| Comando | Uso |
|--------|-----|
| `npm run start:update-ui` | Preview padrão (estado inicial “banner”, atraso ~1,2 s). |
| `npm run start:update-ui:ready` | Abre já no estado “pronta para instalar”. |
| `npm run start:update-ui:downloading` | Abre já com progresso ~45%. |
| `npm run start:update-ui:slow` | Simulação de download mais lenta + transições CSS longas (ajuste visual). |

Equivalente direto:

```bash
npx electron . --update-ui-dev
```

---

## Variáveis de ambiente (opcional)

Defina **antes** do `electron` (Unix/macOS):

| Variável | Efeito |
|----------|--------|
| `CRM_DEV_UPDATE_MS` | Milissegundos antes de mostrar a barra (ex.: `0` para imediato). |
| `CRM_DEV_UPDATE_SNAPSHOT` | `banner`, `downloading` ou `ready` (estado inicial). |
| `CRM_DEV_UPDATE_STEP_MS` | Intervalo entre passos da simulação 0→100% ao clicar em “Atualizar agora” no preview. |
| `CRM_DEV_UPDATE_SLOW_CSS=1` | Ativa CSS de transição mais lenta (só preview). |
| `CRM_DEV_UPDATE_BAR=1` | Alternativa ao flag `--update-ui-dev` para ativar o modo preview (se o flag não for passado). |

Exemplo:

```bash
CRM_DEV_UPDATE_MS=0 npm run start:update-ui
```

**Windows (cmd):** as linhas `VAR=valor comando` não funcionam; use `set VAR=valor` e depois `npx electron . --update-ui-dev`, ou defina as variáveis nas propriedades do sistema / terminal integrado.

---

## API no DevTools (`window`)

Com o preview ativo, no **Console** do DevTools da página:

```js
crmUpdateBarDev.snapTo("banner");
crmUpdateBarDev.snapTo("downloading");
crmUpdateBarDev.snapTo("ready");
crmUpdateBarDev.hide();
```

Útil para iterar em CSS sem reiniciar o app.

---

## Fluxo real vs preview

| | Dev (`start:update-ui`) | Build instalado |
|--|-------------------------|-----------------|
| Updater | Não executa | `electron-updater` verifica release no GitHub |
| Barra | Disparada por timer + `preload.dev.js` | Eventos `update-available` / `download-progress` / `update-downloaded` |
| “Atualizar agora” (final) | Diálogo explicativo (`main.js`) | `quitAndInstall()` |

Para testar **download e instalação de verdade**, é preciso duas versões empacotadas e release no GitHub — ver documentação geral do projeto e `electron-updater`.

---

## Ficheiros relevantes

- `main.js` — flag `--update-ui-dev`, `CRM_PREVIEW_*`, DevTools, `sandbox: false` só no preview.
- `preload.js` — produção (só `appInfo` + `preload-updater-ui`).
- `preload.dev.js` — só local; timer + `crmUpdateBarDev`.
- `preload-updater-ui.js` — markup/CSS e lógica da barra partilhada com o build.

---

## Problemas comuns

1. **Nada aparece e no terminal não há `[CRM Radar] preview bar UI`**  
   O modo preview não está ativo. Garanta `npm run start:update-ui` ou `electron . --update-ui-dev`.

2. **Log aparece, mas a barra não**  
   Aumente o atraso: `CRM_DEV_UPDATE_MS=2000 npm run start:update-ui`. No console: `crmUpdateBarDev.snapTo("banner")`. Se ainda falhar, confira erros na consola do DevTools.

3. **`argv flag=false` no log**  
   O processo não recebeu `--update-ui-dev`. Chame explicitamente: `npx electron . --update-ui-dev`.

4. **Alterações na barra**  
   Editar **`preload-updater-ui.js`** (e recarregar a janela ou reiniciar). Estilos só de preview lento: variável `CRM_DEV_UPDATE_SLOW_CSS=1` com `start:update-ui:slow`.
