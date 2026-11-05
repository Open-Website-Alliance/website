import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const site = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('assets/theme.js', site), 'utf8');
const version = createHash('sha256').update(source).digest('hex').slice(0, 12);
const pages = ['index.html', 'charter.html', 'membership-process.html', 'privacy.html', '404.html'];

for (const page of pages) {
  test(`${page}: current no-script fallback and versioned shared script`, () => {
    const html = fs.readFileSync(new URL(page, site), 'utf8');
    assert.equal((html.match(/data-copyright-year/g) || []).length, 1);
    const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer\s*>/)?.[1];
    assert.ok(footer, 'Missing footer');
    assert.match(footer, new RegExp(`© <span data-copyright-year>${new Date().getFullYear()}</span> by the Open Website Alliance and its members`));
    const prefix = page === '404.html' ? '/' : '';
    assert.ok(html.includes(`src="${prefix}assets/theme.js?v=${version}"`), 'Stale or missing script version');
  });
}

// Exercise the actual shared script with a controlled clock and a minimal DOM.
// No theme controls or storage are available: footer updates must not need them.
function fixture(initialYear, count = 1) {
  let year = initialYear;
  const elements = Array.from({length: count}, () => ({textContent: '2000'}));
  const listeners = new Map();
  const listen = (type, callback) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(callback);
  };
  const document = {
    documentElement: {dataset: {}},
    visibilityState: 'visible',
    querySelectorAll: selector => selector === '[data-copyright-year]' ? elements : [],
    querySelector: () => null,
    getElementById: () => null,
    addEventListener: listen,
  };
  vm.runInNewContext(source, {
    Date: class extends Date {getFullYear() {return year;}},
    document,
    window: {addEventListener: listen},
    localStorage: {getItem() {throw new Error('Storage blocked');}},
  });
  return {elements, document, setYear(value) {year = value;}, emit(type) {for (const callback of listeners.get(type) || []) callback();}};
}

for (const year of [new Date().getFullYear(), 2030, 2100]) {
  test(`sets ${year} without storage or theme controls`, () => {
    const page = fixture(year, 2);
    page.emit('DOMContentLoaded');
    assert.deepEqual(page.elements.map(element => element.textContent), [String(year), String(year)]);
  });
}

test('refreshes the year after a cached page or background tab returns', () => {
  const page = fixture(2030);
  page.emit('DOMContentLoaded');
  page.setYear(2031);
  page.emit('pageshow');
  assert.equal(page.elements[0].textContent, '2031');
  page.setYear(2032);
  page.document.visibilityState = 'hidden';
  page.emit('visibilitychange');
  assert.equal(page.elements[0].textContent, '2031');
  page.document.visibilityState = 'visible';
  page.emit('visibilitychange');
  assert.equal(page.elements[0].textContent, '2032');
});

test('a page without a year marker remains safe', () => {
  const page = fixture(2030, 0);
  assert.doesNotThrow(() => page.emit('DOMContentLoaded'));
  assert.doesNotThrow(() => page.emit('pageshow'));
});
