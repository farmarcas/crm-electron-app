const PORT = Number(process.env.PDV_API_PORT) || 50505;
const ALLOWED_HOSTS = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
const MAX_BODY_BYTES = 64 * 1024;

module.exports = { PORT, ALLOWED_HOSTS, MAX_BODY_BYTES };
