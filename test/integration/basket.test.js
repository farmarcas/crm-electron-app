"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { createLocalServer } = require("../../server/server");
const { MAX_BODY_BYTES } = require("../../server/config");
const store = require("../../server/session-store");
const { getFreePort, request, closeServer } = require("../helpers/http-client");

const ITEM_A = {
  id: 8801, name: "Dipirona 500mg 20cp",
  quantity: 1, stock: 34, price: 12.9, ean: "7891234567890", sku: "DIP500"
};
const ITEM_B = {
  id: 4417, name: "Agua Micelar 200ml",
  quantity: 2, stock: 8, price: 34.5, ean: "7899876543210", sku: "AGU200"
};

const IDENTIFICACAO = {
  store: { cnpj: "12345678000190" },
  customer: { cpf: "12345678901" }
};

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
  // createLocalServer ja chama listen(), mas de forma assincrona: sem esperar,
  // a primeira requisicao pode chegar antes e levar ECONNREFUSED.
  if (!server.listening) {
    await new Promise((resolve) => server.once("listening", resolve));
  }
});

after(() => closeServer(server));

beforeEach(() => store.reset());

const postBasket = (json, extra = {}) => request({ port, path: "/basket", json, ...extra });
const postIdentificacao = (json) => request({ port, path: "/identification", json });

describe("integracao /basket - fluxo real do PDV", () => {
  it("identificacao seguida de cesta registra os itens", async () => {
    const ident = await postIdentificacao(IDENTIFICACAO);
    assert.equal(ident.status, 200);

    const res = await postBasket({ sales_items: [ITEM_A] });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(store.getBasket().itemCount, 1);
  });

  it("cada chamada SUBSTITUI a cesta anterior", async () => {
    await postIdentificacao(IDENTIFICACAO);

    await postBasket({ sales_items: [ITEM_A] });
    await postBasket({ sales_items: [ITEM_A, ITEM_B] });

    assert.equal(store.getBasket().itemCount, 2, "deve resultar em 2 itens, nao 3");
    assert.deepEqual(store.getBasket().items.map((i) => i.id), [8801, 4417]);
  });

  it("nova identificacao zera a cesta do cliente anterior", async () => {
    await postIdentificacao(IDENTIFICACAO);
    await postBasket({ sales_items: [ITEM_A, ITEM_B] });

    await postIdentificacao({
      store: { cnpj: "98765432000110" },
      customer: { cpf: "10987654321" }
    });

    assert.equal(store.getBasket(), null);
  });

  it("aceita cesta vazia", async () => {
    await postIdentificacao(IDENTIFICACAO);

    const res = await postBasket({ sales_items: [] });

    assert.equal(res.status, 200);
    assert.equal(store.getBasket().itemCount, 0);
  });
});

describe("integracao /basket - sem atendimento aberto", () => {
  it("responde 200 {ok:true} e nao registra nada", async () => {
    const res = await postBasket({ sales_items: [ITEM_A] });

    assert.equal(res.status, 200, "o PDV nao pode receber erro");
    assert.deepEqual(res.body, { ok: true });
    assert.equal(store.getBasket(), null);
  });

  it("responde byte a byte igual ao caso com atendimento aberto", async () => {
    const semSessao = await postBasket({ sales_items: [ITEM_A] });

    await postIdentificacao(IDENTIFICACAO);
    const comSessao = await postBasket({ sales_items: [ITEM_A] });

    assert.equal(semSessao.raw, comSessao.raw);
  });
});

describe("integracao /basket - payload invalido", () => {
  beforeEach(() => postIdentificacao(IDENTIFICACAO));

  it("recusa tipo invalido com 422 e details", async () => {
    const res = await postBasket({ sales_items: [{ ...ITEM_A, id: "8801" }] });

    assert.equal(res.status, 422);
    assert.equal(res.body.error, "invalid_payload");
    assert.ok(res.body.details.some((d) => d.path === "sales_items[0].id"));
  });

  // Campo obrigatorio ausente e o nao-vazamento do valor recebido sao regras do
  // validador, cobertas em unit/basket-schema.test.js. Aqui basta provar que o
  // 422 atravessa o servidor com os details intactos.
  it("recusa JSON malformado com 400 invalid_json", async () => {
    const res = await postBasket(undefined, { body: "{nao e json" });

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: "invalid_json" });
  });
});

describe("integracao /basket - guards de seguranca", () => {
  it("recusa requisicao com header Origin (403)", async () => {
    const res = await postBasket({ sales_items: [ITEM_A] }, {
      headers: { origin: "http://exemplo.local" }
    });

    assert.equal(res.status, 403);
  });

  it("recusa Host fora da allowlist (403)", async () => {
    const res = await postBasket({ sales_items: [ITEM_A] }, {
      headers: { host: "192.168.0.10:" + port }
    });

    assert.equal(res.status, 403);
  });

  it("recusa sem Content-Type application/json (415)", async () => {
    const res = await postBasket({ sales_items: [ITEM_A] }, {
      headers: { "content-type": "text/plain" }
    });

    assert.equal(res.status, 415);
  });

  it("recusa sem nenhum Content-Type (415)", async () => {
    const res = await postBasket({ sales_items: [ITEM_A] }, {
      headers: { "content-type": null }
    });

    assert.equal(res.status, 415);
  });

  for (const contentType of [
    "application/json; charset=utf-8",
    "application/json;charset=utf-8",
    "application/json ; charset=UTF-8",
    "APPLICATION/JSON"
  ]) {
    it(`aceita Content-Type "${contentType}"`, async () => {
      await postIdentificacao(IDENTIFICACAO);

      const res = await postBasket({ sales_items: [ITEM_A] }, {
        headers: { "content-type": contentType }
      });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { ok: true });
    });
  }

  it("recusa metodo diferente de POST (405)", async () => {
    const res = await request({ port, path: "/basket", method: "GET" });

    assert.equal(res.status, 405);
  });

  it("responde 404 em rota desconhecida", async () => {
    const res = await request({ port, path: "/carrinho", json: {} });

    assert.equal(res.status, 404);
  });

  it("recusa corpo acima do limite (413)", async () => {
    const items = Array.from({ length: 400 }, (_, i) => ({
      ...ITEM_A,
      id: i + 1,
      name: "x".repeat(190)
    }));
    const body = JSON.stringify({ sales_items: items });
    assert.ok(Buffer.byteLength(body) > MAX_BODY_BYTES, "o corpo do teste precisa estourar o limite");

    const res = await postBasket(undefined, { body });

    assert.equal(res.status, 413);
  });

  it("nao emite nenhum header CORS", async () => {
    await postIdentificacao(IDENTIFICACAO);
    const res = await postBasket({ sales_items: [ITEM_A] });

    const corsHeaders = Object.keys(res.headers).filter((h) =>
      h.toLowerCase().startsWith("access-control-")
    );
    assert.deepEqual(corsHeaders, []);
  });
});

describe("integracao /basket - normalizacao da URL", () => {
  it("aceita query string", async () => {
    await postIdentificacao(IDENTIFICACAO);

    const res = await request({ port, path: "/basket?origem=pdv", json: { sales_items: [ITEM_A] } });

    assert.equal(res.status, 200);
    assert.equal(store.getBasket().itemCount, 1);
  });

  it("aceita barra no final", async () => {
    await postIdentificacao(IDENTIFICACAO);

    const res = await request({ port, path: "/basket/", json: { sales_items: [ITEM_A] } });

    assert.equal(res.status, 200);
    assert.equal(store.getBasket().itemCount, 1);
  });

  it("aceita barra final e query string juntas", async () => {
    const res = await request({ port, path: "/basket/?origem=pdv", json: { sales_items: [] } });

    assert.equal(res.status, 200);
  });

  it("continua respondendo 404 em rota desconhecida, com ou sem barra", async () => {
    assert.equal((await request({ port, path: "/carrinho", json: {} })).status, 404);
    assert.equal((await request({ port, path: "/carrinho/", json: {} })).status, 404);
  });
});
