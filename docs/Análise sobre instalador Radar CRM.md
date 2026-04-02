# Análise: Instalador Windows — CRM Radar

## Estado atual

| Item | Status |
|---|---|
| Target Windows | `portable` — gera um `.exe` avulso, sem instalador |
| Assinatura de código | Desativada (`signAndEditExecutable: false`) |
| Auto-update | Não implementado (sem pacote, sem lógica) |
| Publicação CI | `--publish=never` — artifacts são enviados manualmente ao GitHub Release |
| Versão | `0.0.0` |

---

## Prioridades de implementação

| # | Item | Impacto |
|---|---|---|
| 1 | Trocar `portable` por `nsis` | Crítico — sem isso não há instalador real |
| 2 | Configurar assinatura de código | Crítico — sem isso o Windows SmartScreen bloqueia o app |
| 3 | Implementar auto-update | Importante — necessário para distribuição contínua |
| 4 | Ajustar CI para publicar automaticamente | Importante — depende do item 3 |
| 5 | Criar `assets/icon.icns` | Menor — build macOS quebra sem esse arquivo |
| 6 | Definir versão inicial real | Menor |

---

## 1. Instalador NSIS

O alvo `portable` não registra o app no sistema (sem entrada em "Adicionar/Remover Programas", sem atalhos, sem desinstalador). Para produção, o alvo correto é `nsis`.

**Arquivo:** `package.json`

Substituir a seção `"win"` e adicionar a seção `"nsis"`:

```json
"win": {
  "target": [
    { "target": "nsis", "arch": ["x64"] }
  ],
  "signAndEditExecutable": true,
  "icon": "assets/icon.ico",
  "artifactName": "CRM-Radar-Setup-${version}.exe"
},
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "CRM Radar",
  "uninstallDisplayName": "CRM Radar",
  "installerIcon": "assets/icon.ico",
  "uninstallerIcon": "assets/icon.ico",
  "license": "LICENSE.txt"
}
```

Se for necessário manter também o `.exe` portátil para distribuição avulsa:

```json
"target": [
  { "target": "nsis",     "arch": ["x64"] },
  { "target": "portable", "arch": ["x64"] }
]
```

> O arquivo `LICENSE.txt` precisa ser criado na raiz do projeto se quiser exibir a licença na tela do instalador. Pode ser deixado em branco ou preenchido com os termos internos da Farmarcas.

---

## 2. Assinatura de código

Sem assinatura, o **Windows SmartScreen exibe um aviso de bloqueio** a cada instalação. Não há como contornar isso para distribuição ampla sem um certificado válido.

### Comparativo de opções

| Opção | Custo estimado | SmartScreen | Observação |
|---|---|---|---|
| **EV Certificate** (DigiCert, Sectigo) | ~R$ 2.000–4.000/ano | Confiança imediata | Requer token USB físico ou HSM cloud |
| **OV Certificate** (DigiCert, Sectigo) | ~R$ 800–1.500/ano | Constrói reputação gradualmente | Certificado em arquivo `.pfx`, mais simples |
| **Azure Trusted Signing** | ~US$ 9/mês | Confiança imediata (Microsoft) | Sem HSM físico, integra nativamente com `electron-builder` |
| **Self-signed + GPO** | Grátis | Bloqueado externamente | Viável apenas se todos os PCs estiverem no domínio AD da Farmarcas |

**Recomendação:** para distribuição interna corporativa via domínio AD, o certificado self-signed com GPO é suficiente e tem custo zero. Para distribuição externa ou sem controle de domínio, o **Azure Trusted Signing** é o melhor custo-benefício.

### Configuração no CI — certificado OV/EV (`.pfx`)

1. Exportar o certificado como `.pfx` e converter para base64:
   ```bash
   base64 -i certificado.pfx | tr -d '\n'
   ```
2. Adicionar dois secrets no repositório GitHub (`Settings → Secrets → Actions`):
   - `WIN_CSC_LINK` — conteúdo base64 do `.pfx`
   - `WIN_CSC_PASSWORD` — senha do `.pfx`

3. No job `build` do `.github/workflows/release.yml`, adicionar as variáveis de ambiente:
   ```yaml
   env:
     CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
     CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_PASSWORD }}
   ```
   E remover a linha `CSC_IDENTITY_AUTO_DISCOVERY: "false"`.

### Configuração no CI — Azure Trusted Signing

1. Instalar o plugin:
   ```bash
   npm install --save-dev @electron/windows-sign
   ```

2. Adicionar ao `package.json` dentro de `"win"`:
   ```json
   "sign": "./sign-windows.js"
   ```

3. Criar o arquivo `sign-windows.js` na raiz:
   ```js
   const { sign } = require("@electron/windows-sign");
   module.exports = async (config) => {
     if (!process.env.AZURE_CLIENT_ID) return;
     await sign({ ...config });
   };
   ```

4. Adicionar os secrets no GitHub e referenciá-los no CI:
   ```yaml
   env:
     AZURE_TENANT_ID:                  ${{ secrets.AZURE_TENANT_ID }}
     AZURE_CLIENT_ID:                  ${{ secrets.AZURE_CLIENT_ID }}
     AZURE_CLIENT_SECRET:              ${{ secrets.AZURE_CLIENT_SECRET }}
     AZURE_CODE_SIGNING_ACCOUNT_NAME:  ${{ secrets.ACS_ACCOUNT }}
     AZURE_CODE_SIGNING_ENDPOINT:      ${{ secrets.ACS_ENDPOINT }}
     AZURE_CODE_SIGNING_CERT_PROFILE:  ${{ secrets.ACS_PROFILE }}
   ```

---

## 3. Auto-update

O `electron-builder` tem integração nativa com o pacote `electron-updater`. O fluxo funciona assim:

1. O build gera um arquivo `latest.yml` com hash e URL do instalador.
2. Esse arquivo é publicado junto com o `.exe` no GitHub Release.
3. O app, ao iniciar, consulta o `latest.yml`, baixa o novo instalador em background e notifica o usuário quando pronto.

> **Pré-requisito:** auto-update só funciona com o alvo `nsis`. O alvo `portable` não tem instalação persistente no sistema e não suporta atualizações automáticas.

### Passo a passo

**a) Instalar o pacote**

```bash
npm install electron-updater
```

**b) Adicionar a configuração de publicação no `package.json`**

```json
"publish": {
  "provider": "github",
  "owner": "farmarcas",
  "repo": "crm-electron-app"
}
```

**c) Adicionar a lógica de update em `main.js`**

Adicionar no topo do arquivo:

```js
const { autoUpdater } = require("electron-updater");
```

Dentro de `app.whenReady().then(() => { ... })`, após `createTray()`:

```js
if (app.isPackaged) {
  autoUpdater.checkForUpdatesAndNotify();
}
```

O método `checkForUpdatesAndNotify()` é silencioso: baixa em background e exibe uma notificação nativa do SO quando a atualização estiver pronta para instalar. Se for necessário controle mais fino (exibir progresso, forçar reinício, mostrar changelog), substituir por:

```js
autoUpdater.on("update-available", () => { /* notificar usuário */ });
autoUpdater.on("download-progress", (progress) => { /* mostrar % */ });
autoUpdater.on("update-downloaded", () => {
  autoUpdater.quitAndInstall();
});
autoUpdater.checkForUpdates();
```

**d) Ajustar o CI para publicar os artefatos automaticamente**

**Arquivo:** `.github/workflows/release.yml`

Substituir a linha de build:

```yaml
# Antes
- run: npm run ${{ matrix.build }} -- --publish=never

# Depois
- run: npm run ${{ matrix.build }} -- --publish=always
```

E adicionar `GH_TOKEN` às variáveis de ambiente do step:

```yaml
env:
  GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
  CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_PASSWORD }}
```

Com isso, o job `release` atual (que usa `softprops/action-gh-release`) pode ser removido, pois o `electron-builder` passa a criar e publicar o Release diretamente.

---

## 4. Itens menores

**`assets/icon.icns` ausente** — o `package.json` referencia esse arquivo para o build macOS, mas ele não existe na pasta `assets/`. O build macOS vai falhar. Gerar a partir do `icon.png` com:

```bash
# macOS
mkdir icon.iconset
sips -z 1024 1024 assets/icon.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o assets/icon.icns
rm -rf icon.iconset
```

**Versão inicial** — definir em `package.json` a versão real do produto antes do primeiro release (ex: `1.0.0`). O CI já sincroniza com a tag git automaticamente.

---

## Checklist para o time

- [ ] Alterar `win.target` de `portable` para `nsis` no `package.json`
- [ ] Adicionar configuração `nsis` no `package.json`
- [ ] Decidir e adquirir o tipo de certificado (OV, EV ou Azure Trusted Signing)
- [ ] Adicionar secrets `WIN_CSC_LINK` e `WIN_CSC_PASSWORD` (ou equivalentes Azure) no GitHub
- [ ] Atualizar o step de build no CI com as variáveis de assinatura
- [ ] Executar `npm install electron-updater`
- [ ] Adicionar `publish` no `package.json`
- [ ] Implementar `autoUpdater.checkForUpdatesAndNotify()` em `main.js`
- [ ] Trocar `--publish=never` por `--publish=always` no CI
- [ ] Criar `assets/icon.icns` para o build macOS
- [ ] Criar `LICENSE.txt` na raiz (se quiser exibir no instalador)
- [ ] Definir versão inicial em `package.json` (ex: `1.0.0`)
