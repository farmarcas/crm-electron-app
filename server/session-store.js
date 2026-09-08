let currentSession = null;

function openSession({ cnpj, cpf, seller }) {
  currentSession = {
    store: { cnpj },
    customer: { cpf },
    seller: seller ?? null,
    createdAt: Date.now()
  };
  return currentSession;
}

module.exports = { openSession };
