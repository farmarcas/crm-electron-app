"use strict";

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAbsent = (value) => value === undefined || value === null;

/**
 *
 * @returns {{path:string, code:string, expected?:string}|null} null se válido
 */
const validateField = (path, value, spec) => {
  if (isAbsent(value)) {
    return { path, code: "required" };
  }

  if (spec.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { path, code: "invalid_type", expected: "integer" };
    }
    if (!Number.isInteger(value)) {
      return { path, code: "not_an_integer", expected: "integer" };
    }
  } else if (spec.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { path, code: "invalid_type", expected: "number" };
    }
  } else if (spec.type === "string") {
    if (typeof value !== "string") {
      return { path, code: "invalid_type", expected: "string" };
    }
    if (spec.min !== undefined && value.length < spec.min) {
      return { path, code: "too_short", expected: ">=" + spec.min };
    }
    if (spec.max !== undefined && value.length > spec.max) {
      return { path, code: "too_long", expected: "<=" + spec.max };
    }
    return null;
  }

  if (spec.min !== undefined && value < spec.min) {
    return { path, code: "out_of_range", expected: ">=" + spec.min };
  }
  if (spec.max !== undefined && value > spec.max) {
    return { path, code: "out_of_range", expected: "<=" + spec.max };
  }

  return null;
};

module.exports = { isPlainObject, isAbsent, validateField };
