"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { handleIdentification } = require("../../server/routes/identification");
const store = require("../../server/session-store");

const CNPJ = "12345678000190";
const CPF = "12345678901";

const createResSpy = () => {
  const res = {
    status: null,
    raw: null,
    writeHead(status) {
      res.status = status;
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
    error: record("error"),
    get texto() {
      return JSON.stringify(calls);
    }
  };
};

const createWindowSpy = ({ destroyed = false } = {}) => {
  const enviados = [];
  return {
    enviados,
    isDestroyed: () => destroyed,
    webContents: {
      send: (canal, payload) => enviados.push({ canal, payload })
    }
  };
};

const call = (body, options = {}) => {
  const res = createResSpy();
  const log = options.log || createLogSpy();
  const window = "window" in options ? options.window : createWindowSpy();
  handleIdentification(body, res, {
    store,
    getMainWindow: () => window,
    logger: log
  });
  return { res, log, window };
};

beforeEach(() => store.reset());

describe("handleIdentification - identificacao aceita", () => {
  it("aceita CNPJ e CPF sem pontuacao e abre a sessao", () => {
    const { res } = call({ store: { cnpj: CNPJ }, customer: { cpf: CPF } });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(store.getCurrentSession().customer.cpf, CPF);
    assert.equal(store.getCurrentSession().store.cnpj, CNPJ);
  });

  it("normaliza CNPJ e CPF com pontuacao", () => {
    const { res } = call({
      store: { cnpj: "12.345.678/0001-90" },
      customer: { cpf: "123.456.789-01" }
    });

    assert.equal(res.status, 200);
    assert.equal(store.getCurrentSession().store.cnpj, CNPJ);
    assert.equal(store.getCurrentSession().customer.cpf, CPF);
  });

  it("uma nova identificacao substitui a anterior", () => {
    call({ store: { cnpj: CNPJ }, customer: { cpf: CPF } });
    call({ store: { cnpj: "98765432000110" }, customer: { cpf: "10987654321" } });

    assert.equal(store.getCurrentSession().customer.cpf, "10987654321");
  });

  it("nao devolve dado de cliente na resposta", () => {
    const { res } = call({ store: { cnpj: CNPJ }, customer: { cpf: CPF } });

    assert.deepEqual(Object.keys(res.body), ["ok"]);
    assert.ok(!res.raw.includes(CPF));
    assert.ok(!res.raw.includes(CNPJ));
  });
});

describe("handleIdentification - identificacao recusada", () => {
  const invalidos = [
    ["CNPJ curto", { store: { cnpj: "1234567800019" }, customer: { cpf: CPF } }],
    ["CNPJ longo", { store: { cnpj: "123456780001900" }, customer: { cpf: CPF } }],
    ["CNPJ vazio", { store: { cnpj: "" }, customer: { cpf: CPF } }],
    ["CNPJ ausente", { store: {}, customer: { cpf: CPF } }],
    ["store ausente", { customer: { cpf: CPF } }],
    ["CPF curto", { store: { cnpj: CNPJ }, customer: { cpf: "1234567890" } }],
    ["CPF longo", { store: { cnpj: CNPJ }, customer: { cpf: "123456789012" } }],
    ["CPF vazio", { store: { cnpj: CNPJ }, customer: { cpf: "" } }],
    ["customer ausente", { store: { cnpj: CNPJ } }],
    ["corpo vazio", {}],
    ["CNPJ so com pontuacao", { store: { cnpj: "../..-/" }, customer: { cpf: CPF } }]
  ];

  for (const [rotulo, body] of invalidos) {
    it(`recusa com 422: ${rotulo}`, () => {
      const { res } = call(body);

      assert.equal(res.status, 422);
      assert.deepEqual(res.body, { error: "invalid_payload" });
    });
  }

  it("nao abre sessao ao recusar", () => {
    call({ store: { cnpj: "123" }, customer: { cpf: CPF } });
    assert.equal(store.getCurrentSession(), null);
  });

  it("nao avisa a tela ao recusar", () => {
    const { window } = call({ store: { cnpj: "123" }, customer: { cpf: CPF } });
    assert.deepEqual(window.enviados, []);
  });

  it("nao apaga a sessao anterior ao recusar uma chamada invalida", () => {
    call({ store: { cnpj: CNPJ }, customer: { cpf: CPF } });
    call({ store: { cnpj: "123" }, customer: { cpf: CPF } });

    assert.equal(store.getCurrentSession().customer.cpf, CPF);
  });
});

describe("handleIdentification - log mascarado", () => {
  it("nao registra CPF nem CNPJ em claro no sucesso", () => {
    const { log } = call({ store: { cnpj: CNPJ }, customer: { cpf: CPF } });

    assert.ok(!log.texto.includes(CPF), "CPF nao pode aparecer em claro no log");
    assert.ok(!log.texto.includes(CNPJ), "CNPJ nao pode aparecer em claro no log");
  });

  it("nao registra CPF nem CNPJ em claro na recusa", () => {
    const { log } = call({ store: { cnpj: CNPJ }, customer: { cpf: "1234567890" } });

    assert.ok(!log.texto.includes(CNPJ), "CNPJ nao pode aparecer em claro no log");
    assert.ok(!log.texto.includes("1234567890"));
  });

  it("nao vaza o CPF nem quando ele chega pontuado", () => {
    const { log } = call({
      store: { cnpj: "12.345.678/0001-90" },
      customer: { cpf: "123.456.789-01" }
    });

    assert.ok(!log.texto.includes(CPF));
    assert.ok(!log.texto.includes("123.456.789-01"));
  });
});

describe("handleIdentification - ponte com a tela", () => {
  it("avisa a tela com a janela viva", () => {
    const { window } = call({ store: { cnpj: CNPJ }, customer: { cpf: CPF } });

    assert.equal(window.enviados.length, 1);
    assert.equal(window.enviados[0].canal, "pdv-identification");
    assert.deepEqual(window.enviados[0].payload, { cnpj: CNPJ, cpf: CPF, seller: null });
  });

  it("nao avisa a tela com a janela destruida", () => {
    const window = createWindowSpy({ destroyed: true });
    const { res } = call({ store: { cnpj: CNPJ }, customer: { cpf: CPF } }, { window });

    assert.equal(res.status, 200, "a resposta ao PDV nao depende da tela");
    assert.deepEqual(window.enviados, []);
  });

  it("nao quebra quando nao ha janela", () => {
    const res = createResSpy();

    assert.doesNotThrow(() =>
      handleIdentification({ store: { cnpj: CNPJ }, customer: { cpf: CPF } }, res, {
        store,
        getMainWindow: () => null,
        logger: createLogSpy()
      })
    );
    assert.equal(res.status, 200);
    assert.equal(store.getCurrentSession().customer.cpf, CPF);
  });

  it("responde ao PDV antes de tocar na janela", () => {
    const ordem = [];
    const res = createResSpy();
    const original = res.end.bind(res);
    res.end = (chunk) => {
      ordem.push("resposta");
      original(chunk);
    };

    handleIdentification({ store: { cnpj: CNPJ }, customer: { cpf: CPF } }, res, {
      store,
      getMainWindow: () => {
        ordem.push("janela");
        return null;
      },
      logger: createLogSpy()
    });

    assert.deepEqual(ordem, ["resposta", "janela"], "o PDV nunca espera pela tela");
  });
});

describe("handleIdentification - vendedor", () => {
  const comSeller = (seller) => ({ store: { cnpj: CNPJ }, customer: { cpf: CPF }, seller });

  it("aceita chamada sem vendedor", () => {
    const { res } = call({ store: { cnpj: CNPJ }, customer: { cpf: CPF } });

    assert.equal(res.status, 200);
    assert.equal(store.getCurrentSession().seller, null);
  });

  it("guarda vendedor com id inteiro", () => {
    call(comSeller({ id: 42, name: "Ana Souza" }));
    assert.deepEqual(store.getCurrentSession().seller, { id: 42, name: "Ana Souza" });
  });

  it("guarda vendedor com id string (o front tipa number|string)", () => {
    call(comSeller({ id: "42", name: "Ana Souza" }));
    assert.deepEqual(store.getCurrentSession().seller, { id: "42", name: "Ana Souza" });
  });

  it("guarda vendedor so com nome", () => {
    call(comSeller({ name: "Ana Souza" }));
    assert.deepEqual(store.getCurrentSession().seller, { id: null, name: "Ana Souza" });
  });

  it("trata seller vazio como ausente", () => {
    call(comSeller({}));
    assert.equal(store.getCurrentSession().seller, null);
  });

  it("trata seller que nao e objeto como ausente", () => {
    for (const valor of ["Ana", 42, [1, 2], true]) {
      store.reset();
      call(comSeller(valor));
      assert.equal(store.getCurrentSession().seller, null, `falhou para ${JSON.stringify(valor)}`);
    }
  });

  const invalidos = [
    ["id objeto", { id: { a: 1 }, name: "Ana" }, { id: null, name: "Ana" }],
    ["id array", { id: [1], name: "Ana" }, { id: null, name: "Ana" }],
    ["id booleano", { id: true, name: "Ana" }, { id: null, name: "Ana" }],
    ["id decimal", { id: 4.2, name: "Ana" }, { id: null, name: "Ana" }],
    ["id string vazia", { id: "", name: "Ana" }, { id: null, name: "Ana" }],
    ["name numero", { id: 42, name: 42 }, { id: 42, name: null }],
    ["name vazio", { id: 42, name: "" }, { id: 42, name: null }],
    ["name gigante", { id: 42, name: "x".repeat(121) }, { id: 42, name: null }]
  ];

  for (const [rotulo, seller, esperado] of invalidos) {
    it(`descarta campo invalido sem recusar a chamada: ${rotulo}`, () => {
      const { res } = call(comSeller(seller));

      assert.equal(res.status, 200, "o vendedor e inerte: nao pode derrubar o atendimento");
      assert.deepEqual(store.getCurrentSession().seller, esperado);
    });
  }

  it("descarta o vendedor inteiro quando os dois campos sao invalidos", () => {
    call(comSeller({ id: { a: 1 }, name: 42 }));
    assert.equal(store.getCurrentSession().seller, null);
  });

  it("avisa em warn quando descarta, sem ecoar o valor recebido", () => {
    const { log } = call(comSeller({ id: { segredo: "12345678901" }, name: "Ana" }));

    const warns = log.calls.filter((c) => c.level === "warn");
    assert.equal(warns.length, 1);
    assert.match(warns[0].args[0], /vendedor.*id/i);
    assert.ok(!log.texto.includes("segredo"), "o log nao pode ecoar o valor recebido");
  });

  it("nao manda vendedor invalido para a tela", () => {
    const { window } = call(comSeller({ id: { a: 1 }, name: 42 }));

    assert.equal(window.enviados[0].payload.seller, null);
  });

  it("nao avisa em warn quando o vendedor e valido", () => {
    const { log } = call(comSeller({ id: 42, name: "Ana Souza" }));

    assert.deepEqual(log.calls.filter((c) => c.level === "warn"), []);
  });
});
