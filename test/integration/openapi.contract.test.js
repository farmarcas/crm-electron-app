"use strict";

// Contrato entre a especificacao entregue ao fornecedor e o codigo: falha
// quando um muda sem o outro.

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const { minimatch } = require("minimatch");

const { ITEM_FIELDS, MAX_ITEMS, validateBasket } = require("../../server/basket-schema");
const { SWAGGER_UI_FILES } = require("../../server/docs");
const config = require("../../server/config");
const routes = require("../../server/routes");
const { createLocalServer } = require("../../server/server");
const store = require("../../server/session-store");
const { getFreePort, request, closeServer } = require("../helpers/http-client");
const pkg = require("../../package.json");

const ROOT = path.join(__dirname, "..", "..");
const SPEC_TEXT = fs.readFileSync(path.join(ROOT, "docs", "api", "openapi.yaml"), "utf8");
const COLLECTION_TEXT = fs.readFileSync(
  path.join(ROOT, "docs", "api", "CRM-Radar-PDV.postman_collection.json"),
  "utf8"
);
const MANUAL_TEXT = fs.readFileSync(path.join(ROOT, "docs", "api", "MANUAL-INTEGRACAO-PDV.md"), "utf8");
const spec = YAML.parse(SPEC_TEXT);
const { schemas } = spec.components;

const resolveRef = (node) =>
  node && node.$ref
    ? node.$ref.replace(/^#\//, "").split("/").reduce((acc, key) => acc[key], spec)
    : node;

const OPERATIONS = Object.entries(spec.paths).map(([caminho, item]) => ({ caminho, op: item.post }));

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

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

describe("especificacao - estrutura", () => {
  it("e OpenAPI 3.0", () => {
    assert.match(spec.openapi, /^3\.0\./);
  });

  it("aponta para o endereco e a porta do servico", () => {
    const url = new URL(spec.servers[0].url);
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(Number(url.port), config.PORT);
  });

  it("documenta exatamente as rotas que a API atende", () => {
    assert.deepEqual(Object.keys(spec.paths).sort(), [...routes.keys()].sort());
    for (const { caminho, op } of OPERATIONS) assert.ok(op, `${caminho} precisa documentar POST`);
  });

  for (const { caminho, op } of OPERATIONS) {
    it(`${caminho} documenta todos os status que a API produz`, () => {
      assert.deepEqual(
        Object.keys(op.responses).sort(),
        ["200", "400", "403", "405", "413", "415", "422", "500"]
      );
    });

    it(`${caminho} descreve as respostas sem corpo como sem corpo`, () => {
      for (const status of ["403", "405", "413", "415", "500"]) {
        assert.equal(resolveRef(op.responses[status]).content, undefined, `${status} nao tem corpo na API`);
      }
    });
  }
});

describe("especificacao x codigo - itens da cesta", () => {
  const item = schemas.SalesItem;

  it("tem os mesmos campos de ITEM_FIELDS", () => {
    assert.deepEqual(Object.keys(item.properties).sort(), Object.keys(ITEM_FIELDS).sort());
  });

  it("marca como obrigatorios os mesmos campos", () => {
    const obrigatorios = Object.keys(ITEM_FIELDS).filter((c) => ITEM_FIELDS[c].required);
    assert.deepEqual([...item.required].sort(), obrigatorios.sort());
  });

  for (const [campo, regra] of Object.entries(ITEM_FIELDS)) {
    it(`campo ${campo}: tipo e limites iguais aos do validador`, () => {
      const prop = item.properties[campo];
      assert.equal(prop.type, regra.type);
      if (regra.type === "string") {
        assert.equal(prop.minLength, regra.min);
        assert.equal(prop.maxLength, regra.max);
      } else {
        assert.equal(prop.minimum, regra.min);
        assert.equal(prop.maximum, regra.max);
      }
    });
  }

  it("aceita campos desconhecidos, como o validador", () => {
    assert.equal(item.additionalProperties, true);
  });

  it("limita a quantidade de itens como o validador", () => {
    assert.equal(schemas.BasketRequest.properties.sales_items.maxItems, MAX_ITEMS);
  });
});

describe("especificacao x codigo - codigos do 422", () => {
  it("lista exatamente os codigos que o validador produz", () => {
    const base = { id: 1, name: "a", quantity: 1, stock: 1, price: 1, ean: "1", sku: "a" };
    const produzidos = new Set();
    const coletar = (body) => {
      const r = validateBasket(body);
      if (!r.ok) r.errors.forEach((e) => produzidos.add(e.code));
    };

    coletar({});
    coletar({ sales_items: [{ ...base, id: "x" }] });
    coletar({ sales_items: [{ ...base, id: 1.5 }] });
    coletar({ sales_items: [{ ...base, sku: "" }] });
    coletar({ sales_items: [{ ...base, name: "x".repeat(ITEM_FIELDS.name.max + 1) }] });
    coletar({ sales_items: [{ ...base, quantity: -1 }] });
    coletar({ sales_items: Array(MAX_ITEMS + 1).fill(base) });
    coletar({ sales_items: ["x"] });

    assert.deepEqual([...schemas.ValidationDetail.properties.code.enum].sort(), [...produzidos].sort());
  });
});

describe("especificacao x comportamento - vendedor", () => {
  const seller = schemas.Seller.properties;
  const idTexto = seller.id.oneOf.find((s) => s.type === "string");

  const identificar = (vendedor) =>
    request({
      port,
      path: "/identification",
      json: { store: { cnpj: "12345678000190" }, customer: { cpf: "12345678901" }, seller: vendedor }
    });

  it("aceita id inteiro", async () => {
    assert.ok(seller.id.oneOf.some((s) => s.type === "integer"));
    await identificar({ id: 42 });
    assert.equal(store.getCurrentSession().seller.id, 42);
  });

  it("limite do id em texto e o mesmo da spec", async () => {
    await identificar({ id: "x".repeat(idTexto.maxLength) });
    assert.equal(store.getCurrentSession().seller.id.length, idTexto.maxLength);

    await identificar({ id: "x".repeat(idTexto.maxLength + 1) });
    assert.equal(store.getCurrentSession().seller, null);
  });

  it("limites do nome sao os mesmos da spec", async () => {
    await identificar({ name: "a".repeat(seller.name.maxLength) });
    assert.equal(store.getCurrentSession().seller.name.length, seller.name.maxLength);

    await identificar({ name: "a".repeat(seller.name.maxLength + 1) });
    assert.equal(store.getCurrentSession().seller, null);

    await identificar({ name: "a".repeat(seller.name.minLength - 1) });
    assert.equal(store.getCurrentSession().seller, null);
  });
});

describe("especificacao x comportamento - exemplos", () => {
  for (const { caminho, op } of OPERATIONS) {
    const exemplos = op.requestBody.content["application/json"].examples;

    for (const [nome, exemplo] of Object.entries(exemplos)) {
      const status = exemplo["x-expected-status"];

      it(`${caminho} - exemplo "${nome}" responde ${status} com o corpo documentado`, async () => {
        assert.ok(status, "todo exemplo precisa declarar x-expected-status");

        const res = await request({ port, path: caminho, json: exemplo.value });
        assert.equal(res.status, status);

        const documentado = resolveRef(op.responses[String(status)]).content["application/json"].example;
        assert.deepEqual(res.body, documentado);
      });
    }
  }
});

describe("documentos para o fornecedor - sem detalhe interno", () => {
  const PROIBIDOS = [
    /\bnpm\b/i, /electron/i, /node\.js/i, /server\//i, /main\.js/i, /preload/i,
    /angular/i, /amplify/i, /webcontents/i, /\bipc\b/i, /\bcard \d/i, /terminal/i,
    /session-store/i, /basket-schema/i
  ];

  for (const [nome, texto] of [
    ["especificacao", SPEC_TEXT],
    ["collection do Postman", COLLECTION_TEXT],
    ["manual de integracao", MANUAL_TEXT]
  ]) {
    it(`${nome} nao expoe detalhe interno`, () => {
      const achados = PROIBIDOS.filter((re) => re.test(texto)).map(String);
      assert.deepEqual(achados, []);
    });
  }

  it("manual de integracao nao tem comentario HTML", () => {
    assert.ok(!MANUAL_TEXT.includes("<!--"));
  });
});

describe("empacotamento", () => {
  it("build.files inclui a especificacao servida em /docs", () => {
    assert.ok(
      pkg.build.files.includes("docs/api/openapi.yaml"),
      "fora do build.files, o app instalado fica sem a especificacao"
    );
  });

  // O electron-builder empacota toda dependencia de producao automaticamente;
  // so exclusoes explicitas tiram do instalador o que o /docs nao usa.
  for (const exclusao of ["!node_modules/swagger-ui-dist/**/*.map", "!node_modules/@scarf/**"]) {
    it(`build.files exclui ${exclusao.slice(1)}`, () => {
      assert.ok(pkg.build.files.includes(exclusao));
    });
  }

  it("nenhuma exclusao atinge os arquivos que o /docs serve", () => {
    const exclusoes = pkg.build.files.filter((p) => p.startsWith("!")).map((p) => p.slice(1));
    const necessarios = [
      ...Object.values(SWAGGER_UI_FILES).map((a) => a.file),
      "package.json",
      "LICENSE",
      "NOTICE"
    ].map((file) => `node_modules/swagger-ui-dist/${file}`);

    const atingidos = necessarios.flatMap((arquivo) =>
      exclusoes.filter((glob) => minimatch(arquivo, glob, { dot: true })).map((glob) => `${arquivo} <- !${glob}`)
    );
    assert.deepEqual(atingidos, []);
  });

  it("swagger-ui-dist fixado em versao exata", () => {
    assert.match(pkg.dependencies["swagger-ui-dist"], /^\d+\.\d+\.\d+$/);
  });

  it("telemetria do Scarf desligada", () => {
    assert.equal(pkg.scarfSettings && pkg.scarfSettings.enabled, false);
  });
});
