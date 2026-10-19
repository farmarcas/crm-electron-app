// Build de compatibilidade para Windows 7/8/8.1, que o Electron atual não suporta.
// Reaproveita o `build` do package.json e muda apenas o necessário:
// - Electron 22, a última versão que roda nesses sistemas (fica congelado nela,
//   sem correções de segurança do Chromium — use só onde o build atual não roda);
// - instalador x64 + ia32, com nome próprio para não colidir com o atual na Release;
// - canal de update "legacy": publica `legacy.yml` em vez de `latest.yml`, e o
//   `app-update.yml` embutido faz o app instalado consultar só esse arquivo. Assim
//   o build atual nunca é oferecido a quem roda o legado, e vice-versa.
const { build } = require("./package.json");

module.exports = {
  ...build,
  electronVersion: "22.3.27",
  win: {
    ...build.win,
    target: [{ target: "nsis", arch: ["x64", "ia32"] }],
    artifactName: "CRM-Radar-Setup-legacy-${version}.exe"
  },
  publish: { ...build.publish, channel: "legacy" }
};
