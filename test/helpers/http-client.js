"use strict";

const http = require("node:http");
const net = require("node:net");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * @param {object} options
 * @param {number} options.port
 * @param {string} [options.path]
 * @param {string} [options.method]
 * @param {object} [options.headers] 
 * @param {string} [options.body]     
 * @param {unknown} [options.json]   
 * @returns {Promise<{status:number, headers:object, raw:string, body:unknown}>}
 */
function request({ port, path = "/basket", method = "POST", headers = {}, json, body }) {
  const payload = body !== undefined ? body : json !== undefined ? JSON.stringify(json) : "";

  const finalHeaders = {
    host: `127.0.0.1:${port}`,
    "content-type": "application/json",
    ...headers
  };
  for (const key of Object.keys(finalHeaders)) {
    if (finalHeaders[key] === null) delete finalHeaders[key];
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method,
        headers: finalHeaders,
        agent: false
      },
      (res) => {
        const chunks = [];
        const finish = () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed = null;
          try {
            parsed = raw.length ? JSON.parse(raw) : null;
          } catch {
            parsed = null;
          }
          settle(resolve, { status: res.statusCode, headers: res.headers, raw, body: parsed });
        };

        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", finish);
        res.on("aborted", finish);
        res.on("error", finish);
      }
    );

    req.on("error", (err) => settle(reject, err));

    if (payload) req.write(payload);
    req.end();
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

module.exports = { getFreePort, request, closeServer };
