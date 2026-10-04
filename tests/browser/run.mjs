import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const production = process.argv.includes('--production');
const port = process.env.TEST_PORT || '5180';
const base = process.env.APP_URL || `http://127.0.0.1:${port}/`;
let server, browser;
const errors = [];
async function startServer() {
  if (process.env.APP_URL) return;
  if (production)
    execFileSync(process.execPath, ['scripts/build-pages.js'], {
      cwd: root,
      stdio: 'inherit',
    });
  server = spawn(
    process.execPath,
    production ? ['server.js', 'dist'] : ['server.js'],
    {
      cwd: root,
      env: { ...process.env, PORT: port },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  server.stdout.on('data', (chunk) => (output += chunk));
  server.stderr.on('data', (chunk) => (output += chunk));
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw Error(`Test server exited: ${output}`);
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error(`Test server did not become ready: ${output}`);
}
async function pageFor({
  demo = true,
  mock,
  hasTouch = false,
  width = 390,
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    serviceWorkers: 'block',
    hasTouch,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36',
  });
  if (mock) await context.addInitScript({ content: mock });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(base).origin)
      errors.push(`Unexpected external request: ${request.url()}`);
  });
  await page.goto(new URL(demo ? '?demo=1' : '', base).href);
  // Stabilize computed-style checks; the production UI still uses its transitions.
  await page.addStyleTag({
    content:
      '*,*::before,*::after{transition:none!important;animation:none!important}',
  });
  return { context, page };
}
async function waitReady(page) {
  await page.waitForFunction(
    () => !document.querySelector('#global-bypass-shortcut').disabled,
  );
}
async function checkBypass(page) {
  const button = page.locator('#global-bypass-shortcut');
  for (const slot of [0, 1]) {
    await page.locator(`[data-slot="${slot}"]`).click();
    await waitReady(page);
    const name = await page.locator('#preset-name').innerText(),
      number = await page.locator('#preset-number').innerText();
    const neighbors = await page
      .locator('.preset-navigation button:not(#global-bypass-shortcut)')
      .allTextContents();
    const cPreset = await page
      .locator('[data-slot="2"] .slot-preset')
      .innerText();
    await button.click();
    assert.equal(
      await button.getAttribute('aria-pressed'),
      'false',
      'single click must not bypass in double mode',
    );
    await button.dblclick();
    await waitReady(page);
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#preset-name').innerText(), name);
    assert.equal(await page.locator('#preset-number').innerText(), number);
    assert.equal(await page.locator('#preset-status').innerText(), 'Bypassed');
    assert.ok(await page.locator('.parameters-card').isHidden());
    assert.deepEqual(
      await page
        .locator('.preset-navigation button:not(#global-bypass-shortcut)')
        .allTextContents(),
      neighbors,
    );
    for (const selector of [
      '.tone-card',
      '.slot-buttons button.active',
      '.effect-block.selected',
    ])
      assert.equal(
        await page
          .locator(selector)
          .evaluate((el) => getComputedStyle(el).boxShadow),
        'none',
      );
    assert.equal(
      await page
        .locator('.effect-block.selected')
        .evaluate((el) => getComputedStyle(el).outlineStyle),
      'none',
    );
    const neutral = await page
      .locator('.effect-block')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    for (const selector of [
      '.effect-block',
      '.slot-buttons button',
      '.preset-navigation button:not(#global-bypass-shortcut)',
    ])
      assert.ok(
        (
          await page
            .locator(selector)
            .evaluateAll((els) =>
              els.map((el) => getComputedStyle(el).backgroundColor),
            )
        ).every((color) => color === neutral),
      );
    assert.notEqual(
      await button.evaluate((el) => getComputedStyle(el).backgroundColor),
      neutral,
    );
    await page.locator('#nav-settings').click();
    await page.waitForFunction(
      () => !document.querySelector('#refresh-settings').disabled,
    );
    await page.locator('#nav-editor').click();
    assert.equal(await page.locator('#preset-number').innerText(), number);
    await button.dblclick();
    await waitReady(page);
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#preset-status').innerText(), 'Active');
    assert.ok(await page.locator('.parameters-card').isVisible());
    assert.equal(
      await page.locator('[data-slot="2"] .slot-preset').innerText(),
      cPreset,
    );
    assert.equal(
      await page.locator(`[data-slot="${slot}"]`).getAttribute('aria-pressed'),
      'true',
    );
  }
  // Navigation from bypass must restore B before loading its neighbor, leaving C assigned.
  await page.locator('[data-slot="1"]').click();
  await waitReady(page);
  const number = Number(
    (await page.locator('#preset-number').innerText()).match(/PRESET (\d+)/)[1],
  );
  const cPreset = await page
    .locator('[data-slot="2"] .slot-preset')
    .innerText();
  await button.dblclick();
  await waitReady(page);
  await page.locator('#next-preset').click();
  await waitReady(page);
  assert.equal(await button.getAttribute('aria-pressed'), 'false');
  assert.equal(
    await page.locator('[data-slot="1"]').getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    await page.locator('#preset-number').innerText(),
    `PRESET ${String(number + 1).padStart(2, '0')} / 20`,
  );
  assert.equal(
    await page.locator('[data-slot="2"] .slot-preset').innerText(),
    cPreset,
  );
}
async function checkNumberedNames(page) {
  assert.equal(
    await page.locator('#preset-name').innerText(),
    '01 British Breakup',
  );
  for (const [slot, number] of [
    [0, '01'],
    [1, '02'],
    [2, '03'],
  ])
    assert.ok(
      (
        await page.locator(`[data-slot="${slot}"] .slot-preset`).innerText()
      ).startsWith(number + ' '),
    );
  assert.ok(
    (await page.locator('#next-preset small').innerText()).startsWith('02 '),
  );
  await page.locator('[data-slot="1"]').click();
  assert.equal(
    await page.locator('#preset-name').innerText(),
    '02 California Clean',
  );
  assert.ok(
    (await page.locator('#previous-preset small').innerText()).startsWith(
      '01 ',
    ),
  );
  assert.ok(
    (await page.locator('#next-preset small').innerText()).startsWith('03 '),
  );
  await page.locator('[data-slot="0"]').click();
}
async function setCabinetBypass(page, on) {
  const button = page.locator('[data-global-toggle="cabBypass"]');
  await page.locator('#nav-settings').click();
  await page.waitForFunction(
    () => !document.querySelector('[data-global-toggle="cabBypass"]').disabled,
  );
  if ((await button.getAttribute('aria-pressed')) !== String(on))
    await button.click();
  await page.waitForFunction(
    () => !document.querySelector('[data-global-toggle="cabBypass"]').disabled,
  );
  assert.equal(await button.getAttribute('aria-pressed'), String(on));
}
async function demoChecks() {
  const { context, page } = await pageFor();
  await checkNumberedNames(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const view of ['presets', 'editor', 'settings']) {
        await page.locator('#nav-' + view).click();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        assert.equal(
          await page.locator('.mobile-nav button:visible').count(),
          3,
        );
      }
    }
    assert.equal(await page.locator('.global-setting').count(), 7);
    await setCabinetBypass(page, true);
    await page.locator('#nav-editor').click();
    await checkBypass(page);
    await page.locator('#nav-settings').click();
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-global-toggle="cabBypass"]').disabled,
    );
    assert.equal(
      await page
        .locator('[data-global-toggle="cabBypass"]')
        .getAttribute('aria-pressed'),
      'true',
    );
    await setCabinetBypass(page, false);
    await page.locator('#nav-editor').click();
  }
  await page.locator('#nav-settings').click();
  await page.locator('#activation-method').click();
  assert.equal(
    await page.locator('#activation-method').innerText(),
    'Single tap',
  );
  await page.locator('#nav-editor').click();
  const gate = page.locator('[data-effect="gate"]'),
    before = await gate.locator('.effect-state').innerText();
  await gate.click();
  assert.notEqual(await gate.locator('.effect-state').innerText(), before);
  await page.locator('#global-bypass-shortcut').click();
  assert.equal(await page.locator('#preset-status').innerText(), 'Bypassed');
  await page.locator('#global-bypass-shortcut').click();
  await page.reload();
  await page.locator('#nav-settings').click();
  assert.equal(
    await page.locator('#activation-method').innerText(),
    'Single tap',
  );
  await page.locator('#activation-method').click();
  assert.equal(
    await page.locator('#activation-method').innerText(),
    'Double tap',
  );
  await page.locator('#nav-editor').click();
  await page.locator('[data-effect="amp"]').click();
  await page.locator('#value-20').fill('3.5');
  await page.locator('#value-20').press('Tab');
  assert.equal(await page.locator('#value-20').inputValue(), '3.5');
  assert.equal(await page.locator('#range-20').getAttribute('step'), '1');
  for (const effect of ['mod', 'delay']) {
    await page.locator(`[data-effect="${effect}"]`).click();
    await page.locator('.division-buttons button').first().click();
    assert.equal(
      await page.locator('[aria-label="Sync"]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page
        .locator('.division-buttons button')
        .first()
        .getAttribute('aria-pressed'),
      'true',
    );
  }
  await page.locator('[data-effect="tempo"]').click();
  await page.locator('#tempo-value').fill('120.5');
  await page.locator('#tempo-value').dispatchEvent('input');
  await page.locator('#tempo-up').click();
  assert.equal(await page.locator('#tempo-value').inputValue(), '121.5');
  await page.locator('#apply-tempo').click();
  assert.ok(
    (await page.locator('[data-effect="tempo"]').innerText()).includes(
      '121.5 BPM',
    ),
  );
  await context.close();
  const touch = await pageFor({ hasTouch: true });
  const card = touch.page.locator('[data-effect="gate"]'),
    initial = await card.locator('.effect-state').innerText();
  await card.tap();
  await card.tap();
  assert.notEqual(await card.locator('.effect-state').innerText(), initial);
  await touch.context.close();
  console.log(
    'Demo: responsive themes, tabs, activation persistence, touch toggles, parameters, Division, tempo, and bypass verified.',
  );
}
async function mockedPedalChecks() {
  const mock = await build({
    absWorkingDir: root,
    stdin: {
      contents: `import {Device} from './tests/mock-device.js';window.pedal=new Device();Object.defineProperty(navigator,'usb',{value:{addEventListener(){},requestDevice:async()=>window.pedal}});`,
      resolveDir: root,
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
  });
  const { context, page } = await pageFor({
    demo: false,
    mock:
      mock.outputFiles[0].text +
      `localStorage.setItem('tonex-last-read', JSON.stringify({device:'OLD-SERIAL',presets:[]}));localStorage.setItem('tonex-theme','light');`,
  });
  await page.locator('#connect').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#global-masterVolume').value === '6.5' &&
      !document.querySelector('#global-masterVolume').disabled,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem('tonex-last-read')),
    null,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem('tonex-theme')),
    'light',
  );
  await page.evaluate(() => document.fonts.ready);
  assert.ok(
    await page.evaluate(() =>
      [...document.fonts].some(
        (font) => font.family === 'DM Sans' && font.status === 'loaded',
      ),
    ),
  );
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => document.querySelector('#export-presets').click());
  const download = await downloadPromise;
  const settings = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(Object.hasOwn(settings, 'device'), false);
  assert.equal(settings.presets.length, 20);
  assert.ok(
    settings.presets.every((preset) => preset.name && preset.parameters.length),
  );
  assert.equal(JSON.stringify(settings).includes('TEST'), false);
  await page.locator('#nav-settings').click();
  await page.waitForFunction(
    () => !document.querySelector('#global-masterVolume').disabled,
  );
  for (const [key, value] of [
    ['masterVolume', 7.2],
    ['inputTrim', -4.5],
    ['tuningReference', 432],
  ]) {
    await page.locator('#global-' + key).fill(String(value));
    await page.locator('#global-' + key).press('Tab');
    await page.waitForFunction(
      (key) => !document.querySelector('#global-' + key).disabled,
      key,
    );
    assert.equal(
      Number(await page.locator('#global-' + key).inputValue()),
      value,
    );
  }
  assert.ok(
    Math.abs((await page.evaluate(() => window.pedal.masterVolume)) - 7.2) <
      0.01,
  );
  await page.locator('[data-global-toggle="directMonitoring"]').click();
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-global-toggle="directMonitoring"]')
        .disabled,
  );
  assert.equal(
    await page
      .locator('[data-global-toggle="directMonitoring"]')
      .getAttribute('aria-pressed'),
    'false',
  );
  await setCabinetBypass(page, false);
  await setCabinetBypass(page, true);
  await page.locator('#nav-editor').click();
  await checkBypass(page);
  await page.locator('#nav-settings').click();
  await page.waitForFunction(
    () => !document.querySelector('[data-global-toggle="cabBypass"]').disabled,
  );
  assert.equal(
    await page
      .locator('[data-global-toggle="cabBypass"]')
      .getAttribute('aria-pressed'),
    'true',
  );
  await setCabinetBypass(page, false);
  await page.locator('#nav-editor').click();
  await page.locator('#nav-settings').click();
  await page.waitForFunction(
    () => !document.querySelector('#global-masterVolume').disabled,
  );
  assert.equal(
    await page
      .locator('[data-global-toggle="directMonitoring"]')
      .getAttribute('aria-pressed'),
    'false',
  );
  await page.locator('#connect').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#status-text').textContent === 'Not connected',
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem('tonex-last-read')),
    null,
  );
  await context.close();
  const legacy = await build({
    absWorkingDir: root,
    stdin: {
      contents: `import {Device} from './tests/mock-device.js';import {FrameDecoder,messageType} from './src/protocol.js';const d=new Device(),transfer=d.transferOut.bind(d);d.transferOut=async(endpoint,data)=>{let request=false;new FrameDecoder(p=>request=messageType(p)===0x030d).push(data);return request?{status:'ok',bytesWritten:data.length}:transfer(endpoint,data);};Object.defineProperty(navigator,'usb',{value:{addEventListener(){},requestDevice:async()=>d}});`,
      resolveDir: root,
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
  });
  const unsupported = await pageFor({
    demo: false,
    mock: legacy.outputFiles[0].text,
  });
  await unsupported.page.locator('#connect').click();
  await unsupported.page.waitForFunction(() =>
    document
      .querySelector('#global-controls')
      .textContent.includes('Master volume is unavailable'),
  );
  await unsupported.page.locator('#nav-settings').click();
  await unsupported.page.waitForFunction(
    () => !document.querySelector('#global-inputTrim').disabled,
  );
  assert.ok(
    await unsupported.page.locator('#global-masterVolume').isDisabled(),
  );
  assert.ok(
    await unsupported.page
      .locator('[data-global-toggle="directMonitoring"]')
      .isEnabled(),
  );
  await unsupported.context.close();
  console.log(
    'Simulated USB: automatic Master read, confirmed global writes, bypass restoration, monitoring preservation, and unsupported firmware verified.',
  );
}
try {
  await startServer();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  await demoChecks();
  await mockedPedalChecks();
  assert.deepEqual(errors, []);
  console.log('Browser checks passed without JavaScript errors.');
} finally {
  await browser?.close();
  if (server) {
    server.kill('SIGTERM');
    await new Promise((resolve) =>
      server.exitCode !== null ? resolve() : server.once('exit', resolve),
    );
  }
}
