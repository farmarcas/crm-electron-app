const { respondJson } = require("../http");
const { maskCpf, maskCnpj } = require("../mask");

function normalizeDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function parseSeller(body) {
  if (!body?.seller) return null;
  const { id, name } = body.seller;
  if (id === undefined && name === undefined) return null;
  return { id: id ?? null, name: name ?? null };
}

function handleIdentification(body, res, { store, getMainWindow, logger }) {
  const cnpj = normalizeDigits(body?.store?.cnpj);
  const cpf = normalizeDigits(body?.customer?.cpf);

  if (cnpj.length !== 14 || cpf.length !== 11) {
    respondJson(res, 422, { error: "invalid_payload" });
    logger.warn(`API local: /identification recusada — cnpj=${maskCnpj(cnpj)} cpf=${maskCpf(cpf)}`);
    return;
  }

  const seller = parseSeller(body);
  store.openSession({ cnpj, cpf, seller });
  respondJson(res, 200, { ok: true });

  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("pdv-identification", { cnpj, cpf, seller });
  }
}

module.exports = { handleIdentification };
