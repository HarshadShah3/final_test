import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function readJsonFile(deployedPath) {
  const backendRelativePath = deployedPath.replace(/^backend[\\/]/, '');
  const candidates = [
    resolve(process.cwd(), deployedPath),
    resolve(process.cwd(), backendRelativePath),
  ];
  const filePath = candidates.find(candidate => existsSync(candidate));

  if (!filePath) {
    throw new Error(`Required data file is missing: ${deployedPath}`);
  }

  return JSON.parse(readFileSync(filePath, 'utf8'));
}
