const CHECKS = [
  { status: 403, fails: (req, allowedHosts) => !allowedHosts.includes(req.headers.host) }
];

function evaluateSecurity(req, allowedHosts) {
  const failed = CHECKS.find((check) => check.fails(req, allowedHosts));
  return failed ? failed.status : null;
}

module.exports = { evaluateSecurity };
