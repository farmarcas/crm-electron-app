const http = require("node:http");
const config = require("./config");
const routes = require("./routes");
const { evaluateSecurity } = require("./security");
const { respondEmpty, readJsonBody } = require("./http");

function createLocalServer({
  port = config.PORT,
  allowedHosts = config.ALLOWED_HOSTS,
  maxBodyBytes = config.MAX_BODY_BYTES,
  store,
  getMainWindow,
  logger = console
} = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const securityStatus = evaluateSecurity(req, allowedHosts);
      if (securityStatus) return respondEmpty(res, securityStatus);

      const handler = routes.get(req.url);
      if (!handler) return respondEmpty(res, 404);
      if (req.method !== "POST") return respondEmpty(res, 405);
      if (req.headers["content-type"] !== "application/json") return respondEmpty(res, 415);

      const body = await readJsonBody(req, res, maxBodyBytes);
      if (body === null) return;

      handler(body, res, { store, getMainWindow, logger });
    } catch (err) {
      logger.error("API local: erro ao processar requisição —", err.message);
      if (!res.headersSent) respondEmpty(res, 500);
    }
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      logger.error(`API local: porta ${port} já em uso — seguindo sem a integração de PDV.`);
      return;
    }
    logger.error("API local: erro no servidor —", err.message);
  });

  server.listen(port, "127.0.0.1");
  return server;
}

module.exports = { createLocalServer, ...config };
