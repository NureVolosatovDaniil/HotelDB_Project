const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const db = require('../db');

let databaseCalls = 0;
db.getPool = async () => { databaseCalls++; throw new Error('Unexpected database call'); };
const app = require('../app');
const { errorHandler } = require('../errors');

test('invalid read and CRUD inputs are rejected without connecting to SQL', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    for (const route of ['/api/rooms/0', '/api/rooms/2147483648',
      '/api/rooms/booking-count', '/api/rooms/max-booking', '/api/rooms/max-booking?roomNumber=12345678901',
      '/api/rooms/cheaper-than?maxPrice=-1', '/api/rooms/cheaper-than?maxPrice=Infinity',
      '/api/rooms/cheaper-than?maxPrice=1&maxPrice=2']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 400, route);
      assert.equal((await response.json()).error.code, 'INVALID_INPUT');
    }

    for (const route of ['/api/rooms', '/api/bookings', '/api/staff', '/api/staff/cleanup']) {
      const response = await fetch(base + route, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'INVALID_INPUT');
    }


    const badJson = await fetch(base + '/api/bookings', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(badJson.status, 400);
    assert.equal((await badJson.json()).error.code, 'INVALID_JSON');
    assert.equal((await fetch(base + '/missing')).status, 404);
    assert.equal(databaseCalls, 0);
  } finally { 
    await new Promise(resolve => server.close(resolve)); 
  }
});

test('SQL custom errors survive preceding-error wrapping without exposing stack', () => {
  let status, output;
  const res = { status(value) { status = value; return this; }, json(value) { output = value; return this; } };
  errorHandler({ number: 3621, precedingErrors: [{ number: 50000, message: 'Booking rule rejected this request.' }], stack: 'secret' }, {}, res, () => {});
  assert.equal(status, 422);
  assert.equal(output.error.number, 50000);
  assert.equal(output.error.message, 'Booking rule rejected this request.');
  assert.equal(JSON.stringify(output).includes('secret'), false);
});

test('calendar validation rejects normalized invalid dates', () => {
  const { date } = require('../validation');
  assert.throws(() => date('2026-02-30'));
  assert.throws(() => date('0000-01-01'));
  assert.equal(date('2028-02-29').toISOString(), '2028-02-29T00:00:00.000Z');
});