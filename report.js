/* global FP_META, FP_SECTIONS, FP_INVISIBLE */
'use strict';

const params = new URLSearchParams(location.search);
const tabId = params.has('tab') ? Number(params.get('tab')) : null;
const tabOrigin = params.get('origin');

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

let lastResult = null;
const ARRAY_PREVIEW = 14;
const TIP = 'Tip: open a website and click the extension icon there to see the fingerprint exactly as that site sees it. Showing the extension page\'s view for now, which is nearly identical for most attributes.';

// ------------------------------------------------------------ collection

async function collectFromTab(id) {
  // 1) inject the collector into the page's own JS world (what trackers see)
  await chrome.scripting.executeScript({ target: { tabId: id }, files: ['collector.js'], world: 'MAIN' });
  // 2) run it, then remove the global again so the page is left as we found it
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: id },
    world: 'MAIN',
    func: async () => {
      try {
        const fn = globalThis.__fpCollect;
        delete globalThis.__fpCollect;
        if (typeof fn !== 'function') return { __error: 'collector did not load in page' };
        return await fn();
      } catch (e) {
        return { __error: String((e && e.message) || e) };
      }
    },
  });
  const out = res && res.result;
  if (!out) throw new Error('no result returned from page');
  if (out.__error) throw new Error(out.__error);
  return out;
}

async function collect() {
  const source = $('source').value;
  setLoading(true);
  $('notice').hidden = true;
  if (tabId === null) showNotice(TIP);
  try {
    let result;
    if (source === 'tab') {
      try {
        result = await collectFromTab(tabId);
      } catch (e) {
        showNotice(
          `Couldn't collect from the page (${e.message}). The tab may have navigated away, or Chrome doesn't allow scripts there ` +
          `(chrome://, the Web Store, PDF viewer). Click the extension icon again while on the page you want to inspect. ` +
          `Showing the extension page's fingerprint instead.`,
        );
        $('source').value = 'extension';
        result = await globalThis.__fpCollect();
      }
    } else {
      result = await globalThis.__fpCollect();
    }
    lastResult = result;
    render(result);
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  document.body.classList.toggle('loading', on);
  $('recollect').disabled = on;
  if (on) $('fp-id').textContent = 'collecting…';
}

function showNotice(msg) {
  $('notice').textContent = msg;
  $('notice').hidden = false;
}

// ------------------------------------------------------------ rendering

function isPrimitive(v) {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

function renderPrimitive(v) {
  if (v === null) return el('span', 'v-null', 'unavailable');
  if (typeof v === 'boolean') return el('span', `v-bool ${v}`, String(v));
  if (typeof v === 'number') return el('span', 'v-num', String(v));
  if (v === '') return el('span', 'v-null', '(empty string)');
  return el('span', 'v-str', v);
}

function renderArray(arr) {
  if (!arr.length) return el('span', 'v-null', '(none)');
  if (!arr.every(isPrimitive)) {
    const wrap = el('div', 'v-list');
    arr.forEach((x) => wrap.appendChild(renderValue(x)));
    return wrap;
  }
  const wrap = el('div', 'chips');
  const addChips = (from, to) => {
    for (const x of arr.slice(from, to)) wrap.appendChild(el('span', 'chip', String(x)));
  };
  addChips(0, ARRAY_PREVIEW);
  if (arr.length > ARRAY_PREVIEW) {
    const more = el('button', 'chip more', `+${arr.length - ARRAY_PREVIEW} more`);
    more.type = 'button';
    more.addEventListener('click', () => {
      more.remove();
      addChips(ARRAY_PREVIEW, arr.length);
    });
    wrap.appendChild(more);
  }
  return wrap;
}

function renderObject(obj) {
  const keys = Object.keys(obj);
  if (!keys.length) return el('span', 'v-null', '(empty)');
  const table = el('table', 'kv');
  for (const k of keys) {
    const tr = el('tr');
    tr.appendChild(el('th', null, k));
    const td = el('td');
    td.appendChild(renderValue(obj[k]));
    tr.appendChild(td);
    table.appendChild(tr);
  }
  return table;
}

function renderValue(v) {
  if (isPrimitive(v)) return renderPrimitive(v);
  if (Array.isArray(v)) return renderArray(v);
  if (typeof v === 'object') return renderObject(v);
  return el('span', 'v-str', String(v));
}

function isNoised(item) {
  return item.value && typeof item.value === 'object' && item.value.stableAcrossRenders === false;
}

function renderItem(item) {
  const meta = FP_META[item.key] || { label: item.key, entropy: 'low', why: '' };
  const card = el('article', 'item');
  card.dataset.search = `${item.key} ${meta.label} ${item.section}`.toLowerCase();

  const head = el('div', 'item-head');
  const title = el('div', 'item-title');
  title.appendChild(el('h3', null, meta.label));
  title.appendChild(el('code', 'key', item.key));
  head.appendChild(title);

  const badges = el('div', 'badges');
  badges.appendChild(el('span', `badge ${meta.entropy}`, meta.entropy));
  if (item.volatile) badges.appendChild(el('span', 'badge volatile', 'volatile'));
  if (isNoised(item)) badges.appendChild(el('span', 'badge noised', 'randomized'));
  if (item.hash) {
    const h = el('code', 'item-hash', item.hash.slice(0, 8));
    h.title = `hash of this value: ${item.hash}`;
    badges.appendChild(h);
  }
  head.appendChild(badges);
  card.appendChild(head);

  const body = el('div', 'item-body');
  const valueBox = el('div', 'value');
  if (item.error) {
    valueBox.appendChild(el('span', 'v-error', `Error: ${item.error}`));
  } else {
    valueBox.appendChild(renderValue(item.value));
  }
  if (typeof item.preview === 'string' && item.preview.startsWith('data:image/png')) {
    const img = el('img', 'preview');
    img.src = item.preview;
    img.alt = `${meta.label} rendering`;
    valueBox.appendChild(img);
  }
  body.appendChild(valueBox);
  body.appendChild(el('p', 'why', meta.why));
  card.appendChild(body);
  return card;
}

function render(result) {
  const items = result.items;
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));

  $('fp-id').textContent = result.fingerprintId;
  $('fp-id-note').textContent = `hash of ${result.stableComponentCount} stable attributes`;
  $('stat-count').textContent = String(items.length);
  $('stat-high').textContent = String(items.filter((i) => (FP_META[i.key] || {}).entropy === 'high').length);
  const noised = items.filter(isNoised);
  $('stat-noise').textContent = noised.length ? noised.map((i) => FP_META[i.key]?.label || i.key).join(', ') : 'none detected';
  $('stat-noise').classList.toggle('warn', noised.length > 0);
  $('stat-time').textContent = `${result.durationMs} ms · ${new Date(result.collectedAt).toLocaleTimeString()}`;
  if (!result.context.isSecureContext) {
    showNotice('This page is not a secure context (http://). Some APIs such as WebGPU, client hints and storage estimates are hidden, so the values below are exactly what a tracker on this page could see.');
  }

  const container = $('sections');
  const toc = $('toc');
  container.replaceChildren();
  toc.replaceChildren();

  for (const [sectionId, section] of Object.entries(FP_SECTIONS)) {
    const sectionItems = Object.keys(FP_META)
      .filter((k) => byKey[k] && byKey[k].section === sectionId)
      .map((k) => byKey[k]);
    // include any items not described in FP_META (defensive)
    for (const it of items) if (it.section === sectionId && !FP_META[it.key]) sectionItems.push(it);
    if (!sectionItems.length) continue;

    const sec = el('section', 'section');
    sec.id = `sec-${sectionId}`;
    const h2 = el('h2', null, section.title);
    h2.appendChild(el('span', 'count', String(sectionItems.length)));
    sec.appendChild(h2);
    sec.appendChild(el('p', 'blurb', section.blurb));
    for (const it of sectionItems) sec.appendChild(renderItem(it));
    container.appendChild(sec);

    const link = el('a', null, section.title);
    link.href = `#sec-${sectionId}`;
    toc.appendChild(link);
  }
  applyFilter();
}

function renderInvisible() {
  const dl = $('invisible');
  for (const [term, desc] of FP_INVISIBLE) {
    dl.appendChild(el('dt', null, term));
    dl.appendChild(el('dd', null, desc));
  }
}

function applyFilter() {
  const q = $('filter').value.trim().toLowerCase();
  for (const sec of document.querySelectorAll('#sections .section')) {
    let visible = 0;
    for (const card of sec.querySelectorAll('.item')) {
      const match = !q || card.dataset.search.includes(q) || card.textContent.toLowerCase().includes(q);
      card.hidden = !match;
      if (match) visible++;
    }
    sec.hidden = visible === 0;
  }
}

// ------------------------------------------------------------ setup

function setupSource() {
  const sel = $('source');
  if (tabId !== null) {
    const label = tabOrigin && tabOrigin !== 'null' ? new URL(tabOrigin).host : 'local file';
    sel.appendChild(new Option(`Website tab: ${label}`, 'tab'));
  }
  sel.appendChild(new Option('This extension page', 'extension'));
  sel.value = tabId !== null ? 'tab' : 'extension';
  sel.addEventListener('change', collect);
}

$('recollect').addEventListener('click', collect);
$('filter').addEventListener('input', applyFilter);
$('copy').addEventListener('click', async () => {
  if (!lastResult) return;
  await navigator.clipboard.writeText(JSON.stringify(lastResult, null, 2));
  const b = $('copy');
  b.textContent = 'Copied ✓';
  setTimeout(() => { b.textContent = 'Copy JSON'; }, 1500);
});
$('download').addEventListener('click', () => {
  if (!lastResult) return;
  const blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fingerprint-${lastResult.fingerprintId}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

setupSource();
renderInvisible();
collect().catch((e) => showNotice(`Collection failed: ${e.message}`));
