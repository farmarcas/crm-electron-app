let currentSession = null;

function openSession({ cnpj, cpf, seller }) {
  currentSession = {
    store: { cnpj },
    customer: { cpf },
    seller: seller ?? null,
    createdAt: Date.now(),
    basket: null
  };
  return currentSession;
}

function setBasket(items) {
  if (!currentSession) {
    return { status: "ignored", reason: "no_open_session" };
  }

  const frozenItems = Object.freeze(items.map((item) => Object.freeze({ ...item })));

  currentSession.basket = Object.freeze({
    items: frozenItems,
    itemCount: frozenItems.length,
    updatedAt: Date.now()
  });

  return { status: "stored", itemCount: frozenItems.length };
}

function getBasket() {
  return currentSession ? currentSession.basket : null;
}

function getCurrentSession() {
  return currentSession;
}

function closeSession() {
  currentSession = null;
}

function reset() {
  currentSession = null;
}

module.exports = {
  openSession,
  setBasket,
  getBasket,
  getCurrentSession,
  closeSession,
  reset
};
