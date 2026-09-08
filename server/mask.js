function maskCpf(cpf) {
  const digits = String(cpf ?? "").replace(/\D/g, "");
  if (digits.length < 2) return "***";
  return `***.***.***-${digits.slice(-2)}`;
}

function maskCnpj(cnpj) {
  const digits = String(cnpj ?? "").replace(/\D/g, "");
  if (digits.length < 2) return "***";
  return `**.***.***/****-${digits.slice(-2)}`;
}

module.exports = { maskCpf, maskCnpj };
