# Website checks

## Footer year

With Node.js installed, run `node --test tests/footer-year.test.mjs`. This checks all five HTML fallback years and their script versions, then exercises current/future years and cached/background-page restoration with a controlled clock. The static fallback must be updated each year for visitors without JavaScript.

## Search indexing

`node --test tests/indexing.test.mjs` checks all five pages for restrictive crawler metadata and verifies that `robots.txt` allows all crawlers. Run all focused checks with `node --test tests/*.test.mjs`.

## Browser checks

Requirements: Node.js 22 or later and Firefox with WebDriver BiDi. Set `FIREFOX_BIN` if Firefox is not at `/usr/bin/firefox`.

From the repository root:

```sh
node --check assets/theme.js
node --test tests/*.test.mjs
node tests/browser-qa.mjs
node tests/browser-qa.mjs --dark
node tests/browser-qa.mjs --no-js
node tests/browser-qa.mjs --no-js --dark
```

The suite serves the root-level website at `/`, checks its runtime inventory before and after testing, and never changes website files. Its local server exposes only the five HTML pages, `assets/`, `images/`, `robots.txt`, and `CNAME`; development files and `.git` are not served. Coverage includes current footer years on every page with and without JavaScript, routes, keyboard/pointer navigation, document anchors, social-profile order, Drupal Association-only accounts, five-icon row limits, the hero's Charter/News actions and single named foundation Manifesto link, inline secondary coverage labels with natural source-link wrapping, themes, logo variants, fonts/images, text reflow, readability, and deep-404 recovery. Expected profiles, logos, and anchors are in [`fixtures.json`](fixtures.json); update them when deliberately changing the site.

Every run also checks forward/reverse sidebar focus at short viewport heights and with enlarged text. JavaScript-enabled runs test all five theme menus at 320px with text enlargement, text spacing, both combined, and a short 256px viewport, including label geometry, complete focus outlines, and Escape/visible-focus restoration. Run only these focused regressions with `node tests/browser-qa.mjs --focus-regressions`; it also accepts `--dark` and `--no-js`. These CSSOM enlargement and viewport fixtures do not substitute for native browser-zoom testing.

Reports go to ignored `qa-reports/`; set `OWA_EVIDENCE` to save them elsewhere. `OWA_SITE` selects another static directory, and `OWA_BASE_PATH` selects its mount. The files' canonical and 404 paths must match that mount.

The test-only axe bundle and notices are in `test-assets/` and `LICENSES/`. These checks do not establish full screen-reader, cross-engine, or WCAG conformance: axe cannot run with page JavaScript disabled, and text/reflow fixtures do not prove native browser zoom. Inspect relevant screenshots for visual changes.

Design checks require loaded Barlow Condensed and Instrument Sans faces, four decorative artwork placements on the homepage only, empty image alternatives, successful decoding, correct OS/manual theme variants, and no intersections between artwork boxes and rendered text (including text-stress fixtures). Palette checks cover all eight source tokens, the White/Deep ink canvas, and equal member accent colors/dimensions alongside the rendered contrast checks. Update those explicit expectations only when a palette change is intentional and reviewed.
