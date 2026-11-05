import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

const site = new URL('../', import.meta.url);
const pages = ['index.html', 'charter.html', 'membership-process.html', 'privacy.html', '404.html'];

for (const page of pages) {
  test(`${page}: no restrictive crawler metadata`, () => {
    const html = fs.readFileSync(new URL(page, site), 'utf8');
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
      const attributes = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)]
        .map(([, name, quoted, singleQuoted, unquoted]) => [name.toLowerCase(), (quoted ?? singleQuoted ?? unquoted).toLowerCase()]));
      if (/^(?:robots|googlebot|bingbot)$/.test(attributes.name || '') || attributes['http-equiv'] === 'x-robots-tag') {
        assert.doesNotMatch(attributes.content || '', /\b(?:noindex|nofollow|none|noarchive|nosnippet|unavailable_after)\b/);
      }
    }
  });
}

test('robots.txt allows every crawler at the production root', () => {
  const directives = fs.readFileSync(new URL('robots.txt', site), 'utf8')
    .split(/\r?\n/).map(line => line.replace(/#.*/, '').trim().toLowerCase()).filter(Boolean);
  assert.deepEqual(directives, ['user-agent: *', 'allow: /']);
});
