class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message } });
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } });
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'Request body exceeds 16 KB.' } });
  }

  const candidates = [error, ...(error.precedingErrors || [])];
  const custom = candidates.find(e => Number(e.number) >= 50000);
  if (custom) {
    return res.status(422).json({ error: {
      code: 'DATABASE_RULE', number: custom.number, message: custom.message,
    } });
  }

  const number = Number(error.number);
  if ([547, 2601, 2627].includes(number)) {
    return res.status(409).json({ error: { code: 'DATABASE_CONFLICT', message: 'The request conflicts with related data or a unique value.' } });
  }

  const unavailable = ['ELOGIN', 'ESOCKET', 'ETIMEOUT', 'ECONNCLOSED', 'ENOTOPEN', 'EINSTLOOKUP', 'ECONNREFUSED'].includes(error.code);
  console.error('Request failed:', error.code || 'INTERNAL_ERROR', Number.isFinite(number) ? number : '');
  
  return res.status(unavailable ? 503 : 500).json({ error: {
    code: unavailable ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR',
    message: unavailable ? 'Database connection is unavailable.' : 'The database request could not be completed.',
  } });
}
module.exports = { HttpError, errorHandler };