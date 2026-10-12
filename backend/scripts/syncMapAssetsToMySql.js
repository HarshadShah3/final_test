import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeAivenPool, getAivenPool } from '../src/database/aivenClient.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(scriptDirectory, '..');
const sourceVersion = process.argv.slice(2).find(value => value !== '--') ?? 'map-assets-v1';

const [lgaBoundaryText, victoriaBoundaryText] = await Promise.all([
  readFile(path.join(backendDirectory, 'data-sources/lga_boundaries.geojson'), 'utf8'),
  readFile(path.join(backendDirectory, 'data-sources/victoria_boundary.geojson'), 'utf8'),
]);
const datasets = [
  ['lga_boundaries', JSON.parse(lgaBoundaryText)],
  ['victoria_boundary', JSON.parse(victoriaBoundaryText)],
];

const connection = await getAivenPool().getConnection();
try {
  await connection.beginTransaction();
  await connection.query(`
    CREATE TABLE IF NOT EXISTS website_dataset (
      dataset_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      payload_json JSON NOT NULL,
      source_version VARCHAR(80) NOT NULL,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB
  `);

  for (const [datasetKey, payload] of datasets) {
    await connection.execute(`
      INSERT INTO website_dataset (dataset_key, payload_json, source_version)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        payload_json = VALUES(payload_json),
        source_version = VALUES(source_version)
    `, [datasetKey, JSON.stringify(payload), sourceVersion]);
  }

  const [rows] = await connection.query(`
    SELECT dataset_key AS datasetKey
    FROM website_dataset
    WHERE dataset_key IN ('lga_boundaries', 'victoria_boundary')
  `);
  if (rows.length !== datasets.length) {
    throw new Error(`MySQL verification failed: expected ${datasets.length} map assets, received ${rows.length}.`);
  }

  await connection.commit();
  console.log(`Synced ${rows.length} map assets to Aiven MySQL (${sourceVersion}).`);
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await closeAivenPool();
}
