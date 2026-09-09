"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { handleBasket } = require("../../server/routes/basket");
const store = require("../../server/session-store");

const IDENTIFICACAO = {
  cnpj: "12345678000190",
  cpf: "12345678901",
  seller: { id: 42, name: "Ana Souza" }
};

const ITEM_A = {
  id: 8801, name: "Dipirona 500mg 20cp",
  quantity: 1, stock: 34, price: 12.9, ean: "7891234567890", sku: "DIP500"
};
const ITEM_B = {
  id: 4417, name: "Agua Micelar 200ml",
  quantity: 2, stock: 8, price: 34.5, ean: "7899876543210", sku: "AGU200"
};

const createResSpy = () => {
  const res = {
    status: null,
    headers: null,
    raw: null,
    writeHead(status, headers) {
      res.status = status;
      res.headers = headers ?? null;
    },
    end(chunk) {
      res.raw = chunk ?? null;
    },
    get body() {
      return res.raw === null ? null : JSON.parse(res.raw);
    }
  };
  return res;
};

const createLogSpy = () => {
  const calls = [];
  const record = (level) => (...args) => calls.push({ level, args });
  return {
    calls,
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error")
  };
};

const call = (body, options = {}) => {
  const res = createResSpy();
  const log = options.log || createLogSpy();
  handleBasket(body, res, { store, getMainWindow: () => null, logger: log });
  return { res, log };
};

beforeEach(() => store.reset());

describe("handleBasket - cesta registrada", () => {
  beforeEach(() => store.openSession(IDENTIFICACAO));

  it("responde 200 {ok:true} e registra", () => {
    const { res } = call({ sales_items: [ITEM_A] });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(store.getBasket().itemCount, 1);
  });

});

describe("handleBasket - sem atendimento aberto", () => {
  it("aceita, ignora em silencio e nao devolve erro ao PDV", () => {
    const { res } = call({ sales_items: [ITEM_A] });

    assert.equal(res.status, 200, "o PDV nao pode receber erro");
    assert.deepEqual(res.body, { ok: true });
    assert.equal(store.getBasket(), null);
  });

  it("responde exatamente igual ao caso com atendimento aberto", () => {
    const semSessao = call({ sales_items: [ITEM_A] });

    store.openSession(IDENTIFICACAO);
    const comSessao = call({ sales_items: [ITEM_A] });

    assert.equal(semSessao.res.status, comSessao.res.status);
    assert.equal(
      semSessao.res.raw,
      comSessao.res.raw,
      "respostas identicas impedem sondar se ha atendimento em curso"
    );
  });
});

describe("handleBasket - payload invalido", () => {
  beforeEach(() => store.openSession(IDENTIFICACAO));

  it("responde 422 invalid_payload com details", () => {
    const { res } = call({ sales_items: [{ ...ITEM_A, id: "8801" }] });

    assert.equal(res.status, 422);
    assert.equal(res.body.error, "invalid_payload");
    assert.ok(Array.isArray(res.body.details));
    assert.ok(res.body.details.some((d) => d.path === "sales_items[0].id"));
  });

  it("nao registra nada quando recusa", () => {
    call({ sales_items: [{}] });
    assert.equal(store.getBasket(), null);
  });

  it("nao apaga a cesta ja registrada ao recusar uma chamada invalida", () => {
    call({ sales_items: [ITEM_A] });
    call({ sales_items: [{ ...ITEM_B, price: "34,50" }] });

    assert.equal(store.getBasket().itemCount, 1);
    assert.deepEqual(store.getBasket().items.map((i) => i.id), [8801]);
  });

  it("recusa corpo vazio (server.js entrega {} quando nao ha corpo)", () => {
    const { res } = call({});

    assert.equal(res.status, 422);
    assert.deepEqual(res.body.details, [{ path: "sales_items", code: "required" }]);
  });
});

describe("handleBasket - a resposta nao vaza dado", () => {
  it("nunca devolve dado de cliente", () => {
    store.openSession(IDENTIFICACAO);
    const { res } = call({ sales_items: [ITEM_A] });

    assert.deepEqual(Object.keys(res.body), ["ok"]);
    assert.ok(!res.raw.includes("12345678901"), "nao pode conter CPF");
    assert.ok(!res.raw.includes("12345678000190"), "nao pode conter CNPJ");
    assert.ok(!res.raw.includes("Ana Souza"), "nao pode conter vendedor");
  });

  it("nao ecoa o valor recebido no 422", () => {
    store.openSession(IDENTIFICACAO);
    const cpfLike = "12345678901";

    const { res } = call({ sales_items: [{ ...ITEM_A, quantity: cpfLike }] });

    assert.equal(res.status, 422);
    assert.ok(!res.raw.includes(cpfLike), "o corpo do 422 nao pode ecoar o valor recebido");
  });
});

describe("handleBasket - log", () => {
  it("registra em debug com a contagem de itens e sem PII", () => {
    store.openSession(IDENTIFICACAO);
    const { log } = call({ sales_items: [ITEM_A, ITEM_B] });

    assert.equal(log.calls.length, 1);
    assert.equal(log.calls[0].level, "debug", "nunca em info: dispara a cada item bipado");
    assert.match(log.calls[0].args[0], /2 item/);

    const serialized = JSON.stringify(log.calls);
    assert.ok(!serialized.includes("12345678901"));
    assert.ok(!serialized.includes("Dipirona"));
  });

  it("registra em debug tambem quando ignora", () => {
    const { log } = call({ sales_items: [ITEM_A] });

    assert.equal(log.calls.length, 1);
    assert.equal(log.calls[0].level, "debug");
    assert.match(log.calls[0].args[0], /nenhum atendimento aberto/);
  });

  it("registra em warn quando recusa, sem PII", () => {
    store.openSession(IDENTIFICACAO);
    const cpfLike = "12345678901";

    const { log } = call({ sales_items: [{ ...ITEM_A, quantity: cpfLike }] });

    assert.equal(log.calls[0].level, "warn");
    assert.ok(!JSON.stringify(log.calls).includes(cpfLike));
  });

  it("nao quebra com logger sem debug", () => {
    store.openSession(IDENTIFICACAO);
    const res = createResSpy();

    assert.doesNotThrow(() =>
      handleBasket({ sales_items: [ITEM_A] }, res, {
        store,
        getMainWindow: () => null,
        logger: { warn() {}, info() {}, error() {} }
      })
    );
    assert.equal(res.status, 200);
  });
});

describe("handleBasket - nao altera a tela do operador", () => {
  it("nunca chama getMainWindow", () => {
    store.openSession(IDENTIFICACAO);
    let chamou = false;
    const res = createResSpy();

    handleBasket({ sales_items: [ITEM_A] }, res, {
      store,
      getMainWindow: () => {
        chamou = true;
        return null;
      },
      logger: createLogSpy()
    });

    assert.equal(chamou, false, "a Card 3 nao pode tocar na tela do operador");
  });

  it("funciona mesmo sem getMainWindow injetado", () => {
    store.openSession(IDENTIFICACAO);
    const res = createResSpy();

    assert.doesNotThrow(() =>
      handleBasket({ sales_items: [ITEM_A] }, res, { store, logger: createLogSpy() })
    );
    assert.equal(res.status, 200);
  });

  it("e sincrono (server.js chama o handler sem await)", () => {
    store.openSession(IDENTIFICACAO);
    const res = createResSpy();

    const returned = handleBasket({ sales_items: [ITEM_A] }, res, {
      store,
      getMainWindow: () => null,
      logger: createLogSpy()
    });

    assert.equal(returned, undefined);
    assert.equal(res.status, 200, "a resposta ja foi escrita quando o handler retorna");
  });
});
