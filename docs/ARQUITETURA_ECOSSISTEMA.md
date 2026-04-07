# Arquitetura do Ecossistema CRM Radar

## Visão Geral

O **CRM Radar** é uma plataforma de CRM voltada aos associados da **Farmarcas**, com o objetivo de centralizar inteligência de dados de clientes e apoiar a operação das farmácias afiliadas em diferentes frentes — atendimento, fidelização, campanhas e gestão de relacionamento.

O produto está em construção incremental. O **MVP atual** entrega um único recurso: um painel lateral instalado no caixa da farmácia que exibe o histórico de compras e o perfil do cliente no momento do atendimento, identificado por CPF. Esse recurso valida a infraestrutura base da plataforma (autenticação de farmácia, tokenização de CPF, pipeline de dados e consentimento LGPD) e serve de fundação para os demais módulos que serão desenvolvidos.

### Roadmap de Recursos (planejados além do MVP)

Os recursos listados abaixo ainda não foram desenvolvidos. À medida que forem implementados, cada um terá sua própria documentação de arquitetura e será integrado à plataforma CRM Radar.

| Recurso | Descrição |
|---------|-----------|
| Painel do associado | Visão consolidada de desempenho da farmácia (ticket médio, recorrência, mix de produtos) |
| Campanhas segmentadas | Criação e disparo de campanhas personalizadas por perfil de cliente (DNA tags) |
| Fidelização | Programa de pontos e benefícios vinculado ao histórico de compras |
| Alertas e notificações | Notificação proativa ao operador sobre oportunidades de cross-sell ou recompra |
| Gestão de consentimento | Painel para gerenciar e auditar consentimentos LGPD dos clientes |
| Integração com ERP/PDV | Conexão direta com sistemas de frente de caixa dos associados |

---

### Arquitetura do MVP

O MVP é composto por três repositórios independentes que operam em camadas distintas:

```
┌─────────────────────────────────────────────────────────────────┐
│                       Operador de Caixa (PDV)                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                    crm-electron-app                              │
│          Janela lateral fixada (400px, lado direito)             │
│          Processo principal Electron + Tray + Auto-update        │
└───────────────────────────────┬─────────────────────────────────┘
                                │ WebView (loadURL)
┌───────────────────────────────▼─────────────────────────────────┐
│                    crm-frontend-app                              │
│          Angular 17 + SSR (Express) hospedado na AWS Amplify     │
│          Interface de consulta por CPF e exibição de histórico   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS (API Gateway)
┌───────────────────────────────▼─────────────────────────────────┐
│                    crm-services-api                              │
│          AWS Lambda + API Gateway (Serverless Framework)         │
│          Endpoints de perfil, histórico e produtos do cliente    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Repositórios

### 1. `crm-electron-app` — Shell nativo do PDV

**Papel:** Contêiner nativo que entrega a WebView ao operador. Não contém lógica de negócio.

**Stack:** Electron 31, Electron Builder 26, Node.js

**Comportamento principal:**
- Cria uma `BrowserWindow` de largura fixa (400px) ancorada no canto direito da área útil da tela (`workArea`), cobrindo toda a altura disponível.
- Carrega via `loadURL` a URL do `crm-frontend-app` hospedada na Amplify (`SUGGESTIONS_URL`).
- Reside na bandeja do sistema (system tray); fechar a janela apenas a oculta — o processo continua ativo.
- Configura inicialização automática no login do sistema operacional (`setLoginItemSettings` no Windows/macOS; arquivo `.desktop` XDG no Linux).
- Verifica e aplica atualizações automáticas via `electron-updater` a cada 60 segundos quando empacotado.

**Segurança:**
- `contextIsolation: true` e `nodeIntegration: false` são imutáveis.
- O `preload.js` expõe apenas `window.appInfo` (plataforma e versões) via `contextBridge`.
- Nenhum dado de negócio trafega pelo processo principal do Electron.

**Distribuição:**
| Plataforma | Formato        |
|------------|----------------|
| Windows    | Portable EXE   |
| macOS      | DMG            |
| Linux      | DEB + RPM      |

Releases são publicadas automaticamente via GitHub Actions ao criar uma tag com prefixo `v` (ex.: `v0.0.28`).

---

### 2. `crm-frontend-app` — Interface do operador

**Papel:** SPA Angular renderizada dentro da WebView do Electron. É a camada de apresentação e de interação do operador.

**Stack:** Angular 17 (standalone components), TypeScript, SCSS, Tailwind CSS 3, SSR com Express, hospedado na AWS Amplify.

**Fluxo de uso:**
1. Operador informa o CPF do cliente no campo com máscara `000.000.000-00`.
2. O frontend valida o CPF e o consentimento LGPD antes de disparar qualquer requisição.
3. Chama os endpoints do `crm-services-api` com o CPF tokenizado (`cpf_token`) e headers de autenticação de farmácia.
4. Exibe os resultados em estados bem definidos: `Idle → Loading → OK | Fallback | Erro | Timeout`.

**Organização de código:**
```
src/app/
  core/         # modelos, constantes, serviços base (analytics, toast)
  features/
    auth/          # autenticação da farmácia
    consultation/  # entrada de CPF e disparo de busca
    details/       # exibição de histórico e sugestões
  shared/       # componentes reutilizáveis (loading, toast, etc.)
```

**Regras de privacidade aplicadas no frontend:**
- CPF não é registrado em claro no console.
- Fora do campo de edição, o CPF é exibido com máscara parcial.
- A busca só ocorre com CPF válido **e** consentimento ativo.

---

### 3. `crm-services-api` — Backend serverless

**Papel:** Camada de dados. Fornece os endpoints HTTP que o `crm-frontend-app` consome para buscar informações do cliente.

**Stack:** Node.js 18, TypeScript, Serverless Framework, AWS Lambda, AWS API Gateway, AWS SQS FIFO, AWS Athena.

**Endpoints expostos via API Gateway:**

| Método | Caminho                     | Lambda handler                                       | Descrição                              |
|--------|-----------------------------|------------------------------------------------------|----------------------------------------|
| POST   | `/v1/customer/top-products` | `customer/top-products.handler`                      | Produtos mais comprados pelo cliente   |
| POST   | `/v1/customer/product-history` | `customer/product-history.handler`                | Histórico detalhado de compras         |
| POST   | `/v1/customer/profile`      | `customer/profile.handler`                           | Perfil e `dna_tags` do cliente         |
| POST   | `/pharmacy/authenticate`    | `pharmacy/authenticate.handler`                      | Autenticação da farmácia (gera token)  |

**Autenticação de farmácia:**

Todos os endpoints de cliente exigem os seguintes headers:

```
Authorization: Bearer <token>
x-ge: <grupo-econômico>
x-farmacia: <identificador-da-farmácia>
x-pharmacy-fingerprint: <fingerprint>
```

O token é gerado pelo endpoint `/pharmacy/authenticate`, assinado com `PHARMACY_TOKEN_SECRET` e vinculado ao fingerprint da sessão.

**Resiliência:**
- Timeout configurável por variável de ambiente (`INSIGHTS_TIMEOUT_MS`, `INSIGHTS_GLOBAL_TIMEOUT_MS`).
- Modo degradado (`INSIGHTS_HISTORY_MODE`, `INSIGHTS_DNA_MODE`) para não bloquear o PDV em caso de falha parcial.
- Cache com TTL configurável via Redis (`INSIGHTS_REDIS_URL`) para reduzir latência em consultas repetidas.
- Idempotência por `idempotency_key` para evitar reprocessamento duplicado.

**Infraestrutura AWS:**
- Lambdas com timeout máximo de 29s (endpoints síncronos) e 900s (consumers SQS).
- SQS FIFO para ingestão assíncrona de eventos (ocorrências, notas fiscais).
- Athena para queries sobre histórico de compras (encapsulado em helper de polling).
- IAM com `sts:AssumeRole` para acesso cross-account quando necessário.

---

## Fluxo de Dados Completo

```
Operador digita CPF no PDV
        │
        ▼
crm-frontend-app valida CPF + consentimento
        │
        ▼
POST /v1/customer/top-products   ─┐
POST /v1/customer/product-history ─┤── API Gateway → Lambda → Athena/DB
POST /v1/customer/profile        ─┘
        │
        ▼
Frontend renderiza histórico e sugestões
        │
        ▼
Operador visualiza no painel lateral (Electron WebView)
```

---

## Comunicação entre os Repositórios

| De                   | Para                 | Protocolo      | Autenticação                          |
|----------------------|----------------------|----------------|---------------------------------------|
| `crm-electron-app`   | `crm-frontend-app`   | WebView/HTTPS  | Nenhuma (URL pública da Amplify)      |
| `crm-frontend-app`   | `crm-services-api`   | HTTPS REST     | Bearer token + headers `x-ge`, `x-farmacia`, `x-pharmacy-fingerprint` |

---

## Deploy e Ambientes

| Componente           | Ambiente         | Hospedagem           |
|----------------------|------------------|----------------------|
| `crm-electron-app`   | Instalado no PDV | GitHub Releases      |
| `crm-frontend-app`   | develop / prod   | AWS Amplify          |
| `crm-services-api`   | dev / prod       | AWS Lambda via Serverless Framework |

O `crm-electron-app` aponta para a URL do ambiente desejado via a constante `SUGGESTIONS_URL` em `main.js`. Para trocar de ambiente, basta atualizar essa constante e publicar uma nova release.

---

## Considerações de Segurança e LGPD

- O CPF nunca trafega em claro nos logs do Electron ou do frontend.
- O backend recebe apenas o `cpf_token` (hash/tokenização), não o CPF original.
- O consentimento (`consent.granted`, `consent.captured_at`, `consent.source`, `consent.term_version`) é obrigatório no contrato da API de insights.
- A WebView do Electron não possui acesso às APIs nativas do Node.js (`nodeIntegration: false`).
