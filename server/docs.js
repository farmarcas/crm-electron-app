const fs = require("node:fs");
const path = require("node:path");
const { respondEmpty } = require("./http");

const SPEC_FILE = path.join(__dirname, "..", "docs", "api", "openapi.yaml");

// A página roda na mesma origem da API e consegue chamá-la, então não pode ser
// embutida em outro site (clickjacking) nem carregar nada de fora.
const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join("; "),
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store"
};

const PAGE = [
  "<!doctype html>",
  '<html lang="pt-BR">',
  "<head>",
  '  <meta charset="utf-8">',
  "  <title>CRM Radar — API local</title>",
  '  <link rel="stylesheet" href="/docs/swagger-ui.css">',
  "</head>",
  "<body>",
  '  <div id="swagger-ui"></div>',
  '  <script src="/docs/swagger-ui-bundle.js"></script>',
  '  <script src="/docs/init.js"></script>',
  "</body>",
  "</html>"
].join("\n");

// A spec declara 127.0.0.1:50505. Aberta por localhost:50505/docs, a chamada
// para 127.0.0.1 seria de outra origem e cairia no preflight — o interceptor
// mantém toda chamada na origem da própria página.
const INIT = `window.addEventListener("load", function () {
  window.ui = SwaggerUIBundle({
    url: "/docs/openapi.yaml",
    dom_id: "#swagger-ui",
    queryConfigEnabled: false,
    validatorUrl: null,
    supportedSubmitMethods: ["post"],
    tryItOutEnabled: true,
    requestInterceptor: function (req) {
      var alvo = new URL(req.url, window.location.origin);
      req.url = window.location.origin + alvo.pathname + alvo.search;
      return req;
    }
  });
});
`;

const SWAGGER_UI_FILES = {
  "/docs/swagger-ui-bundle.js": { file: "swagger-ui-bundle.js", type: "text/javascript; charset=utf-8" },
  "/docs/swagger-ui.css": { file: "swagger-ui.css", type: "text/css; charset=utf-8" }
};

function isDocsPath(pathname) {
  return pathname === "/docs" || pathname.startsWith("/docs/");
}

// Resolvido sob demanda: se um arquivo faltar no pacote, só a documentação
// falha — a API e o app seguem funcionando.
function load(pathname) {
  if (pathname === "/docs") return { type: "text/html; charset=utf-8", body: PAGE };
  if (pathname === "/docs/init.js") return { type: "text/javascript; charset=utf-8", body: INIT };
  if (pathname === "/docs/openapi.yaml") {
    return { type: "application/yaml; charset=utf-8", body: fs.readFileSync(SPEC_FILE) };
  }
  const asset = SWAGGER_UI_FILES[pathname];
  if (asset) {
    return { type: asset.type, body: fs.readFileSync(require.resolve(`swagger-ui-dist/${asset.file}`)) };
  }
  return null;
}

function handleDocs(req, res, pathname, logger) {
  if (req.method !== "GET") return respondEmpty(res, 405);

  let found;
  try {
    found = load(pathname);
  } catch (err) {
    logger.error("API local: documentação indisponível —", err.message);
    return respondEmpty(res, 500);
  }
  if (!found) return respondEmpty(res, 404);

  res.writeHead(200, { "Content-Type": found.type, ...SECURITY_HEADERS });
  res.end(found.body);
}

module.exports = { isDocsPath, handleDocs };
