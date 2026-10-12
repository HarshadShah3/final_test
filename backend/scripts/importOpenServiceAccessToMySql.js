import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAivenPool } from '../src/database/aivenClient.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = join(scriptDirectory, '..');
const dataDirectory = join(backendDirectory, 'data-sources', 'open-service-access');
const schemaPath = join(backendDirectory, 'sql', '20260915_open_service_access.sql');
const schemaVersion = '20260915_open_service_v1';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');

  const [headers, ...values] = rows.filter(candidate => candidate.some(value => value !== ''));
  return values.map((candidate, rowIndex) => {
    if (candidate.length !== headers.length) {
      throw new Error(`CSV row ${rowIndex + 2} has ${candidate.length} fields; expected ${headers.length}.`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, candidate[index]]));
  });
}

async function loadCsv(filename) {
  return parseCsv(await readFile(join(dataDirectory, filename), 'utf8'));
}

function isoDate(value) {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}

function integer(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) throw new Error(`Expected an integer, received "${value}".`);
  return parsed;
}

function decimalOrNull(value) {
  if (value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected a number, received "${value}".`);
  return parsed;
}

function requireRows(rows, expected, label) {
  if (rows.length !== expected) {
    throw new Error(`${label} has ${rows.length} rows; expected ${expected}.`);
  }
  if (rows.some(row => row.license !== 'CC BY 4.0' || !row.source_url.startsWith('https://'))) {
    throw new Error(`${label} contains a missing or unexpected source URL/licence.`);
  }
}

async function insertBatches(connection, table, columns, rows, batchSize = 250) {
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const placeholders = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    const parameters = batch.flatMap(row => row);
    await connection.query(
      `INSERT INTO \`${table}\` (${columns.map(column => `\`${column}\``).join(',')}) VALUES ${placeholders}`,
      parameters,
    );
  }
}

async function main() {
  const [facilities, healthLgas, edTimes, transportLgas] = await Promise.all([
    loadCsv('victoria_health_facilities_open_2025.csv'),
    loadCsv('victoria_health_services_lga_2025.csv'),
    loadCsv('victoria_ed_median_time_2024_25.csv'),
    loadCsv('victoria_transport_access_lga_2026.csv'),
  ]);

  requireRows(facilities, 1851, 'Health facility CSV');
  requireRows(healthLgas, 80, 'Health LGA CSV');
  requireRows(edTimes, 40, 'ED median-time CSV');
  requireRows(transportLgas, 80, 'Transport LGA CSV');

  const pool = getAivenPool();
  const connection = await pool.getConnection();
  try {
    const schemaSql = await readFile(schemaPath, 'utf8');
    for (const statement of schemaSql.split(';').map(value => value.trim()).filter(Boolean)) {
      await connection.query(statement);
    }

    const [masterRows] = await connection.query(
      'SELECT lga_code_2021_abs FROM stg_master_dataset_56_lga',
    );
    const projectLgaCodes = new Set(masterRows.map(row => `LGA${String(row.lga_code_2021_abs).replace(/\D/g, '').padStart(5, '0')}`));
    for (const [label, rows] of [['health', healthLgas], ['transport', transportLgas]]) {
      const available = new Set(rows.map(row => row.lga_code_2021));
      const missing = [...projectLgaCodes].filter(code => !available.has(code));
      if (missing.length) throw new Error(`${label} CSV is missing project LGAs: ${missing.join(', ')}.`);
    }

    await connection.beginTransaction();
    for (const table of [
      'stg_health_facilities_open_2025',
      'stg_health_services_lga_2025',
      'stg_health_ed_median_time_2024_25',
      'stg_transport_access_lga_2026',
    ]) {
      await connection.query(`DELETE FROM \`${table}\``);
    }

    await insertBatches(
      connection,
      'stg_health_facilities_open_2025',
      ['service_id', 'facility_name', 'facility_class', 'service_type', 'is_emergency_department', 'address', 'suburb', 'postcode', 'longitude', 'latitude', 'lga_code_2021', 'lga_name_2021', 'source_date', 'source_url', 'license'],
      facilities.map(row => [row.service_id, row.facility_name, row.facility_class, row.service_type, integer(row.is_emergency_department), row.address, row.suburb, row.postcode, decimalOrNull(row.longitude), decimalOrNull(row.latitude), row.lga_code_2021, row.lga_name_2021, isoDate(row.source_date), row.source_url, row.license]),
    );
    await insertBatches(
      connection,
      'stg_health_services_lga_2025',
      ['lga_code_2021', 'lga_name_2021', 'hospital_count', 'general_practice_count', 'emergency_department_count', 'source_date', 'source_url', 'license'],
      healthLgas.map(row => [row.lga_code_2021, row.lga_name_2021, integer(row.hospital_count), integer(row.general_practice_count), integer(row.emergency_department_count), isoDate(row.source_date), row.source_url, row.license]),
    );
    await insertBatches(
      connection,
      'stg_health_ed_median_time_2024_25',
      ['reporting_unit_code', 'hospital_name', 'latitude', 'longitude', 'lga_code_2021', 'lga_name_2021', 'median_time_in_ed_minutes', 'reporting_start_date', 'reporting_end_date', 'measure_code', 'reported_measure_code', 'source_data_version', 'source_url', 'license'],
      edTimes.map(row => [row.reporting_unit_code, row.hospital_name, decimalOrNull(row.latitude), decimalOrNull(row.longitude), row.lga_code_2021, row.lga_name_2021, integer(row.median_time_in_ed_minutes), row.reporting_start_date, row.reporting_end_date, row.measure_code, row.reported_measure_code, row.source_data_version, row.source_url, row.license]),
    );
    await insertBatches(
      connection,
      'stg_transport_access_lga_2026',
      ['lga_code_2021', 'lga_name_2021', 'representative_weekday', 'active_stop_count', 'weekday_scheduled_stop_calls', 'weekday_stop_calls_per_active_stop', 'regional_train_calls', 'metropolitan_train_calls', 'tram_calls', 'bus_calls', 'regional_coach_calls', 'regional_bus_calls', 'interstate_calls', 'skybus_calls', 'train_station_count', 'has_rail_access', 'direct_southern_cross_service', 'source_url', 'license'],
      transportLgas.map(row => [row.lga_code_2021, row.lga_name_2021, row.representative_weekday, integer(row.active_stop_count), integer(row.weekday_scheduled_stop_calls), decimalOrNull(row.weekday_stop_calls_per_active_stop), integer(row.regional_train_calls), integer(row.metropolitan_train_calls), integer(row.tram_calls), integer(row.bus_calls), integer(row.regional_coach_calls), integer(row.regional_bus_calls), integer(row.interstate_calls), integer(row.skybus_calls), integer(row.train_station_count), integer(row.has_rail_access), integer(row.direct_southern_cross_service), row.source_url, row.license]),
    );

    await connection.query(
      `INSERT INTO schema_version (version_id, applied_at, description)
       VALUES (?, CURRENT_TIMESTAMP, ?)
       ON DUPLICATE KEY UPDATE applied_at = VALUES(applied_at), description = VALUES(description)`,
      [schemaVersion, 'Imported verified CC BY 4.0 Victoria health and public-transport staging datasets.'],
    );
    await connection.commit();

    const [counts] = await connection.query(`
      SELECT 'stg_health_facilities_open_2025' AS table_name, COUNT(*) AS row_count FROM stg_health_facilities_open_2025
      UNION ALL SELECT 'stg_health_services_lga_2025', COUNT(*) FROM stg_health_services_lga_2025
      UNION ALL SELECT 'stg_health_ed_median_time_2024_25', COUNT(*) FROM stg_health_ed_median_time_2024_25
      UNION ALL SELECT 'stg_transport_access_lga_2026', COUNT(*) FROM stg_transport_access_lga_2026
    `);
    console.log(JSON.stringify({ schemaVersion, projectLgaCount: projectLgaCodes.size, tables: counts }, null, 2));
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // The original error is more useful than a rollback error.
    }
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
