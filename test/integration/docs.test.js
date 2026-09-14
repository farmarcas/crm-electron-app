"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createLocalServer } = require("../../server/server");
const store = require("../../server/session-store");
const { getFreePort, request, closeServer } = require("../helpers/http-client");

const SPEC_FILE = path.join(__dirname, "..", "..", "docs", "api", "openapi.yaml");
const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

const DOCS_PATHS = [
  "/docs",
  "/docs/init.js",
  "/docs/openapi.yaml",
  "/docs/swagger-ui-bundle.js",
  "/docs/swagger-ui.css"
];

let server;
let port;

before(async () => {
  port = await getFreePort();
  server = createLocalServer({
    port,
    allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`],
    store,
    getMainWindow: () => null,
    logger: silentLogger
  });
  if (!server.listening) {
    await new Promise((resolve) => server.once("listening", resolve));
  }
});

after(() => closeServer(server));

beforeEach(() => store.reset());

const get = (caminho, headers = {}) =>
  request({ port, path: caminho, method: "GET", headers: { "content-type": null, ...headers } });

const parseCsp = (header) =>
  Object.fromEntries(
    String(header || "")
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [nome, ...valores] = d.split(/\s+/);
        return [nome, valores];
      })
  );

describe("GET /docs - pagina", () => {
  it("serve o Swagger UI", async () => {
    const res = await get("/docs");

    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /^text\/html/);
    assert.ok(res.raw.includes('<div id="swagger-ui">'));
    assert.ok(res.raw.includes('src="/docs/swagger-ui-bundle.js"'));
    assert.ok(res.raw.includes('src="/docs/init.js"'));
  });

  it("nao tem script inline (a CSP nao libera unsafe-inline para script)", async () => {
    const res = await get("/docs");
    const scripts = res.raw.match(/<script[^>]*>/g) || [];

    assert.ok(scripts.length > 0);
    assert.ok(scripts.every((tag) => tag.includes("src=")), "todo script precisa vir de arquivo");
  });

  it("aceita barra no final", async () => {
    assert.equal((await get("/docs/")).status, 200);
  });

  it("abre mesmo com header Origin", async () => {
    const res = await get("/docs", { origin: `http://127.0.0.1:${port}` });
    assert.equal(res.status, 200);
  });
});

describe("GET /docs - arquivos", () => {
  it("serve a especificacao identica ao arquivo do repositorio", async () => {
    const res = await get("/docs/openapi.yaml");

    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /yaml/);
    assert.equal(res.raw, fs.readFileSync(SPEC_FILE, "utf8"));
  });

  it("inicializa o Swagger UI com as protecoes esperadas", async () => {
    const res = await get("/docs/init.js");

    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /javascript/);
    for (const trecho of [
      'url: "/docs/openapi.yaml"',
      "queryConfigEnabled: false",
      "validatorUrl: null",
      "requestInterceptor"
    ]) {
      assert.ok(res.raw.includes(trecho), `init.js deveria conter ${trecho}`);
    }
  });

  it("serve os arquivos do Swagger UI", async () => {
    const js = await get("/docs/swagger-ui-bundle.js");
    assert.equal(js.status, 200);
    assert.match(js.headers["content-type"], /javascript/);
    assert.ok(js.raw.length > 100000, "o bundle do Swagger UI parece incompleto");

    const css = await get("/docs/swagger-ui.css");
    assert.equal(css.status, 200);
    assert.match(css.headers["content-type"], /css/);
  });
});

describe("GET /docs - cabecalhos de seguranca", () => {
  for (const caminho of DOCS_PATHS) {
    it(`${caminho} nao pode ser embutido nem executar script de fora`, async () => {
      const res = await get(caminho);
      const csp = parseCsp(res.headers["content-security-policy"]);

      assert.equal(res.headers["x-frame-options"], "DENY");
      assert.equal(res.headers["x-content-type-options"], "nosniff");
      assert.deepEqual(csp["frame-ancestors"], ["'none'"]);
      assert.deepEqual(csp["script-src"], ["'self'"]);
      assert.deepEqual(csp["connect-src"], ["'self'"]);
    });
  }

  it("nao emite header CORS", async () => {
    const res = await get("/docs");
    const cors = Object.keys(res.headers).filter((h) => h.startsWith("access-control-"));
    assert.deepEqual(cors, []);
  });
});

describe("GET /docs - recusas", () => {
  it("caminho desconhecido dentro de /docs responde 404", async () => {
    assert.equal((await get("/docs/nao-existe.js")).status, 404);
  });

  it("metodo diferente de GET responde 405", async () => {
    const res = await request({ port, path: "/docs", method: "POST", json: {} });
    assert.equal(res.status, 405);
  });

  it("Host fora da allowlist responde 403", async () => {
    const res = await get("/docs", { host: `192.168.0.10:${port}` });
    assert.equal(res.status, 403);
  });
});

describe("GET /docs - arquivo do Swagger UI ausente no pacote", () => {
  let semAssets;
  let portaSemAssets;
  const erros = [];

  before(async () => {
    portaSemAssets = await getFreePort();
    semAssets = createLocalServer({
      port: portaSemAssets,
      allowedHosts: [`127.0.0.1:${portaSemAssets}`],
      store,
      getMainWindow: () => null,
      logger: { ...silentLogger, error: (...args) => erros.push(args.join(" ")) },
      resolveDocsAsset: (file) => {
        const err = new Error(`Cannot find module 'swagger-ui-dist/${file}'`);
        err.code = "MODULE_NOT_FOUND";
        throw err;
      }
    });
    if (!semAssets.listening) {
      await new Promise((resolve) => semAssets.once("listening", resolve));
    }
  });

  after(() => closeServer(semAssets));

  it("o arquivo ausente responde 500 sem corpo e registra o erro", async () => {
    const res = await request({
      port: portaSemAssets,
      path: "/docs/swagger-ui-bundle.js",
      method: "GET",
      headers: { "content-type": null }
    });

    assert.equal(res.status, 500);
    assert.equal(res.raw, "");
    assert.ok(erros.some((e) => e.includes("documentação indisponível")));
  });

  it("a API continua atendendo o PDV", async () => {
    const ident = await request({
      port: portaSemAssets,
      path: "/identification",
      json: { store: { cnpj: "12345678000190" }, customer: { cpf: "12345678901" } }
    });
    assert.equal(ident.status, 200);

    const cesta = await request({
      port: portaSemAssets,
      path: "/basket",
      json: {
        sales_items: [{
          id: 8801, name: "Dipirona 500mg 20cp",
          quantity: 1, stock: 34, price: 12.9, ean: "7891234567890", sku: "DIP500"
        }]
      }
    });
    assert.equal(cesta.status, 200);
    assert.equal(store.getBasket().itemCount, 1);
  });
});

describe("Try it out - chamadas da mesma origem", () => {
  const IDENTIFICACAO = { store: { cnpj: "12345678000190" }, customer: { cpf: "12345678901" } };
  const ITEM = {
    id: 8801, name: "Dipirona 500mg 20cp",
    quantity: 1, stock: 34, price: 12.9, ean: "7891234567890", sku: "DIP500"
  };

  it("identificacao enviada pela pagina abre o atendimento", async () => {
    const res = await request({
      port,
      path: "/identification",
      json: IDENTIFICACAO,
      headers: { origin: `http://127.0.0.1:${port}` }
    });

    assert.equal(res.status, 200);
    assert.equal(store.getCurrentSession().customer.cpf, "12345678901");
  });

  it("cesta enviada pela pagina e registrada", async () => {
    const origin = `http://127.0.0.1:${port}`;
    await request({ port, path: "/identification", json: IDENTIFICACAO, headers: { origin } });

    const res = await request({ port, path: "/basket", json: { sales_items: [ITEM] }, headers: { origin } });

    assert.equal(res.status, 200);
    assert.equal(store.getBasket().itemCount, 1);
  });

  it("funciona tambem com a pagina aberta por localhost", async () => {
    const res = await request({
      port,
      path: "/identification",
      json: IDENTIFICACAO,
      headers: { host: `localhost:${port}`, origin: `http://localhost:${port}` }
    });

    assert.equal(res.status, 200);
  });
});
