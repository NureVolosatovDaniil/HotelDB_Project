const app = require('./app');
const { getPool, closePool } = require('./db');

async function start() {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  await getPool();

  const server = app.listen(port, '127.0.0.1', () => console.log(`HotelDB API: http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => {
      closePool().then(() => process.exit(0), () => process.exit(1));
    }));
  }
}

start().catch(() => {
  console.error('API startup failed. Check DB settings, Windows permissions, SQL Server and ODBC driver. Connection details omitted.');
  process.exitCode = 1;
});