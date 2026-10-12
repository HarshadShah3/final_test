import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';

let pool;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function certificateFromEnvironment(environment) {
  if (environment.DB_SSL_CA_BASE64) {
    return Buffer.from(environment.DB_SSL_CA_BASE64, 'base64').toString('utf8');
  }
  if (environment.DB_SSL_CA) {
    return environment.DB_SSL_CA.replaceAll('\\n', '\n');
  }
  if (environment.DB_SSL_CA_PATH) {
    return readFileSync(environment.DB_SSL_CA_PATH, 'utf8');
  }
  return null;
}

export function databaseConfiguration(environment = process.env) {
  const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = required.filter(key => !environment[key]?.trim());
  let certificate = null;
  try {
    certificate = certificateFromEnvironment(environment);
  } catch {
    missing.push('valid DB_SSL_CA_PATH');
  }
  if (!certificate && !missing.includes('valid DB_SSL_CA_PATH')) {
    missing.push('DB_SSL_CA_PATH or DB_SSL_CA');
  }

  if (missing.length) return { configured: false, missing };
  return {
    configured: true,
    options: {
      host: environment.DB_HOST,
      port: positiveInteger(environment.DB_PORT, 3306),
      user: environment.DB_USER,
      password: environment.DB_PASSWORD,
      database: environment.DB_NAME,
      connectTimeout: positiveInteger(environment.DB_CONNECT_TIMEOUT_MS, 8000),
      connectionLimit: positiveInteger(environment.DB_CONNECTION_LIMIT, 3),
      enableKeepAlive: true,
      ssl: { ca: certificate, rejectUnauthorized: true },
      decimalNumbers: true,
    },
  };
}

export class DatabaseUnavailableError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'DatabaseUnavailableError';
  }
}

export function getAivenPool() {
  if (pool) return pool;
  const configuration = databaseConfiguration();
  if (!configuration.configured) {
    throw new DatabaseUnavailableError(`Database integration is not configured: ${configuration.missing.join(', ')}`);
  }
  pool = mysql.createPool(configuration.options);
  return pool;
}

export async function queryAiven(sql, parameters = []) {
  try {
    const [rows] = await getAivenPool().query(sql, parameters);
    return rows;
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) throw error;
    throw new DatabaseUnavailableError('The Aiven database could not be reached.', { cause: error });
  }
}

export async function getAivenHealth() {
  const configuration = databaseConfiguration();
  if (!configuration.configured) {
    return { configured: false, connected: false, missing: configuration.missing };
  }

  const rows = await queryAiven(
    'SELECT MAX(version_id) AS schema_version FROM schema_version',
  );
  return {
    configured: true,
    connected: true,
    provider: 'aiven-mysql',
    schemaVersion: rows[0]?.schema_version ?? null,
  };
}

export async function closeAivenPool() {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}
