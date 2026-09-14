const http = require("node:http");
const config = require("./config");
const routes = require("./routes");
const { evaluateSecurity } = require("./security");
const { respondEmpty, readJsonBody } = require("./http");
const { isDocsPath, handleDocs } = require("./docs");

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

      let pathname;
      try {
        pathname = new URL(req.url, "http://127.0.0.1").pathname.replace(/\/+$/, "") || "/";
      } catch {
        return respondEmpty(res, 404);
      }

      if (isDocsPath(pathname)) return handleDocs(req, res, pathname, logger);

      const handler = routes.get(pathname);
      if (!handler) return respondEmpty(res, 404);
      if (req.method !== "POST") return respondEmpty(res, 405);

      const mediaType = String(req.headers["content-type"] || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (mediaType !== "application/json") return respondEmpty(res, 415);

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
