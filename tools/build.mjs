import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateFiles } from './validate-data.mjs';
import { validateFieldGuideFiles } from './validate-field-guide.mjs';
import { validateMeasurementAuditFiles } from './validate-measurement-audit.mjs';
import { validateBorAlignmentsFiles } from './validate-bor-alignments.mjs';
import { appData } from './app-data.mjs';
import { packRouteGeometries } from './pack-route-geometry.mjs';
import { restoreRouteGeometries } from '../src/geometry-package.js';
import { isDeepStrictEqual } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const validation = await validateFiles();
if (validation.errors.length) throw new Error(`Atlas validation failed:\n${validation.errors.join('\n')}`);
const guideValidation = await validateFieldGuideFiles(validation.atlas, validation.sources);
if (guideValidation.errors.length) throw new Error(`Field-guide validation failed:\n${guideValidation.errors.join('\n')}`);
const measurementValidation = await validateMeasurementAuditFiles(validation.atlas, guideValidation.guide, validation.sources);
if (measurementValidation.errors.length) throw new Error(`Measurement audit failed:\n${measurementValidation.errors.join('\n')}`);
const borValidation = await validateBorAlignmentsFiles(validation.atlas, validation.sources, validation.coverage);
if (borValidation.errors.length) throw new Error(`Bor alignment audit failed:\n${borValidation.errors.join('\n')}`);
const read = file => readFile(path.join(root, ...file.split('/')), 'utf8');
const geometryInputs = {
  atlas: appData(JSON.parse(await read('data/atlas.json'))),
  bor: appData(JSON.parse(await read('data/bor-road-options.json')))
};
const encodingOption = process.argv.find(argument => argument.startsWith('--geometry-encoding='));
const encoding = encodingOption ? encodingOption.slice('--geometry-encoding='.length) : 'polyline6';
const packed = packRouteGeometries(geometryInputs, { encoding });
const reconstructed = structuredClone(packed.documents);
restoreRouteGeometries(Object.values(reconstructed), packed.geometryPackage);
if (!isDeepStrictEqual(reconstructed, geometryInputs) || JSON.stringify(reconstructed) !== JSON.stringify(geometryInputs)) {
  throw new Error('Packed geometry does not reproduce the original application data exactly.');
}
const packedJson = new Map([
  [path.join(root, 'data', 'atlas.json').toLowerCase(), packed.documents.atlas],
  [path.join(root, 'data', 'bor-road-options.json').toLowerCase(), packed.documents.bor]
]);
await writeFile(path.join(root, 'THIRD-PARTY-NOTICES.txt'), await read('node_modules/maplibre-gl/LICENSE.txt'), 'utf8');
const worker = await build({
  entryPoints: [path.join(root, 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl-worker.mjs')],
  bundle: true,
  write: false,
  format: 'iife',
  minify: true,
  target: 'es2022',
  legalComments: 'inline'
});
const app = await build({
  entryPoints: [path.join(root, 'src', 'main.js')],
  bundle: true,
  write: false,
  format: 'iife',
  minify: true,
  target: 'es2022',
  loader: { '.txt': 'text' },
  plugins: [{
    name: 'application-data',
    setup(builder) {
      builder.onResolve({ filter: /^atlas:route-geometry$/ }, () => ({ path: 'route-geometry', namespace: 'atlas-geometry' }));
      builder.onLoad({ filter: /.*/, namespace: 'atlas-geometry' }, () => ({
        contents: JSON.stringify(packed.geometryPackage), loader: 'json'
      }));
      builder.onLoad({ filter: /\.json$/ }, async args => ({
        contents: JSON.stringify(packedJson.get(args.path.toLowerCase()) ?? appData(JSON.parse(await readFile(args.path, 'utf8')))), loader: 'json'
      }));
    }
  }],
  define: { __ATLAS_WORKER__: JSON.stringify(worker.outputFiles[0].text) },
  legalComments: 'inline'
});
const [template, css, mapCss] = await Promise.all([
  read('src/index.template.html'),
  read('src/styles.css'),
  read('node_modules/maplibre-gl/dist/maplibre-gl.css')
]);
const escapeScript = text => text.replace(/<\/script/gi, '<\\/script');
const html = template
  .replace('/* ATLAS_STYLES */', () => `${mapCss}\n${css}`)
  .replace('/* ATLAS_SCRIPT */', () => escapeScript(app.outputFiles[0].text));
if (html.includes('/* ATLAS_')) throw new Error('Unresolved build placeholders');
await writeFile(path.join(root, 'pune_to_konkan.html'), html, 'utf8');
console.log(`Built pune_to_konkan.html (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB), including worker and application assets.`);
console.log(`Exact shared arcs (${encoding}): ${JSON.stringify(packed.stats)}`);
