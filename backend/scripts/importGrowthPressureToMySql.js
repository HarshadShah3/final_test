import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAivenPool } from '../src/database/aivenClient.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = join(scriptDirectory, '..');
const sourceFile = 'victoria_regional_profile.csv';
const sourcePath = join(backendDirectory, 'data-sources', sourceFile);
const schemaPath = join(backendDirectory, 'sql', '20260915_growth_pressure.sql');
const tableName = 'stg_growth_pressure_lga_2036';
const schemaVersion = '20260915_growth_pressure_v1';

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

function number(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected a number for ${label}, received "${value}".`);
  return parsed;
}

function oneDecimal(value) {
  return Math.round(value * 10) / 10;
}

function lgaCode(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!/^\d{5}$/.test(digits)) throw new Error(`Invalid LGA code: ${value}`);
  return `LGA${digits}`;
}

function requireRows(rows) {
  if (rows.length !== 56) throw new Error(`${sourceFile} has ${rows.length} rows; expected 56.`);
  const codes = new Set();
  for (const row of rows) {
    const code = lgaCode(row.lga_code_2021);
    if (codes.has(code)) throw new Error(`Duplicate LGA code: ${code}.`);
    codes.add(code);
    for (const field of [
      'lga_name',
      'vif_population_growth_2021_2036_pct',
      'vif_dwelling_growth_2021_2036_pct',
      'growth_pressure_indicator',
    ]) {
      if (row[field] === '') throw new Error(`${sourceFile} is missing ${field} for ${row.lga_name || code}.`);
    }

    const populationGrowth = oneDecimal(number(row.vif_population_growth_2021_2036_pct, `${row.lga_name} population growth`));
    const dwellingGrowth = oneDecimal(number(row.vif_dwelling_growth_2021_2036_pct, `${row.lga_name} dwelling growth`));
    const indicator = oneDecimal(number(row.growth_pressure_indicator, `${row.lga_name} growth pressure`));
    if (oneDecimal(populationGrowth - dwellingGrowth) !== indicator) {
      throw new Error(`Growth pressure formula mismatch for ${row.lga_name}: expected ${oneDecimal(populationGrowth - dwellingGrowth)}, received ${indicator}.`);
    }
  }
}

async function insertBatches(connection, rows, batchSize = 250) {
  const columns = [
    'lga_code_2021',
    'lga_name_2021',
    'reference_start_year',
    'reference_end_year',
    'vif_population_growth_2021_2036_pct',
    'vif_dwelling_growth_2021_2036_pct',
    'growth_pressure_indicator',
    'source_file',
  ];
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const placeholders = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    const parameters = batch.flatMap(row => [
      lgaCode(row.lga_code_2021),
      row.lga_name,
      2021,
      2036,
      oneDecimal(number(row.vif_population_growth_2021_2036_pct, `${row.lga_name} population growth`)),
      oneDecimal(number(row.vif_dwelling_growth_2021_2036_pct, `${row.lga_name} dwelling growth`)),
      oneDecimal(number(row.growth_pressure_indicator, `${row.lga_name} growth pressure`)),
      sourceFile,
    ]);
    await connection.query(
      `INSERT INTO \`${tableName}\` (${columns.map(column => `\`${column}\``).join(',')}) VALUES ${placeholders}`,
      parameters,
    );
  }
}

async function main() {
  const rows = parseCsv(await readFile(sourcePath, 'utf8'));
  requireRows(rows);

  const pool = getAivenPool();
  const connection = await pool.getConnection();
  try {
    const schemaSql = await readFile(schemaPath, 'utf8');
    for (const statement of schemaSql.split(';').map(value => value.trim()).filter(Boolean)) {
      await connection.query(statement);
    }

    const [masterRows] = await connection.query('SELECT lga_code_2021_abs, lga_name FROM stg_master_dataset_56_lga');
    const masterByCode = new Map(masterRows.map(row => [lgaCode(row.lga_code_2021_abs), row.lga_name]));
    for (const row of rows) {
      const code = lgaCode(row.lga_code_2021);
      if (!masterByCode.has(code)) throw new Error(`${sourceFile} contains an LGA not in the project master table: ${code}.`);
      if (masterByCode.get(code) !== row.lga_name) {
        throw new Error(`LGA name mismatch for ${code}: ${row.lga_name} versus ${masterByCode.get(code)}.`);
      }
    }
    if (masterByCode.size !== rows.length) throw new Error(`Project master has ${masterByCode.size} LGAs; expected ${rows.length}.`);

    await connection.beginTransaction();
    await connection.query(`DELETE FROM \`${tableName}\``);
    await insertBatches(connection, rows);
    await connection.query(
      `INSERT INTO schema_version (version_id, applied_at, description)
       VALUES (?, CURRENT_TIMESTAMP, ?)
       ON DUPLICATE KEY UPDATE applied_at = VALUES(applied_at), description = VALUES(description)`,
      [schemaVersion, 'Imported the reviewed 2021–2036 VIF growth pressure indicator for all 56 project LGAs.'],
    );
    await connection.commit();

    const [counts] = await connection.query(`SELECT COUNT(*) AS row_count, MIN(growth_pressure_indicator) AS min_indicator, MAX(growth_pressure_indicator) AS max_indicator FROM \`${tableName}\``);
    console.log(JSON.stringify({ schemaVersion, table: tableName, sourceFile, ...counts[0] }, null, 2));
  } catch (error) {
    try { await connection.rollback(); } catch { /* keep original error */ }
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
