import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [stage, htmlPath, zipPath, outputPath] = process.argv.slice(2);
if (!stage || !htmlPath || !zipPath || !outputPath) throw new Error('Provide stage, HTML, ZIP and output JSON paths.');
const [html, zip] = await Promise.all([readFile(htmlPath), readFile(zipPath)]);
const result = {
  stage,
  html: { path: resolve(htmlPath), bytes: html.length, sha256: createHash('sha256').update(html).digest('hex') },
  zip: { path: resolve(zipPath), bytes: zip.length, sha256: createHash('sha256').update(zip).digest('hex') }
};
await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
