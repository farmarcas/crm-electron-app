# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run in development mode
npm run dist:win   # Build Windows portable executable
npm run dist:mac   # Build macOS dmg
npm run dist:linux # Build Linux deb/rpm packages
```

No lint or test tooling is configured.

## Architecture

This is a minimal Electron app that renders an external URL (`SUGGESTIONS_URL` in `main.js`) in a fixed 400px-wide side panel anchored to the right edge of the primary display.

**Three-file core:**
- `main.js` — Main process: window creation/positioning, system tray, autostart configuration
- `preload.js` — Exposes `window.appInfo` (platform, versions) via `contextBridge`; no other APIs
- `package.json` — `electron-builder` packaging config

**Key behaviors in `main.js`:**
- Window position is calculated from `screen.getPrimaryDisplay().workArea` (respects taskbars/docks)
- The tray icon is generated programmatically at runtime (PNG built via raw pixel manipulation + zlib) — there is no tray icon asset file
- Closing the window hides it instead of quitting; quitting only happens via the tray "Sair" menu item (`app.isQuiting` flag)
- Autostart is set via `app.setLoginItemSettings` on Windows/macOS; on Linux it writes an XDG `.desktop` file to `~/.config/autostart/`

**Build packaging (`build.files`):** only `main.js`, `preload.js`, `package.json`, and `assets/**/*` are included in the distributable. Any new runtime file must be added to this list.

## Security Rules

- Keep `contextIsolation: true` and `nodeIntegration: false` — do not change these.
- Only load trusted URLs in `loadURL`.
- The `preload.js` must only expose the minimum necessary API surface via `contextBridge`.

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

The workflow (`release.yml`) strips the `v` prefix before passing the version to `npm version` inside the runner, then builds and publishes artefacts to the GitHub Release via `electron-builder --publish=always`.

**Do not** create bare tags without the `v` prefix (e.g. `0.0.9`) — `electron-builder` would create a second `v0.0.9` tag and trigger a duplicate build.

## Platform notes

- Window panel width is fixed at 400px — only change if explicitly required.
- The Linux autostart script (`scripts/linux-install-autostart.sh`) is included in `.deb`/`.rpm` packages via `build.linux.extraFiles` and mirrors the logic in `configureOpenAtLogin()` in `main.js`.
- macOS tray icon uses `setTemplateImage(true)` for dark/light mode compatibility.
