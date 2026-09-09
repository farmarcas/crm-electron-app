"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  ITEM_FIELDS,
  MAX_ITEMS,
  validateBasket
} = require("../../server/basket-schema");

const ITEM_A = {
  id: 8801, name: "Dipirona 500mg 20cp",
  quantity: 1, stock: 34, price: 12.9, ean: "7891234567890", sku: "DIP500"
};
const ITEM_B = {
  id: 4417, name: "Agua Micelar 200ml",
  quantity: 2, stock: 8, price: 34.5, ean: "7899876543210", sku: "AGU200"
};

const FIELD_NAMES = Object.keys(ITEM_FIELDS);

const WRONG_VALUES_BY_TYPE = {
  integer: [
    ["string numerica", "8801"],
    ["decimal", 8801.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY]
  ],
  number: [
    ["string com virgula decimal", "12,90"],
    ["string numerica", "12.90"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY]
  ],
  string: [["numero", 123]]
};

const errorAt = (result, path) => result.errors.find((e) => e.path === path);

describe("basket-schema - payload valido", () => {
  it("aceita uma cesta com um item", () => {
    const result = validateBasket({ sales_items: [ITEM_A] });

    assert.equal(result.ok, true);
    assert.deepEqual(result.value.sales_items, [ITEM_A]);
  });

  it("aceita uma cesta com varios itens, preservando a ordem", () => {
    const result = validateBasket({ sales_items: [ITEM_A, ITEM_B] });

    assert.equal(result.ok, true);
    assert.deepEqual(result.value.sales_items.map((i) => i.id), [8801, 4417]);
  });

  it("aceita cesta vazia (operador limpou a cesta)", () => {
    const result = validateBasket({ sales_items: [] });

    assert.equal(result.ok, true);
    assert.deepEqual(result.value.sales_items, []);
  });

  it("aceita cesta no teto de itens", () => {
    const items = Array.from({ length: MAX_ITEMS }, () => ({ ...ITEM_A }));
    assert.equal(validateBasket({ sales_items: items }).ok, true);
  });

  it("remove chaves desconhecidas em vez de recusar", () => {
    const result = validateBasket({
      sales_items: [{ ...ITEM_A, campo_futuro_do_pdv: "x", desconto: 1.5 }]
    });

    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(result.value.sales_items[0]).sort(), FIELD_NAMES.slice().sort());
  });

  it("aceita quantity e stock zerados", () => {
    assert.equal(validateBasket({ sales_items: [{ ...ITEM_A, quantity: 0, stock: 0 }] }).ok, true);
  });

  it("aceita estoque negativo (alguns ERPs enviam)", () => {
    assert.equal(validateBasket({ sales_items: [{ ...ITEM_A, stock: -3 }] }).ok, true);
  });

  it("aceita price inteiro", () => {
    assert.equal(validateBasket({ sales_items: [{ ...ITEM_A, price: 12 }] }).ok, true);
  });

});

describe("basket-schema - campos obrigatorios ausentes", () => {
  for (const field of FIELD_NAMES) {
    if (!ITEM_FIELDS[field].required) continue;

    it("recusa item sem " + field, () => {
      const item = { ...ITEM_A };
      delete item[field];

      const result = validateBasket({ sales_items: [item] });

      assert.equal(result.ok, false);
      assert.deepEqual(errorAt(result, "sales_items[0]." + field), {
        path: "sales_items[0]." + field,
        code: "required"
      });
    });
  }

  // null e undefined caem no mesmo isAbsent, entao um representante basta.
  it("trata null como campo ausente", () => {
    const result = validateBasket({ sales_items: [{ ...ITEM_A, sku: null }] });

    assert.equal(result.ok, false);
    assert.equal(errorAt(result, "sales_items[0].sku").code, "required");
  });
});

describe("basket-schema - tipos invalidos", () => {
  for (const field of FIELD_NAMES) {
    const spec = ITEM_FIELDS[field];

    for (const [label, wrongValue] of WRONG_VALUES_BY_TYPE[spec.type]) {
      it("recusa " + field + " (" + spec.type + ") como " + label, () => {
        const result = validateBasket({ sales_items: [{ ...ITEM_A, [field]: wrongValue }] });

        assert.equal(result.ok, false);
        assert.ok(errorAt(result, "sales_items[0]." + field), "esperava erro em " + field);
      });
    }
  }

  it("recusa string vazia em campo de texto", () => {
    const result = validateBasket({ sales_items: [{ ...ITEM_A, sku: "" }] });

    assert.equal(result.ok, false);
    assert.equal(errorAt(result, "sales_items[0].sku").code, "too_short");
  });

  it("recusa texto acima do limite", () => {
    const result = validateBasket({ sales_items: [{ ...ITEM_A, name: "x".repeat(201) }] });

    assert.equal(result.ok, false);
    assert.equal(errorAt(result, "sales_items[0].name").code, "too_long");
  });

  it("recusa quantity negativa", () => {
    const result = validateBasket({ sales_items: [{ ...ITEM_A, quantity: -1 }] });

    assert.equal(result.ok, false);
    assert.equal(errorAt(result, "sales_items[0].quantity").code, "out_of_range");
  });

  it("recusa price negativo", () => {
    const result = validateBasket({ sales_items: [{ ...ITEM_A, price: -0.01 }] });

    assert.equal(result.ok, false);
    assert.equal(errorAt(result, "sales_items[0].price").code, "out_of_range");
  });

  it("distingue nao-numero de nao-inteiro", () => {
    assert.equal(
      errorAt(validateBasket({ sales_items: [{ ...ITEM_A, id: "8801" }] }), "sales_items[0].id").code,
      "invalid_type"
    );
    assert.equal(
      errorAt(validateBasket({ sales_items: [{ ...ITEM_A, id: 8801.5 }] }), "sales_items[0].id").code,
      "not_an_integer"
    );
  });

  it("reporta o indice correto quando o item invalido nao e o primeiro", () => {
    const result = validateBasket({ sales_items: [ITEM_A, { ...ITEM_B, price: "34,50" }] });

    assert.equal(result.ok, false);
    assert.ok(errorAt(result, "sales_items[1].price"));
  });

  it("reporta todos os campos faltantes de uma vez", () => {
    const result = validateBasket({ sales_items: [{}] });

    assert.equal(result.ok, false);
    assert.equal(result.errors.length, FIELD_NAMES.length);
    assert.ok(result.errors.every((e) => e.code === "required"));
  });
});

describe("basket-schema - corpo malformado", () => {
  it("recusa corpo sem sales_items", () => {
    const result = validateBasket({});

    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, [{ path: "sales_items", code: "required" }]);
  });

  it("recusa sales_items que nao e array", () => {
    const result = validateBasket({ sales_items: { id: 1 } });

    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, [
      { path: "sales_items", code: "invalid_type", expected: "array" }
    ]);
  });

  for (const [label, body] of [["null", null], ["array", []], ["string", "x"], ["numero", 1]]) {
    it("recusa corpo que nao e objeto: " + label, () => {
      const result = validateBasket(body);

      assert.equal(result.ok, false);
      assert.deepEqual(result.errors, [{ path: "body", code: "not_an_object" }]);
    });
  }

  it("recusa item que nao e objeto", () => {
    const result = validateBasket({ sales_items: ["x"] });

    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, [{ path: "sales_items[0]", code: "not_an_object" }]);
  });

  it("recusa cesta acima do teto de itens", () => {
    const items = Array.from({ length: MAX_ITEMS + 1 }, () => ({ ...ITEM_A }));
    const result = validateBasket({ sales_items: items });

    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, "too_many_items");
  });
});

describe("basket-schema - nao vaza o valor recebido", () => {
  it("nunca ecoa o valor recebido nos detalhes do erro", () => {
    const cpfLike = "12345678901";
    const result = validateBasket({
      sales_items: [{ ...ITEM_A, quantity: cpfLike, name: cpfLike + "-nome" }]
    });

    assert.equal(result.ok, false);
    assert.ok(
      !JSON.stringify(result.errors).includes(cpfLike),
      "os detalhes nao podem ecoar o valor recebido"
    );
  });

  it("so expoe path, code e expected", () => {
    const result = validateBasket({ sales_items: [{ ...ITEM_A, id: "x" }] });

    for (const error of result.errors) {
      assert.ok(Object.keys(error).every((k) => ["path", "code", "expected"].includes(k)));
    }
  });
});
