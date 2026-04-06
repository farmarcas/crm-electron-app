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

Sem assinatura, o **Windows SmartScreen exibe um aviso de bloqueio** a cada instalação. O CRM Radar é distribuído para PCs de farmácias parceiras da Farmarcas — máquinas sem AD centralizado — o que limita as opções sem custo.

### Comparativo de opções

| Opção | Custo | SmartScreen | Observação |
|---|---|---|---|
| **Self-signed + GitHub Secrets** | Grátis | Aviso permanente — usuário clica para prosseguir | Assina o executável, evita "publisher unknown" no UAC |
| **OV Certificate** (SSL.com, Sectigo) | ~R$ 800–1.500/ano | Constrói reputação gradualmente | Após N downloads sem reports, aviso some |
| **EV Certificate** (DigiCert, Sectigo) | ~R$ 2.000–4.000/ano | Confiança imediata | Requer token USB físico ou HSM cloud |

**Recomendação:** o self-signed com GitHub Secrets é viável se a instalação for feita por um responsável de TI nas farmácias (o aviso é clicável, não um bloqueio total). Se o instalador chega diretamente ao usuário final sem suporte, o OV Certificate é o próximo passo mais barato.

> O self-signed não elimina o SmartScreen porque não há AD para distribuir a confiança do certificado via GPO. O benefício real é: o Windows exibe o nome "Farmarcas" no UAC em vez de "Editor desconhecido", e o executável tem integridade verificável (não foi adulterado). Com o tempo e volume de downloads do mesmo hash assinado, o SmartScreen pode construir reputação automaticamente.

### Configuração com self-signed + GitHub Secrets (custo zero)

**a) Gerar o certificado uma única vez (Windows, PowerShell)**

**Passo 1 — Abrir o PowerShell como Administrador**

- Tecla Win → digitar `powershell`
- Clicar com botão direito → "Executar como administrador"
- Confirmar no UAC

**Passo 2 — Verificar e liberar a política de execução**

```powershell
Get-ExecutionPolicy
```

Se retornar `Restricted`, executar:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
```

**Passo 3 — Gerar o certificado**

```powershell
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Radar CRM, O=Farmarcas" -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(3) -CertStoreLocation Cert:\CurrentUser\My
```

Verificar se funcionou:

```powershell
$cert.Thumbprint
```

**Passo 4 — Exportar o `.pfx`**

```powershell
$pwd = ConvertTo-SecureString -String "senha_aqui" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "$env:USERPROFILE\Desktop\radar-crm.pfx" -Password $pwd
```

**Passo 5 — Gerar o base64 (copiar para o GitHub Secret)**

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\Desktop\crm-radar.pfx")) | Set-Clipboard
```

**b) Adicionar os secrets no repositório GitHub**

`Settings → Secrets and variables → Actions → New repository secret`

| Secret | Valor |
|---|---|
| `WIN_CSC_LINK` | base64 do `.pfx` (copiado no passo anterior) |
| `WIN_CSC_PASSWORD` | senha definida no passo anterior |

**c) Configurar o CI**

No job de build do `.github/workflows/release.yml`:

```yaml
- name: Build
  run: npm run dist:win -- --publish=always
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_PASSWORD }}
```

O `electron-builder` detecta automaticamente as variáveis `CSC_LINK` e `CSC_KEY_PASSWORD` e assina o executável sem configuração adicional.

### Migração futura para OV Certificate

Quando for adquirido um OV Certificate, o processo é idêntico: exportar o `.pfx` fornecido pela CA, converter para base64, atualizar os dois secrets no GitHub. Nenhuma alteração no CI ou no `package.json` é necessária.

> O certificado self-signed tem validade de 3 anos (conforme gerado acima). Ao expirar, repetir o passo (a) e atualizar os secrets.

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

### Como funciona o electron-updater

  Fluxo geral

  Build → publica latest.yml + instalador no GitHub Release
                      ↓
  App inicia → consulta latest.yml → compara versão
                      ↓
          Nova versão? → baixa instalador em background
                      ↓
          Download completo → notifica usuário → instala + reinicia

  ---
  1. O arquivo latest.yml

  É o artefato central do mecanismo. O electron-builder o gera automaticamente no build e tem esta estrutura:

  version: 1.2.0
  files:
    - url: RadarCRM-Setup-1.2.0.exe
      sha512: <hash>
      size: 85432190
  path: RadarCRM-Setup-1.2.0.exe
  sha512: <hash>
  releaseDate: '2026-04-06T00:00:00.000Z'

  O app baixa esse arquivo (leve, ~200 bytes) para checar se há nova versão, sem precisar baixar o instalador inteiro.

  ---
  2. Por que nsis e não portable

  O portable é apenas um .exe autoextraível — não registra nada no sistema, não tem caminho de instalação fixo. O updater precisa:
  - Saber onde o app está instalado (para substituir arquivos)
  - Ter permissão de escrita nesse local
  - Um mecanismo para reiniciar após a atualização

  O nsis instala em %LOCALAPPDATA%\Programs\ por padrão (sem precisar de admin), cria entradas de desinstalação e tem um Squirrel-like hook
  que o updater usa para trocar os binários.

  ---
  3. checkForUpdatesAndNotify() vs controle manual

  Modo silencioso (o que está no main.js atual):
  autoUpdater.checkForUpdatesAndNotify();
  - Checa, baixa e exibe uma notificação nativa do SO
  - A instalação só ocorre quando o usuário reinicia o app manualmente
  - Zero código extra necessário

  Modo controlado (para UX mais elaborada):
  autoUpdater.on('update-available', (info) => {
    // avisar o usuário que há update, mostrar changelog
  });

  autoUpdater.on('download-progress', (progress) => {
    // progress.percent, progress.bytesPerSecond, progress.transferred
  });

  autoUpdater.on('update-downloaded', () => {
    // perguntar ao usuário se quer reiniciar agora
    autoUpdater.quitAndInstall(); // fecha e instala imediatamente
  });

  autoUpdater.checkForUpdates();

  ---
  4. O que acontece no CI com --publish=always

  Com --publish=never (atual): o build gera os artefatos localmente, e o job softprops/action-gh-release os faz upload manualmente.

  Com --publish=always: o electron-builder ele mesmo:
  1. Checa se já existe um Release com a tag atual no GitHub
  2. Se não existe, cria o Release
  3. Faz upload de todos os artefatos (.exe, latest.yml, .blockmap)

  O job release do workflow pode ser removido — o electron-builder absorve essa responsabilidade. O GH_TOKEN no env do step de build é o que
   autoriza esse acesso à API do GitHub.

  ---
  5. O .blockmap

  Gerado junto com o instalador. Permite atualizações diferenciais: em vez de baixar o instalador completo (ex: 80MB), o updater baixa
  apenas os blocos que mudaram entre versões. Em apps que mudam pouco o bundle de dependências entre releases, a economia pode ser de 80-90%
   do tamanho do download.

  ---
  Requisito de assinatura

  No Windows, o updater verifica a assinatura do instalador baixado via sha512 (no latest.yml). Sem certificado de código
  (CSC_LINK/CSC_KEY_PASSWORD), o Windows SmartScreen bloqueia a instalação. O certificado já está configurado nos secrets do CI, então isso
  não é um problema aqui.

❯ quero gerar o certificado e configurar o pipeline com o LINK, PASS e GH_TOKEN. como faço isso para todas essas chaves                     
  ⎿  ⧉ Selected 3 lines from .github/workflows/release.yml in Trae

⏺ Configurando os 3 secrets

  1. GH_TOKEN — mais simples

  O GITHUB_TOKEN é gerado automaticamente pelo GitHub Actions — você não precisa criar nada. Ele já existe em todo workflow. Basta garantir
  que o workflow tem permissão de escrita:

  No repositório: Settings → Actions → General → Workflow permissions → marcar "Read and write permissions".

  ---
  2. WIN_CSC_LINK + WIN_CSC_PASSWORD — certificado de código

  Você precisa de um certificado .pfx. Há dois caminhos:

  ---
  Opção A: Certificado auto-assinado (gratuito, sem SmartScreen verde)

  Funciona para distribuição interna. O Windows vai mostrar aviso na primeira execução.

  No PowerShell (Windows):
  # Gera o certificado
  $cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject "CN=Radar CRM, O=Farmarcas" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(5)

  # Exporta como .pfx com senha
  $pwd = ConvertTo-SecureString -String "SUA_SENHA_AQUI" -Force -AsPlainText
  Export-PfxCertificate `
    -Cert $cert `
    -FilePath "C:\temp\farmarcas-codesign.pfx" `
    -Password $pwd

  ---
  Opção B: Certificado EV/OV comercial (pago, SmartScreen confiável)

  Emitido por CA como Sectigo, DigiCert ou SSL.com (~$100-400/ano). Você recebe um arquivo .pfx + senha diretamente da CA.

  ---
  3. Convertendo o .pfx para configurar no GitHub

  O WIN_CSC_LINK aceita duas formas:
  - Um caminho/URL para o .pfx
  - O conteúdo do .pfx em base64 (recomendado para CI)

  Converta o arquivo para base64:

  No PowerShell:
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\temp\farmarcas-codesign.pfx")) | clip

  No macOS/Linux:
  base64 -i farmarcas-codesign.pfx | pbcopy  # macOS
  base64 -w 0 farmarcas-codesign.pfx | xclip # Linux

  ---
  4. Adicionando os secrets no GitHub

  Settings → Secrets and variables → Actions → New repository secret

  ┌──────────────────┬──────────────────────────────────────────┐
  │      Secret      │                  Valor                   │
  ├──────────────────┼──────────────────────────────────────────┤
  │ WIN_CSC_LINK     │ O conteúdo base64 do .pfx (string longa) │
  ├──────────────────┼──────────────────────────────────────────┤
  │ WIN_CSC_PASSWORD │ A senha que você usou ao exportar o .pfx │
  └──────────────────┴──────────────────────────────────────────┘

  O GITHUB_TOKEN não é adicionado como secret — ele é injetado automaticamente pelo runner.

  ---
  5. Verificar o workflow

  O step de build já deve estar assim:
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_PASSWORD }}

  O electron-builder lê CSC_LINK e CSC_KEY_PASSWORD automaticamente — se o valor de CSC_LINK for uma string base64, ele decodifica e usa
  como .pfx em memória, sem precisar salvar o arquivo no runner.

  ---
  Resumo do fluxo

  Gerar .pfx (PowerShell ou CA comercial)
      ↓
  Converter para base64
      ↓
  Adicionar WIN_CSC_LINK (base64) e WIN_CSC_PASSWORD no GitHub Secrets
      ↓
  GITHUB_TOKEN: apenas habilitar "Read and write permissions" nas Actions

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
- [ ] Gerar certificado self-signed (PowerShell, Windows) e exportar como `.pfx`
- [ ] Adicionar secrets `WIN_CSC_LINK` (base64 do `.pfx`) e `WIN_CSC_PASSWORD` no GitHub
- [ ] Atualizar o step de build no CI com `CSC_LINK`, `CSC_KEY_PASSWORD` e `GH_TOKEN`
- [ ] Executar `npm install electron-updater`
- [ ] Adicionar `publish` no `package.json`
- [ ] Implementar `autoUpdater.checkForUpdatesAndNotify()` em `main.js`
- [ ] Trocar `--publish=never` por `--publish=always` no CI
- [ ] Criar `assets/icon.icns` para o build macOS
- [ ] Criar `LICENSE.txt` na raiz (se quiser exibir no instalador)
- [ ] Definir versão inicial em `package.json` (ex: `1.0.0`)

> **Decisão futura:** avaliar a compra de um OV Certificate quando o volume de instalações justificar — elimina o aviso do SmartScreen sem nenhuma mudança no CI.
