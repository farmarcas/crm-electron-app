const CHECKS = [
  { status: 403, fails: (req, allowedHosts) => !allowedHosts.includes(req.headers.host) },
  { status: 403, fails: (req) => Boolean(req.headers.origin) },
  { status: 415, fails: (req) => req.headers["content-type"] !== "application/json" }
];

function evaluateSecurity(req, allowedHosts) {
  const failed = CHECKS.find((check) => check.fails(req, allowedHosts));
  return failed ? failed.status : null;
}

module.exports = { evaluateSecurity };
