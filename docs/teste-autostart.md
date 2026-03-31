# Como testar a inicialização automática (login / arranque do SO)

Este guia descreve como validar o comportamento de `configureOpenAtLogin` em **Windows**, **macOS** e **Linux**.

**Comportamento esperado (resumo)**

| SO | Mecanismo | Testar com build empacotado? |
|----|-----------|-------------------------------|
| Windows | `app.setLoginItemSettings({ openAtLogin: true })` | Sim (recomendado) |
| macOS | Idem | Sim (recomendado) |
| Linux | Ficheiro `.desktop` em `~/.config/autostart/` | Sim (obrigatório: em dev o código não aplica) |

Em **Linux**, com `npm start`, `app.isPackaged` é `false` — o autostart **não** é configurado. Em Windows/macOS, em dev o registo pode apontar para o binário do **Electron**, não para o teu `.exe`/`.app`; por isso o teste fidedigno é sempre com **artefato de release**.

**Constantes úteis no código**

- ID do ficheiro Linux: `br.com.farmarcas.crm-electron-app.desktop`
- Nome de exibição (Linux `.desktop`): `CRM Radar` (`PRODUCT_DISPLAY_NAME` em `main.js`)
- App ID (Windows/macOS): `br.com.farmarcas.crm-electron-app`

---

## 1. Gerar os builds

Na raiz do repositório:

```bash
npm install
```

Depois, no sistema onde queres testar (ou em CI com runner do SO certo):

| Plataforma | Comando | Artefato típico |
|------------|---------|------------------|
| Windows | `npm run dist:win` | `dist/*.exe` (portable) |
| macOS | `npm run dist:mac` | `dist/*.dmg` |
| Linux | `npm run dist:linux` | `dist/*.deb` e/ou `dist/*.rpm` |

---

## 2. Windows

### 2.1 Preparar

1. Correr `npm run dist:win` numa máquina Windows (ou copiar o `.exe` gerado para uma VM Windows).
2. Executar o **portable** (ficheiro `.exe` em `dist/`).

### 2.2 Verificar sem reiniciar

1. Abrir **Definições** → **Aplicações** → **Início** (ou **Apps** → **Startup**, conforme a versão do Windows).
2. Procurar **CRM Radar** (ou o nome que o Windows mostrar associado ao executável) e confirmar que está **ligado**.

Alternativa:

1. `Ctrl+Shift+Esc` → **Gestor de Tarefas** → separador **Aplicações de arranque**.
2. Confirmar que a entrada correspondente ao app está **Ativada**.

### 2.3 Teste funcional

1. Fechar a aplicação (menu **Sair** na bandeja, para terminar o processo).
2. **Terminar sessão** ou **Reiniciar** o Windows.
3. Confirmar que o app **abre sozinho** (ou aparece na bandeja) após o login.

### 2.4 Notas

- Build **portable**: o caminho do `.exe` é fixo enquanto não moveres o ficheiro. Se mudares de pasta, o item de arranque pode deixar de funcionar até voltares a abrir o app nessa localização.
- Podes inspecionar o registo em `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run` (opcional; nomes dependem do Electron/AppUserModelId).

---

## 3. macOS

### 3.1 Preparar

1. Correr `npm run dist:mac` num Mac com Xcode Command Line Tools / ferramentas de assinatura conforme o teu pipeline.
2. Abrir o **DMG** e arrastar a aplicação para **Aplicações** (ou executar a partir do DMG para um teste rápido).

### 3.2 Verificar permissões (macOS Ventura ou superior)

1. **Ajustes do Sistema** → **Geral** → **Itens de início de sessão** (ou **Login Items**).
2. Confirmar que **CRM Radar** (ou o nome do bundle) aparece e está ativo.
3. Se o sistema pedir autorização na primeira vez, aceitar para permitir abrir ao iniciar sessão.

### 3.3 Teste funcional

1. Sair da aplicação com **Sair** (menu da bandeja).
2. **Terminar sessão** ou **Reiniciar**.
3. Após o login, verificar se a app **inicia** (janela e/ou ícone na barra de menus).

### 3.4 Notas

- Em builds **não assinados** ou fora da App Store, o Gatekeeper pode pedir confirmações na primeira execução — isso é independente do autostart.
- Se testares só com `npm start`, o item de login pode referir-se ao **Electron**, não ao `.app` final — preferir sempre o DMG/app empacotado.

---

## 4. Linux

### 4.1 Preparar

1. Gerar o pacote: `npm run dist:linux` numa máquina Linux (ou em CI).
2. Instalar o `.deb` (Debian/Ubuntu) ou `.rpm` (Fedora/RHEL), por exemplo:

```bash
sudo dpkg -i dist/*.deb
# ou
sudo rpm -i dist/*.rpm
```

3. Lançar o app **a partir do menu de aplicações** ou pelo executável instalado (caminho habitual sob `/opt/`, conforme o `productName` do electron-builder).

### 4.2 Verificar o ficheiro XDG (sem reiniciar)

Após a **primeira** execução do app empacotado:

```bash
ls -la ~/.config/autostart/br.com.farmarcas.crm-electron-app.desktop
cat ~/.config/autostart/br.com.farmarcas.crm-electron-app.desktop
```

Confirmar que:

- existe o ficheiro;
- a linha `Exec=` aponta para o binário real do app (o mesmo que `process.execPath` após instalação).

### 4.3 Teste funcional

1. Encerrar o app (menu **Sair** na bandeja).
2. **Terminar sessão** ou **Reiniciar** (ou só “Sair da sessão” num ambiente com autostart por sessão gráfica).
3. Voltar a entrar na sessão e confirmar que a aplicação **arranca** (ou fica na bandeja).

### 4.4 Script opcional (testes / TI)

O repositório inclui `scripts/linux-install-autostart.sh`; o build Linux copia-o para a pasta da aplicação como `linux-install-autostart.sh` (junto ao binário `crm-electron-app`). Faz o mesmo que o `main.js` em `~/.config/autostart/`, útil para testar sem depender do primeiro arranque do Electron:

```bash
chmod +x /opt/CRM\ Radar/linux-install-autostart.sh
/opt/CRM\ Radar/linux-install-autostart.sh
```

(O caminho `/opt/CRM Radar/` pode variar conforme o `productName` do electron-builder.)

Remover o autostart:

```bash
./linux-install-autostart.sh --remove
```

### 4.5 Notas

- Ambientes **Wayland** / **X11** com autostart XDG: o comportamento é o do teu ambiente de trabalho (GNOME, KDE, etc.).
- `npm start` **não** cria o `.desktop` de autostart (propositado).

---

## 5. Checklist rápido

- [ ] Build gerado no SO alvo (`dist:win` / `dist:mac` / `dist:linux`).
- [ ] App aberto **pelo menos uma vez** (empacotado).
- [ ] Windows/macOS: entrada visível em Definições de arranque / Login Items.
- [ ] Linux: ficheiro `~/.config/autostart/br.com.farmarcas.crm-electron-app.desktop` presente e `Exec=` correto.
- [ ] Reinício ou novo login: app volta a abrir sozinha (ou fica ativa na bandeja, conforme o desenho atual).

---

## 6. Problemas comuns

| Sintoma | O que verificar |
|--------|------------------|
| Linux: sem ficheiro em `autostart` | App não está empacotado (`npm start`); ou erro de permissão em `~/.config` (mensagem na consola se correres com `ELECTRON_ENABLE_LOGGING=1`). |
| macOS: não abre ao login | Itens de início de sessão desativados ou permissão negada; testar com build assinado/notarized se for política da empresa. |
| Windows portable não arranca após mover o `.exe` | Voltar a abrir o `.exe` na nova localização para atualizar o caminho, ou fixar o instalador num caminho estável. |

Para ver logs do processo principal no Electron:

```bash
ELECTRON_ENABLE_LOGGING=1 npm start
```

(Útil em Linux para a linha `Autostart Linux (XDG):`.)
