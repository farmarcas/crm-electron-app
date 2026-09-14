# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run in development mode
npm test           # Run the test suite (node:test — does not need Electron)
npm run dist:win   # Build Windows NSIS installer
npm run dist:mac   # Build macOS dmg
npm run dist:linux # Build Linux deb/rpm packages
```

Lint is not configured (`npm run lint` is a placeholder).

## Architecture

This Electron app renders an external URL (`SUGGESTIONS_URL` in `main.js`) in a fixed 400px-wide side panel anchored to the right edge of the primary display, and runs a local HTTP API used by the point-of-sale system (PDV) on the same machine.

**Core files:**
- `main.js` — Main process: window creation/positioning, system tray, autostart, auto-updater; starts the local API (`createLocalServer`) and closes it on `before-quit`
- `preload.js` — Exposes `window.appInfo` and `window.crmPdvBridge` via `contextBridge` **and** injects the in-app update notification banner (HTML/CSS/JS injected directly into the loaded URL's DOM)
- `server/` — The local API. Pure Node: it never requires Electron; everything Electron-specific (window, logger) is injected from `main.js`, which is what keeps it testable
- `package.json` — `electron-builder` packaging config

**Key behaviors in `main.js`:**
- Window position is calculated from `screen.getPrimaryDisplay().workArea` (respects taskbars/docks)
- The tray icon is generated programmatically at runtime (PNG built via raw pixel manipulation + zlib) — there is no tray icon asset file
- Closing the window hides it instead of quitting; quitting only happens via the tray "Sair" menu item (`app.isQuiting` flag)
- Autostart is set via `app.setLoginItemSettings` on Windows/macOS; on Linux it writes an XDG `.desktop` file to `~/.config/autostart/`
- Auto-updater runs only when `app.isPackaged`; checks immediately on launch then every 60 seconds
- The `SUGGESTIONS_URL` environment override (and `.env` via dotenv) only applies when not packaged

**Local API (`server/`):**
- Listens only on `127.0.0.1:50505` (`PDV_API_PORT` overrides the port, for debugging)
- `POST /identification` — opens the attendance (session) with store CNPJ + customer CPF (+ optional seller) and notifies the renderer
- `POST /basket` — replaces the current session's basket (`sales_items`); accepted and silently ignored (200) when no session is open
- `GET /docs` — Swagger UI for the OpenAPI spec in `docs/api/openapi.yaml`, served from the same origin so *Try it out* works
- Guards: `Host` allowlist (403), POST only on API routes (405), `Content-Type: application/json` required (415), 64 KiB body limit (413)
- Session state lives in memory in `server/session-store.js`; the basket lives inside the session, so a new identification discards it
- `docs/api/openapi.yaml` is the contract delivered to the PDV vendor. `test/integration/openapi.contract.test.js` fails when it drifts from the code — update both together

**IPC channels (main → renderer):**
- `update-available` — new version detected, download starting (payload: version string)
- `download-progress` — download percent (payload: number 0–100)
- `update-downloaded` — ready to install (payload: version string)
- `pdv-identification` — PDV identified a customer (payload: `{ cnpj, cpf, seller }`), consumed by the page through `window.crmPdvBridge.onIdentification(callback)`

**IPC channels (renderer → main):**
- `install-update` — triggers `autoUpdater.quitAndInstall()`

**Build packaging (`build.files`):** an explicit allowlist for the app's own files — anything outside `node_modules` that is not listed (`main.js`, `preload.js`, `package.json`, `assets/**/*`, `server/**/*`, `docs/api/openapi.yaml`) does not ship, and the app then works under `npm start` but breaks once installed. Any new main-process file must be added.

Production dependencies work differently: electron-builder packages every `dependencies` entry, with its transitive deps, automatically — whatever `files` says (the `node_modules/...` entries are redundant). Only `!` exclusions affect them. They trim `swagger-ui-dist` down to what `/docs` serves plus licenses, and drop `@scarf/scarf`, an install-time telemetry package it pulls in. To check what actually ships, build with `electron-builder --win --dir` and list `dist/win-unpacked/resources/app.asar`.

## Security Rules

- Keep `contextIsolation: true` and `nodeIntegration: false` — do not change these.
- Only load trusted URLs in `loadURL`.
- The `preload.js` must only expose the minimum necessary API surface via `contextBridge`.
- The local API must never emit CORS headers (`Access-Control-*`) nor approve a CORS preflight. Requests carrying an `Origin` header are accepted (so the Swagger UI at `/docs` works), which means the only thing keeping web pages from other origins out is the JSON-only `Content-Type` (it forces a preflight) combined with the absence of CORS. Adding CORS would let any website open in the operator's browser call the API.
- `/docs` responses must keep `frame-ancestors 'none'` / `X-Frame-Options: DENY` (the page can call the API, so it must not be embeddable) and a `'self'`-only script policy.
- Never log CPF or CNPJ in plaintext — use `server/mask.js`.

## Releasing a new version

Tags must use the `v` prefix (e.g. `v1.2.3`). The CI workflow triggers only on `v*.*.*` tags.

```bash
npm version patch --no-git-tag-version   # 0.0.10 → 0.0.11  (correção)
npm version minor --no-git-tag-version   # 0.0.10 → 0.1.0   (funcionalidade nova)
npm version major --no-git-tag-version   # 0.0.10 → 1.0.0   (mudança incompatível)
# Ou defina diretamente:
npm version 1.0.1 --no-git-tag-version   # versão específica
git add package.json package-lock.json
git commit -m "chore: bump version to $(node -p "require('./package.json').version")"
git tag v$(node -p "require('./package.json').version")
git push origin main
git push origin v$(node -p "require('./package.json').version")
```

The workflow (`release.yml`) strips the `v` prefix before passing the version to `npm version` inside the runner, runs `npm run test`, then builds and publishes artefacts to the GitHub Release via `electron-builder --publish=always`. **CI only builds the Windows target** — mac/linux builds must be run locally.

**Do not** create bare tags without the `v` prefix (e.g. `0.0.9`) — `electron-builder` would create a second `v0.0.9` tag and trigger a duplicate build.

## Platform notes

- Window panel width is fixed at 400px — only change if explicitly required.
- The Linux autostart script (`scripts/linux-install-autostart.sh`) is included in `.deb`/`.rpm` packages via `build.linux.extraFiles` and mirrors the logic in `configureOpenAtLogin()` in `main.js`.
- macOS tray icon uses `setTemplateImage(true)` for dark/light mode compatibility.
