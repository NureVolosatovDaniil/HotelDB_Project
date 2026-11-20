const path = require('node:path');
const fs = require('node:fs');
const sql = require('mssql/msnodesqlv8');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

function required(name) {
  if (!process.env[name]?.trim()) throw new Error(`Missing configuration: ${name}`);
  return process.env[name].trim();
}

function boolean(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  if (!['true', 'false'].includes(value)) throw new Error(`${name} must be true or false`);
  return value === 'true';
}

const settings = {
  server: required('DB_SERVER'),
  database: required('DB_DATABASE'),
};

const odbcValue = value => '{' + String(value).replaceAll('}', '}}') + '}';
const config = {
  connectionString: [
    'Driver=' + odbcValue(process.env.DB_ODBC_DRIVER || 'ODBC Driver 17 for SQL Server'),
    'Server=' + odbcValue(settings.server),
    'Database=' + odbcValue(settings.database),
    'Trusted_Connection=Yes',
    'Encrypt=' + (boolean('DB_ENCRYPT', true) ? 'Yes' : 'No'),
    'TrustServerCertificate=' + (boolean('DB_TRUST_SERVER_CERTIFICATE', false) ? 'Yes' : 'No'),
  ].join(';') + ';',
  server: settings.server,
  database: settings.database,
  driver: 'msnodesqlv8',
  options: {
    trustedConnection: true,
    encrypt: boolean('DB_ENCRYPT', true),
    trustServerCertificate: boolean('DB_TRUST_SERVER_CERTIFICATE', false),
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 10000,
  requestTimeout: 15000,
};

let connecting;

function getPool() {
  if (!connecting) {
    const pool = new sql.ConnectionPool(config);
    pool.on('error', () => { console.error('Database pool error; connection details omitted.'); });
    connecting = pool.connect().catch(error => { connecting = undefined; throw error; });
  }
  return connecting;
}

async function closePool() {
  if (connecting) {
    const pool = await connecting;
    connecting = undefined;
    await pool.close();
  }
}
module.exports = { sql, settings, getPool, closePool };