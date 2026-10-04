import { mkdir, copyFile, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { build, transform } from 'esbuild';
import { APP_VERSION } from '../src/version.js';
const root = fileURLToPath(new URL('../', import.meta.url)),
  output = path.join(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const bundle = await build({
  absWorkingDir: root,
  entryPoints: {
    app: 'src/app.js',
    theme: 'src/theme.js',
    style: 'src/style.css',
  },
  outdir: path.join(output, 'assets'),
  entryNames: '[name]-[hash]',
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: false,
  external: ['../public/fonts/*'],
  legalComments: 'none',
  write: false,
  banner: {
    js: '/*! TXOne-Studio: MIT. Third-party notices: ../THIRD_PARTY_LICENSES.txt */',
    css: '/*! TXOne-Studio: MIT. Third-party notices: ../THIRD_PARTY_LICENSES.txt */',
  },
});
await mkdir(path.join(output, 'assets'));
for (const file of bundle.outputFiles)
  await writeFile(file.path, file.contents);
const assets = bundle.outputFiles.map((file) =>
  path.relative(output, file.path).split(path.sep).join('/'),
);
const asset = (name) =>
  assets.find((file) => file.startsWith(`assets/${name}-`));
for (const page of ['index.html', 'getting-started.html']) {
  let html = await readFile(path.join(root, page), 'utf8');
  for (const [source, name] of [
    ['app.js', 'app'],
    ['theme.js', 'theme'],
    ['style.css', 'style'],
  ])
    html = html.replace(`./src/${source}`, `./${asset(name)}`);
  await writeFile(path.join(output, page), html);
}
for (const file of [
  'manifest.webmanifest',
  'THIRD_PARTY_LICENSES.txt',
  'LICENSE',
  'sitemap.xml',
])
  await copyFile(path.join(root, file), path.join(output, file));
for (const directory of ['public', 'licenses'])
  await cp(path.join(root, directory), path.join(output, directory), {
    recursive: true,
  });
const revision = createHash('sha256')
  .update(bundle.outputFiles.map((file) => file.text).join('\n'))
  .digest('hex')
  .slice(0, 12);
const shell = [
  './',
  'index.html',
  'getting-started.html',
  ...assets,
  'manifest.webmanifest',
  'public/icon.svg',
  'public/fonts/dm-sans-latin-ext.woff2',
  'public/fonts/dm-sans-latin.woff2',
  'public/fonts/manrope-cyrillic-ext.woff2',
  'public/fonts/manrope-cyrillic.woff2',
  'public/fonts/manrope-greek.woff2',
  'public/fonts/manrope-vietnamese.woff2',
  'public/fonts/manrope-latin-ext.woff2',
  'public/fonts/manrope-latin.woff2',
  'LICENSE',
  'THIRD_PARTY_LICENSES.txt',
  'licenses/Apache-2.0.txt',
  'licenses/OFL-dmsans.txt',
  'licenses/OFL-manrope.txt',
];
const workerSource = await readFile(path.join(root, 'sw.js'), 'utf8');
const cacheDeclaration = /const CACHE\s*=\s*[^;]+;/;
const shellDeclaration = /const SHELL\s*=\s*\[[\s\S]*?\]\s*\.map/;
if (
  !cacheDeclaration.test(workerSource) ||
  !shellDeclaration.test(workerSource)
)
  throw Error(
    'Service worker declarations changed; update the build transformation before publishing.',
  );
const worker = workerSource
  .replace(
    cacheDeclaration,
    `const CACHE=PREFIX+'release-${APP_VERSION}-${revision}';`,
  )
  .replace(shellDeclaration, `const SHELL=${JSON.stringify(shell)}.map`);
await writeFile(
  path.join(output, 'sw.js'),
  (
    await transform(worker, {
      minify: true,
      target: 'es2022',
      sourcemap: false,
    })
  ).code,
);
console.log(
  `Built TXOne-Studio ${APP_VERSION}: ${assets.length} minified assets, no source maps.`,
);
