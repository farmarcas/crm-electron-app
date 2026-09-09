"use strict";

const { isPlainObject, isAbsent, validateField } = require("./validate");

const ITEM_FIELDS = {
  id: { type: "integer", required: true },
  name: { type: "string", required: true, min: 1, max: 200 },
  quantity: { type: "integer", required: true, min: 0 },
  stock: { type: "integer", required: true },
  price: { type: "number", required: true, min: 0 },
  ean: { type: "string", required: true, min: 1, max: 20 },
  sku: { type: "string", required: true, min: 1, max: 64 }  
};

const MAX_ITEMS = 500;


const MAX_ERRORS = 50;

/**
 * @param {unknown} body
 * @returns {{ok:true, value:{sales_items:object[]}}
 *         | {ok:false, errors:Array<{path:string, code:string, expected?:string}>}}
 */

const validateBasket = (body) => {
  if (!isPlainObject(body)) {
    return { ok: false, errors: [{ path: "body", code: "not_an_object" }] };
  }

  const rawItems = body.sales_items;

  if (isAbsent(rawItems)) {
    return { ok: false, errors: [{ path: "sales_items", code: "required" }] };
  }
  if (!Array.isArray(rawItems)) {
    return {
      ok: false,
      errors: [{ path: "sales_items", code: "invalid_type", expected: "array" }]
    };
  }
  if (rawItems.length > MAX_ITEMS) {
    return {
      ok: false,
      errors: [
        { path: "sales_items", code: "too_many_items", expected: "<=" + MAX_ITEMS }
      ]
    };
  }

  const errors = [];
  const items = [];
  const fieldNames = Object.keys(ITEM_FIELDS);

  for (let i = 0; i < rawItems.length; i += 1) {
    const rawItem = rawItems[i];
    const itemPath = "sales_items[" + i + "]";

    if (!isPlainObject(rawItem)) {
      errors.push({ path: itemPath, code: "not_an_object" });
      continue;
    }

    const item = {};
    for (const field of fieldNames) {
      const spec = ITEM_FIELDS[field];
      const value = rawItem[field];

      if (isAbsent(value) && !spec.required) {
        continue;
      }

      const error = validateField(itemPath + "." + field, value, spec);
      if (error) {
        errors.push(error);
      } else {
        item[field] = value;
      }
    }

    if (errors.length === 0) {
      items.push(item);
    }
    if (errors.length >= MAX_ERRORS) {
      break;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors: errors.slice(0, MAX_ERRORS) };
  }

  return { ok: true, value: { sales_items: items } };
};

module.exports = { ITEM_FIELDS, MAX_ITEMS, MAX_ERRORS, validateBasket };
