import { BypassSession } from './bypass-session.js';
import { $ } from './ui/dom.js';
import {
  renderPresetWorkspace,
  renderNavigation,
} from './ui/preset-workspace.js';
import { groups, quickToggle, format } from './effect-metadata.js';
import { renderPresetsPanel } from './ui/presets-panel.js';
import { renderEditorPanel } from './ui/editor-panel.js';
import { renderSettingsPanel } from './ui/settings-panel.js';
import { createSignalChain } from './ui/signal-chain.js';
import { presetDisplayColor } from './preset-colors.js';
import { writeSyncedDivision } from './synced-division.js';
import { TapTempo } from './tap-tempo.js';
import { APP_VERSION } from './version.js';
import { CabinetModes } from './cabinet-mode.js';
import { createPedalConnection } from './serial.js';
import { parameters } from './parameters.js';
import { bindEffectInteractions } from './effect-interactions.js';
const usb = createPedalConnection(),
  cabinetModes = new CabinetModes();
$('app-version').textContent = `v${APP_VERSION}`;
let activationMethod = 'double';
try {
  if (localStorage.getItem('txone-activation') === 'single')
    activationMethod = 'single';
} catch {}
const bypassSession = new BypassSession();
let masterVolume = null,
  masterUnavailable = false,
  settingsReading = false;
let demo = false,
  busy = false,
  scanning = false,
  pedalState = null,
  presets = [],
  selected = null,
  effect = 'amp',
  params = [];
const tapTempo = new TapTempo(),
  confirmedSync = new Map();
let tapTimer,
  pendingTapTempo = null,
  tapPreview = null,
  tapWriting = false;
let confirmationTimer,
  pendingWrites = new Map(),
  writeTimer,
  session = 0;

const active = () => pedalState?.slots[pedalState.activeSlot];
const ready = () => !busy && (demo || usb.connected) && !!pedalState;
const editable = () =>
  ready() &&
  selected === active() &&
  params.length === 109 &&
  params.every(Number.isFinite);

function panelState() {
  return {
    presets,
    pedalState,
    selected,
    busy,
    demo,
    effect,
    params,
    tapPreview,
    activationMethod,
    activePresetId: active(),
    ready: ready(),
    editable: editable(),
    connected: usb.connected,
    masterVolume,
    masterUnavailable,
    settingsReading,
    bypassDescription: bypassDescription(),
    displayedPreset: bypassSession.displayPreset(
      pedalState,
      presets.find((p) => p.id === selected),
    ),
    navigationSlot: bypassSession.navigationSlot(pedalState),
    previousPreset: adjacentPreset(-1),
    nextPreset: adjacentPreset(1),
  };
}
function renderPresetNavigation() {
  renderNavigation(panelState());
}
function renderPresets() {
  renderPresetsPanel(panelState(), { loadPreset });
}
function renderControls() {
  renderEditorPanel(panelState(), {
    applyParameter,
    applyDivision,
    updateControl,
    toggleEffect,
    applyManualTempo,
  });
}
function renderSettings() {
  renderSettingsPanel(panelState(), {
    notify,
    applyGlobalSetting,
    renderSettings,
    changeActivation,
  });
}
function changeActivation() {
  activationMethod = activationMethod === 'double' ? 'single' : 'double';
  try {
    localStorage.setItem('txone-activation', activationMethod);
  } catch {}
  renderChain();
  renderPresetNavigation();
  renderSettings();
}
const renderChain = createSignalChain({
  getState: panelState,
  selectEffect: (id) => {
    effect = id;
    renderChain();
    renderControls();
  },
  toggleEffect,
  tapGlobalTempo,
});
function notify(message, success = false) {
  $('notice').hidden = false;
  $('notice').textContent = message;
  $('notice').classList.toggle('success', success);
}
function download(filename, data) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    ),
    a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function changeView(view) {
  document.body.dataset.view = view;
  for (const id of ['presets', 'editor', 'settings']) {
    const button = $(`nav-${id}`);
    button.classList.toggle('active', view === id);
    button.setAttribute('aria-pressed', String(view === id));
  }
  if (view === 'settings') {
    renderSettings();
    if (ready() && !demo && !settingsReading) void refreshSettings();
  }
}
function toggleEffect(g) {
  if (!quickToggle.has(g.id)) return;
  if (!editable()) {
    notify('Load this preset and connect your pedal before switching effects.');
    return;
  }
  effect = g.id;
  if (g.id === 'cab')
    applyParameter(24, cabinetModes.toggled(selected, params[24]), true);
  else applyParameter(g.enable, params[g.enable] === 1 ? 0 : 1, true);
}
function updateControl(index) {
  const p = parameters[index],
    v = params[index];
  if ($(`range-${index}`)) $(`range-${index}`).value = v;
  if ($(`value-${index}`) && document.activeElement !== $(`value-${index}`))
    $(`value-${index}`).value = format(v, p);
}
function render() {
  document.body.classList.toggle('global-bypassed', !!pedalState?.bypass);
  bypassSession.reconcile(pedalState, busy);
  const online = demo || usb.connected;
  renderPresets();
  renderChain();
  renderControls();
  renderPresetWorkspace(panelState());
  $('status-text').textContent = busy
    ? scanning
      ? 'Reading presets…'
      : 'Connecting / syncing…'
    : demo
      ? 'Demo mode'
      : usb.connected
        ? usb.transport === 'webserial'
          ? 'USB serial connected'
          : 'USB connected'
        : 'Not connected';
  $('status-dot').className = usb.connected ? 'live' : '';
  $('connect').textContent = usb.connected ? 'Disconnect' : '↗ Connect pedal';
  $('connect').disabled = busy;
  $('refresh').disabled = !online || busy;
  $('refresh').classList.toggle('spinner', scanning);
  renderPresetNavigation();
  $('welcome').hidden = online;
  $('demo-banner').hidden = !demo;
  $('firmware-info').hidden = !usb.connected;
  $('firmware-info').textContent = usb.connected
    ? `Firmware ${usb.firmware || 'unknown'}`
    : '';
  $('export-presets').disabled = !presets.some((p) => p.read) || busy;
  renderSettings();
}
function adjacentPreset(direction) {
  const navigationPreset = bypassSession.displayPreset(pedalState, {
    id: selected,
  }).id;
  const index = presets.findIndex((p) => p.id === navigationPreset);
  return index < 0 ? null : presets[index + direction];
}
async function loadPreset(id) {
  const target = presets.find((p) => p.id === id);
  if (!ready() || !target?.read) return;
  changeView('editor');
  if (pedalState.bypass && bypassSession.preset) {
    await applyGlobalSetting('bypass', false);
    if (!ready() || pedalState.bypass) return;
  }
  if (id === active()) {
    selected = id;
    params = target.parameters.slice();
    effect = 'amp';
    render();
    return;
  }
  await runStateChange({ preset: id, slot: pedalState.activeSlot });
}
async function applyDivision(index, value) {
  if (
    !editable() ||
    !parameters[index]?.id.endsWith('_TS') ||
    !parameters[index - 1]?.id.endsWith('_SYNC')
  )
    return;
  if (demo) {
    applyParameter(index - 1, 1);
    applyParameter(index, value, true);
    return;
  }
  const epoch = session,
    id = active(),
    syncIndex = index - 1,
    writes = new Map(pendingWrites);
  const syncEnabled =
      params[syncIndex] === 1 &&
      confirmedSync.get(`${id}:${syncIndex}`) === 1 &&
      !pendingWrites.has(syncIndex),
    previous = params.slice();
  writes.delete(syncIndex);
  writes.delete(index);
  cancelWrites();
  params = params.slice();
  params[syncIndex] = 1;
  params[index] = value;
  busy = true;
  render();
  $('parameter-note').textContent = 'Applying Division…';
  try {
    const detail = await writeSyncedDivision(usb, id, index, value, {
      writes,
      syncEnabled,
      isCurrent: () => epoch === session && active() === id,
    });
    if (epoch !== session || active() !== id) return;
    storePreset(id, detail);
    params = detail.parameters;
    $('notice').hidden = true;
  } catch (e) {
    if (epoch === session) {
      params = previous;
      if (e.detail) {
        storePreset(id, e.detail);
        params = e.detail.parameters;
      } else
        try {
          const detail = await usb.getPreset(id);
          if (epoch === session && active() === id) {
            storePreset(id, detail);
            params = detail.parameters;
          }
        } catch {}
      if (epoch === session) notify(`Division update failed: ${e.message}`);
    }
  } finally {
    if (epoch === session) {
      busy = false;
      render();
    }
  }
}
function cancelWrites() {
  pendingWrites.clear();
  clearTimeout(writeTimer);
  clearTimeout(confirmationTimer);
}
async function flushWrites() {
  const writes = [...pendingWrites];
  pendingWrites.clear();
  const epoch = session;
  if (!writes.length || demo || !editable()) return;
  try {
    for (const [index, value] of writes) {
      if (epoch !== session || !editable()) return;
      await usb.writeParameter(index, value);
    }
  } catch (e) {
    if (epoch === session) {
      notify(`Parameter write failed: ${e.message}`);
    }
  }
  clearTimeout(confirmationTimer);
  confirmationTimer = setTimeout(() => {
    if (epoch === session && !pendingWrites.size) void confirmParameters();
  }, 500);
}
async function confirmParameters() {
  if (!usb.connected || busy || scanning || selected !== active()) return;
  const epoch = session,
    id = active();
  try {
    const detail = await usb.getPreset(id);
    if (
      epoch !== session ||
      active() !== id ||
      selected !== id ||
      pendingWrites.size
    )
      return;
    storePreset(id, detail);
    params = detail.parameters;
    renderChain();
    renderControls();
  } catch (e) {
    if (epoch === session) {
      usb.log('error', e.message);
    }
  }
}
function applyParameter(index, value, rebuild = false) {
  if (!editable()) return;
  const p = parameters[index];
  value = Math.max(p.min, Math.min(p.max, value));
  if (p.type !== 'range') value = Math.round(value);
  if (!Number.isFinite(value)) return;
  if (p.id.endsWith('_SYNC')) confirmedSync.delete(`${selected}:${index}`);
  if (index === 24) cabinetModes.remember(selected, value);
  params[index] = value;
  presets[selected].parameters = params.slice();
  if (!demo) {
    pendingWrites.set(index, value);
    clearTimeout(writeTimer);
    writeTimer = setTimeout(flushWrites, 80);
  }
  updateControl(index);
  if (rebuild) {
    renderChain();
    renderControls();
  }
}
function resetTapTempo() {
  clearTimeout(tapTimer);
  tapTempo.reset();
  pendingTapTempo = null;
  tapPreview = null;
  tapWriting = false;
}
function tapGlobalTempo(button) {
  effect = 'tempo';
  if (
    (demo || usb.connected) &&
    pedalState &&
    !scanning &&
    (!busy || tapWriting)
  ) {
    button.getAnimations().forEach((animation) => animation.cancel());
    button.animate(
      [
        { boxShadow: '0 0 0 0 var(--accent)' },
        { boxShadow: '0 0 0 5px transparent' },
      ],
      { duration: 220 },
    );
    const tempo = tapTempo.tap(performance.now());
    if (tempo !== null) {
      tapPreview = tempo;
      pendingTapTempo = tempo;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => void flushTapTempo(), 200);
    }
  }
  renderChain();
  renderControls();
  renderSettings();
}
async function flushTapTempo() {
  if (tapWriting || pendingTapTempo === null) return;
  if (!ready()) {
    pendingTapTempo = null;
    tapPreview = null;
    renderChain();
    if (effect === 'tempo') renderControls();
    return;
  }
  const tempo = pendingTapTempo,
    epoch = session;
  pendingTapTempo = null;
  tapWriting = true;
  try {
    await applyTempo(tempo);
  } finally {
    if (epoch !== session) return;
    tapWriting = false;
    if (pendingTapTempo !== null)
      tapTimer = setTimeout(() => void flushTapTempo(), 200);
    else {
      tapPreview = null;
      renderChain();
      if (effect === 'tempo') renderControls();
    }
  }
}
async function applyManualTempo() {
  const tempo = Number($('tempo-value').value);
  resetTapTempo();
  await applyTempo(tempo);
}
async function applyTempo(tempo) {
  if (!ready()) return;
  if (!Number.isFinite(tempo) || tempo < 40 || tempo > 240) {
    notify('Enter a tempo between 40 and 240 BPM.');
    return;
  }
  const epoch = session;
  if (pendingWrites.size) await flushWrites();
  if (epoch !== session || !ready()) return;
  clearTimeout(confirmationTimer);
  busy = true;
  render();
  try {
    if (demo) pedalState.tempo = tempo;
    else {
      const state = await usb.changeState({ tempo });
      if (epoch !== session) return;
      pedalState = state;
    }
    if (epoch === session) $('notice').hidden = true;
  } catch (e) {
    if (epoch === session) notify(`Tempo update failed: ${e.message}`);
  } finally {
    if (epoch === session) {
      busy = false;
      render();
    }
  }
}
function storePreset(id, detail) {
  const existing = presets[id];
  if (!existing) return;
  parameters
    .filter((p) => p.id.endsWith('_SYNC'))
    .forEach((p) =>
      confirmedSync.set(`${id}:${p.index}`, detail.parameters?.[p.index]),
    );
  existing.name = detail.name || `Preset ${String(id + 1).padStart(2, '0')}`;
  existing.parameters = detail.parameters;
  existing.read = true;
  cabinetModes.remember(id, detail.parameters?.[24]);
}
async function scanPresets() {
  if (demo) {
    updateTimestamp();
    return;
  }
  cancelWrites();
  busy = true;
  scanning = true;
  render();
  const epoch = session;
  let read = 0;
  try {
    await usb.getState();
    presets = Array.from({ length: 20 }, (_, id) => ({
      id,
      name: `Reading preset ${String(id + 1).padStart(2, '0')}…`,
      read: false,
      parameters: [],
      color: presetDisplayColor(pedalState.colors[id]),
    }));
    for (let id = 0; id < 20; id++) {
      if (epoch !== session || !usb.connected)
        throw Error('Connection interrupted.');
      $('sync-label').textContent = `Reading ${id + 1} of 20 presets…`;
      const detail = await usb.getPreset(id);
      storePreset(id, detail);
      read++;
      renderPresets();
    }
    await usb.getState();
    selected = active();

    const detail = await usb.getPreset(selected);
    storePreset(selected, detail);
    params = detail.parameters;
    updateTimestamp();
    $('notice').hidden = true;
  } catch (e) {
    if (epoch === session) {
      notify(`Read ${read}/20 presets. ${e.message}`);
      $('sync-label').textContent = `${read}/20 presets read · Retry refresh`;
    }
  } finally {
    if (epoch === session) {
      busy = false;
      scanning = false;
      render();
    }
  }
}
async function runStateChange(change) {
  if (!ready()) return;
  cancelWrites();
  busy = true;
  render();
  const epoch = session;
  try {
    if (demo) {
      if (change.slot !== undefined)
        bypassSession.selectDemoSlot(pedalState, change.slot);
      if (change.preset !== undefined)
        pedalState.slots[change.slot] = change.preset;
      if (change.bypass !== undefined) pedalState.bypass = change.bypass;
    } else await usb.changeState(change);
    if (epoch !== session) return;

    if (!demo) {
      const detail = await usb.getPreset(active());
      if (epoch !== session) return;
      storePreset(active(), detail);
    }
    selected = active();
    if (change.preset !== undefined) effect = 'amp';
    params = presets[selected].parameters.slice();
    $('notice').hidden = true;
  } catch (e) {
    if (epoch === session) notify(e.message);
  } finally {
    if (epoch === session) {
      busy = false;
      render();
    }
  }
}
function bypassDescription() {
  const destination = demo
    ? bypassSession.demoReturnSlot
    : usb.bypassReturnSlot;
  if (pedalState?.bypass && destination !== null)
    return `Native bypass is On in Slot C. Turn Off to return to Slot ${'ABC'[destination]}.`;
  return pedalState?.stomp
    ? 'Uses native pedal bypass in Slot C (Stomp mode).'
    : 'Temporarily uses Slot C for native bypass';
}
async function refreshSettings() {
  if (!ready() || settingsReading) return;
  const epoch = session;
  settingsReading = true;
  renderSettings();
  try {
    if (!demo) {
      pedalState = await usb.getState();
      if (epoch !== session) return;
      try {
        const volume = await usb.getMasterVolume();
        if (epoch !== session) return;
        masterVolume = volume;
        masterUnavailable = false;
      } catch (e) {
        if (epoch !== session) return;
        masterVolume = null;
        masterUnavailable = true;
      }
    }
  } catch (e) {
    if (epoch === session) notify(`Settings refresh failed: ${e.message}`);
  } finally {
    if (epoch === session) {
      settingsReading = false;
      render();
    }
  }
}
async function applyGlobalSetting(key, value) {
  if (!ready() || settingsReading) return;
  const epoch = session;
  if (pendingWrites.size) await flushWrites();
  if (epoch !== session || !ready()) return;
  clearTimeout(confirmationTimer);
  busy = true;
  render();
  try {
    if (key === 'bypass') {
      if (value && !pedalState.bypass)
        bypassSession.capture(
          presets.find((p) => p.id === selected),
          pedalState.activeSlot,
        );
      if (demo) bypassSession.applyDemo(pedalState, value);
      else {
        const actual = await usb.changeBypass(value);
        if (epoch !== session) return;
        pedalState = actual;
      }
      selected = active();

      params = demo ? presets[selected].parameters.slice() : [];
      if (!demo)
        try {
          const detail = await usb.getPreset(selected);
          if (epoch !== session) return;
          storePreset(selected, detail);
          params = detail.parameters;
        } catch (error) {
          notify(`Bypass updated. Preset refresh failed: ${error.message}`);
          return;
        }
    } else if (demo) {
      if (key === 'masterVolume') masterVolume = value;
      else pedalState[key] = value;
    } else if (key === 'masterVolume') {
      const actual = await usb.changeMasterVolume(value);
      if (epoch !== session) return;
      masterVolume = actual;
    } else {
      const actual = await usb.changeState({ [key]: value });
      if (epoch !== session) return;
      pedalState = actual;
    }
    if (epoch === session) $('notice').hidden = true;
  } catch (e) {
    if (epoch === session) notify(`Global setting update failed: ${e.message}`);
  } finally {
    if (epoch === session) {
      busy = false;
      render();
    }
  }
}
usb.addEventListener('master-volume', (e) => {
  masterVolume = e.detail;
  masterUnavailable = false;
  if (!busy && !settingsReading) renderSettings();
});
function updateTimestamp() {
  $('sync-label').textContent = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  $('sync-label').title = 'Last preset refresh';
}
function reset() {
  bypassSession.clear();
  masterVolume = null;
  masterUnavailable = false;
  settingsReading = false;
  session++;
  resetTapTempo();
  cancelWrites();
  cabinetModes.clear();
  confirmedSync.clear();
  effect = 'amp';
  demo = false;
  busy = false;
  scanning = false;
  pedalState = null;
  presets = [];
  selected = null;

  params = [];
  $('sync-label').textContent = '—';
  render();
}
function startDemo() {
  if (busy || usb.connected) return;
  reset();
  demo = true;
  const names = [
    'British Breakup',
    'California Clean',
    'Plexi After Hours',
    'Velvet Drive',
    'Tweed on the Edge',
    'Modern High Gain',
    'Midnight Jazz',
    'Desert Blues',
    'Studio Crunch',
    'Glass & Spring',
    'Bass Foundation',
    'Boutique Lead',
    'Vintage Rhythm',
    'Ambient Bloom',
    'Classic Rock',
    'Warm & Wide',
    'Country Snap',
    'Heavy Current',
    'Soft Focus',
    'Direct & Clean',
  ];
  const colors =
    new URLSearchParams(location.search).get('preview') === 'preset-colors'
      ? [
          [17, 17, 0],
          [0, 17, 0],
          [159, 255, 0],
          [47, 0, 255],
        ].map(presetDisplayColor)
      : ['#86a872', '#c6a270', '#839fac', '#b88f81'];
  presets = names.map((name, id) => {
    const values = parameters.map((p) => p.default);
    values[20] = 3.4 + (id % 6) * 0.7;
    values[21] = 5.2;
    values[11] = 5.4;
    values[13] = 4.8;
    values[16] = 6.2;
    values[95] = 1;
    values[99] = 320;
    values[102] = 18;
    values[42] = 22;
    return { id, name, color: colors[id % 4], parameters: values, read: true };
  });
  pedalState = {
    slots: [0, 1, 2],
    activeSlot: 0,
    stomp: false,
    bypass: false,
    cabBypass: false,
    tempo: 120,
    inputTrim: 0,
    tuningReference: 440,
    directMonitoring: true,
  };
  masterVolume = 6.5;
  selected = 0;

  params = presets[0].parameters.slice();
  updateTimestamp();
  $('notice').hidden = true;
  render();
}
usb.addEventListener('state', (e) => {
  const previous = active();
  bypassSession.observe(
    pedalState,
    e.detail,
    presets.find((p) => p.id === selected),
    busy,
  );
  pedalState = e.detail;
  if (!pedalState) {
    params = [];
    render();
    return;
  }
  if (pedalState.colors)
    presets.forEach((p) => {
      if (pedalState.colors[p.id])
        p.color = presetDisplayColor(pedalState.colors[p.id]);
    });
  if (previous !== active()) {
    cancelWrites();

    if (usb.connected && !busy && !scanning) {
      selected = active();
      params = [];
      render();
      void usb
        .getPreset(selected)
        .then((detail) => {
          if (!busy && selected === active()) {
            storePreset(selected, detail);
            params = detail.parameters;
            render();
          }
        })
        .catch((e) => notify(e.message));
    }
  } else if (usb.connected && !busy && !scanning) render();
});
usb.addEventListener('parameter', (e) => {
  if (busy || scanning || selected !== active()) return;
  const { index, value } = e.detail;
  if (index >= 109 || !Number.isFinite(value) || pendingWrites.has(index))
    return;
  params[index] = value;
  if (index === 24) cabinetModes.remember(selected, value);
  if (presets[selected]) presets[selected].parameters = params.slice();
  updateControl(index);
  if (
    groups.some(
      (g) => g.model === index || g.enable === index || g.position === index,
    ) ||
    index === 24 ||
    index === 10 ||
    parameters[index].id.endsWith('_SYNC') ||
    parameters[index].id.endsWith('_TS')
  ) {
    renderChain();
    renderControls();
  }
});
usb.addEventListener('preset', (e) => {
  if (busy || scanning || selected !== active() || pendingWrites.size) return;
  if (presets[selected]) {
    storePreset(selected, e.detail);
    params = e.detail.parameters;
    render();
  }
});
usb.addEventListener('connection', (e) => {
  if (!e.detail.connected && !demo) {
    const reason = e.detail.reason;
    reset();
    if (reason) notify(reason);
  }
});
$('connect').onclick = async () => {
  if (usb.connected) {
    await usb.close();
    return;
  }
  if (busy) return;
  reset();
  busy = true;
  render();
  try {
    await usb.connect();
    busy = false;
    pedalState = usb.state;
    await scanPresets();
    if (ready()) await refreshSettings();
  } catch (e) {
    busy = false;
    notify(
      e.name === 'NotFoundError'
        ? 'No pedal was selected. Connect your powered ToneX One and try again.'
        : e.message,
    );
    render();
  }
};
$('refresh').onclick = () => {
  if (!busy) void scanPresets();
};
$('search').oninput = renderPresets;
$('demo').onclick = startDemo;
$('exit-demo').onclick = reset;
bindEffectInteractions($('global-bypass-shortcut'), {
  select: () => {},
  activation: () => activationMethod,
  toggle: () => {
    if (ready() && !settingsReading)
      void applyGlobalSetting('bypass', !pedalState.bypass);
  },
});
$('previous-preset').onclick = () => void loadPreset(adjacentPreset(-1)?.id);
$('next-preset').onclick = () => void loadPreset(adjacentPreset(1)?.id);
document.querySelectorAll('[data-slot]').forEach(
  (b) =>
    (b.onclick = () => {
      const slot = Number(b.dataset.slot);
      if (!ready()) return;
      if (slot !== pedalState.activeSlot) void runStateChange({ slot });
      else {
        selected = active();
        params = presets[selected]?.parameters?.slice() || [];
        render();
      }
    }),
);
$('nav-presets').onclick = () => changeView('presets');
$('nav-editor').onclick = () => changeView('editor');
$('nav-settings').onclick = () => changeView('settings');
$('refresh-settings').onclick = () => void refreshSettings();
$('export-presets').onclick = () =>
  download('tonex-preset-settings.json', {
    format: 'tonex-web-settings-v1',
    demo,
    exportedAt: new Date().toISOString(),
    note: 'Preset metadata and parameters only. Does not include tone model or IR binaries. Cannot be restored by this app.',
    presets,
  });
$('welcome-copy').textContent =
  'Connect your powered pedal using a USB data cable. Close any other TONEX Editor apps, then press “Connect pedal” and allow USB access when prompted.';
changeView('editor');
render();
if ('serviceWorker' in navigator && isSecureContext)
  navigator.serviceWorker
    .register(new URL('../sw.js', import.meta.url))
    .catch(() => {});

function renderTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('theme-toggle').setAttribute('aria-pressed', String(dark));
  $('theme-toggle').innerHTML = dark
    ? '☀ <span>Light</span>'
    : '☾ <span>Dark</span>';
  $('theme-toggle').title = dark
    ? 'Switch to light mode'
    : 'Switch to dark mode';
  document.querySelector('meta[name="theme-color"]').content = dark
    ? '#141b18'
    : '#171d19';
}
$('theme-toggle').onclick = () => {
  const theme =
    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('tonex-theme', theme);
  } catch {}
  renderTheme();
};
renderTheme();

if (new URL(location.href).searchParams.get('demo') === '1') startDemo();

const initialView = new URL(location.href).searchParams.get('view');
if (['presets', 'editor', 'settings'].includes(initialView))
  changeView(initialView);
