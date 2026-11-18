const { once } = require('node:events');
const app = require('./app');
const { getPool, closePool } = require('./db');

(async () => {
  let server;

  try {
    await getPool();
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const first = await fetch(base + '/api/rooms');

    if (!first.ok) throw new Error('Rooms GET failed');
    
    const rooms = await first.json();
    const id = rooms[0]?.RoomID || 1;

    for (const route of ['/api/rooms', '/api/rooms/' + id, '/api/bookings', '/api/staff',
      '/api/rooms/max-booking?roomNumber=301', '/api/rooms/cheaper-than?maxPrice=2000']) {
      const response = await fetch(base + route);
      const data = await response.json();
      console.log(JSON.stringify({ route, status: response.status,
        rows: Array.isArray(data) ? data.length : undefined,
        hasBookings: Array.isArray(data.bookings) }));

      if (response.status !== 200 && !(rooms.length === 0 && route === '/api/rooms/' + id && response.status === 404)) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error('Read-only integration test failed:', error.code || error.name);
    process.exitCode = 1;
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await closePool().catch(() => {});
  }
})();