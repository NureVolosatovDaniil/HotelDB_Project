const { HttpError } = require('./errors');

function invalid(message) { 
  throw new HttpError(400, 'INVALID_INPUT', message); 
}

function positiveInt(value, name) {
  if (!['string', 'number'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value))) {
    invalid(`${name} must be a positive integer.`);
  }

  const n = Number(value);
  if (!Number.isSafeInteger(n) || n > 2147483647) {
    invalid(`${name} exceeds SQL int range.`);
  }
  return n;
}

function amount(value, name) {
  if (!['string', 'number'].includes(typeof value) || !/^(?:\d+\.?\d*|\.\d+)$/.test(String(value))) {
    invalid(`${name} must be a non-negative number.`);
  }

  const n = Number(value);
  if (!Number.isFinite(n)) {
    invalid(`${name} must be finite.`);
  }
  return n;
}

function text(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    invalid(`${name} must contain 1–${max} characters.`);
  } 
  return value.trim();
}

function date(value, name = 'checkInDate') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid(name + ' must be YYYY-MM-DD.');
  }

  const parsed = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value.slice(0,4) === '0000') {
    invalid(name + ' must be a valid calendar date.');
  }
  return parsed;
}

function body(req) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    invalid('A JSON object body is required.');
  }
  return req.body;
}
module.exports = { positiveInt, amount, text, date, body };