function respondEmpty(res, status) {
  res.writeHead(status);
  res.end();
}

function respondJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJsonBody(req, res, maxBodyBytes) {
  return new Promise((resolve) => {
    let received = 0;
    const chunks = [];
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    req.on("data", (chunk) => {
      if (settled) return;
      received += chunk.length;
      if (received > maxBodyBytes) {
        respondEmpty(res, 413);
        req.destroy();
        finish(null);
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (settled) return;
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        finish(raw.length ? JSON.parse(raw) : {});
      } catch {
        respondJson(res, 400, { error: "invalid_json" });
        finish(null);
      }
    });

    req.on("error", () => finish(null));
  });
}

module.exports = { respondEmpty, respondJson, readJsonBody };
