"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

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

// O store e um singleton de modulo, entao cada teste precisa comecar limpo.
beforeEach(() => store.reset());

describe("session-store - sem sessao aberta", () => {
  it("ignora a cesta e nao lanca", () => {
    const outcome = store.setBasket([ITEM_A]);

    assert.deepEqual(outcome, { status: "ignored", reason: "no_open_session" });
    assert.equal(store.getBasket(), null);
  });

  it("ignora tambem a cesta vazia", () => {
    assert.equal(store.setBasket([]).status, "ignored");
    assert.equal(store.getBasket(), null);
  });

  it("getCurrentSession devolve null", () => {
    assert.equal(store.getCurrentSession(), null);
  });
});

describe("session-store - com sessao aberta", () => {
  beforeEach(() => store.openSession(IDENTIFICACAO));

  it("registra a cesta", () => {
    const outcome = store.setBasket([ITEM_A, ITEM_B]);

    assert.deepEqual(outcome, { status: "stored", itemCount: 2 });
    assert.equal(store.getBasket().itemCount, 2);
  });

  it("SUBSTITUI a cesta anterior em vez de acumular", () => {
    store.setBasket([ITEM_A]);
    store.setBasket([ITEM_A, ITEM_B]);

    const basket = store.getBasket();
    assert.equal(basket.itemCount, 2, "deve resultar em 2 itens, nao 3");
    assert.deepEqual(basket.items.map((i) => i.id), [8801, 4417]);
  });

  it("aceita cesta vazia, esvaziando o registro", () => {
    store.setBasket([ITEM_A, ITEM_B]);

    const outcome = store.setBasket([]);

    assert.deepEqual(outcome, { status: "stored", itemCount: 0 });
    assert.deepEqual(store.getBasket().items, []);
  });

  it("guarda a cesta dentro da sessao", () => {
    store.setBasket([ITEM_A]);
    assert.equal(store.getCurrentSession().basket, store.getBasket());
  });

  it("preserva todos os campos do item", () => {
    store.setBasket([ITEM_A]);
    assert.deepEqual(store.getBasket().items[0], ITEM_A);
  });

  it("congela a cesta, a lista e cada item", () => {
    store.setBasket([ITEM_A]);
    const basket = store.getBasket();

    assert.ok(Object.isFrozen(basket));
    assert.ok(Object.isFrozen(basket.items));
    assert.ok(Object.isFrozen(basket.items[0]));
  });

  it("nao retem o array do chamador", () => {
    const items = [{ ...ITEM_A }];
    store.setBasket(items);

    items.push({ ...ITEM_B });
    items[0].quantity = 999;

    assert.equal(store.getBasket().itemCount, 1);
    assert.equal(store.getBasket().items[0].quantity, 1);
  });
});

describe("session-store - ciclo de vida da sessao", () => {
  it("nova identificacao zera a cesta do cliente anterior", () => {
    store.openSession(IDENTIFICACAO);
    store.setBasket([ITEM_A]);

    store.openSession({ cnpj: "98765432000110", cpf: "10987654321" });

    assert.equal(
      store.getBasket(),
      null,
      "atendimento novo nao pode herdar a cesta do cliente anterior"
    );
  });

  it("a cesta do cliente novo nao mistura com a do anterior", () => {
    store.openSession(IDENTIFICACAO);
    store.setBasket([ITEM_A, ITEM_B]);

    store.openSession({ cnpj: "98765432000110", cpf: "10987654321" });
    store.setBasket([ITEM_B]);

    assert.deepEqual(store.getBasket().items.map((i) => i.id), [4417]);
  });

  it("abre sessao sem vendedor", () => {
    const session = store.openSession({ cnpj: "12345678000190", cpf: "12345678901" });

    assert.equal(session.seller, null);
    assert.equal(store.setBasket([ITEM_A]).status, "stored");
  });

  it("guarda o vendedor quando enviado, sem le-lo", () => {
    const session = store.openSession(IDENTIFICACAO);
    assert.deepEqual(session.seller, { id: 42, name: "Ana Souza" });
  });

  it("encerrar a sessao zera a cesta e passa a ignorar", () => {
    store.openSession(IDENTIFICACAO);
    store.setBasket([ITEM_A]);

    store.closeSession();

    assert.equal(store.getBasket(), null);
    assert.equal(store.setBasket([ITEM_A]).status, "ignored");
  });

  it("closeSession e no-op sem sessao aberta", () => {
    assert.doesNotThrow(() => store.closeSession());
    assert.equal(store.getCurrentSession(), null);
  });
});
