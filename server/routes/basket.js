const { respondJson } = require("../http");
const { validateBasket } = require("../basket-schema");

function logDebug(logger, message) {
  if (logger && typeof logger.debug === "function") {
    logger.debug(message);
  }
}

function handleBasket(body, res, { store, logger }) {
  const parsed = validateBasket(body);

  if (!parsed.ok) {
    respondJson(res, 422, { error: "invalid_payload", details: parsed.errors });
    logger.warn(`API local: /basket recusada — ${parsed.errors.length} erro(s) de validação`);
    return;
  }

  const outcome = store.setBasket(parsed.value.sales_items);

  respondJson(res, 200, { ok: true });

  if (outcome.status === "ignored") {
    logDebug(logger, "API local: /basket ignorada — nenhum atendimento aberto");
    return;
  }

  logDebug(logger, `API local: cesta registrada — ${outcome.itemCount} item(ns)`);
}

module.exports = { handleBasket };
