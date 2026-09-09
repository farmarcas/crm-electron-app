const { respondJson } = require("../http");
const { maskCpf, maskCnpj } = require("../mask");
const { isPlainObject, isAbsent, validateField } = require("../validate");

const SELLER_ID_SPECS = [
  { type: "integer" },
  { type: "string", min: 1, max: 64 }
];
const SELLER_NAME_SPEC = { type: "string", min: 1, max: 120 };

function normalizeDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function parseSeller(body, logger) {
  const raw = body?.seller;
  if (!isPlainObject(raw)) return null;
  if (isAbsent(raw.id) && isAbsent(raw.name)) return null;

  const descartados = [];

  let id = null;
  if (!isAbsent(raw.id)) {
    const aceito = SELLER_ID_SPECS.some(
      (spec) => validateField("seller.id", raw.id, spec) === null
    );
    if (aceito) id = raw.id;
    else descartados.push("id");
  }

  let name = null;
  if (!isAbsent(raw.name)) {
    if (validateField("seller.name", raw.name, SELLER_NAME_SPEC) === null) name = raw.name;
    else descartados.push("name");
  }

  if (descartados.length > 0) {
    logger.warn(
      `API local: /identification — vendedor com campo(s) invalido(s) descartado(s): ${descartados.join(", ")}`
    );
  }

  if (id === null && name === null) return null;
  return { id, name };
}

function handleIdentification(body, res, { store, getMainWindow, logger }) {
  const cnpj = normalizeDigits(body?.store?.cnpj);
  const cpf = normalizeDigits(body?.customer?.cpf);

  if (cnpj.length !== 14 || cpf.length !== 11) {
    respondJson(res, 422, { error: "invalid_payload" });
    logger.warn(`API local: /identification recusada — cnpj=${maskCnpj(cnpj)} cpf=${maskCpf(cpf)}`);
    return;
  }

  const seller = parseSeller(body, logger);
  store.openSession({ cnpj, cpf, seller });
  respondJson(res, 200, { ok: true });

  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("pdv-identification", { cnpj, cpf, seller });
  }
}

module.exports = { handleIdentification };
