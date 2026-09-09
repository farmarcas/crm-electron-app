const { handleIdentification } = require("./identification");
const { handleBasket } = require("./basket");

module.exports = new Map([
  ["/identification", handleIdentification],
  ["/basket", handleBasket]
]);
