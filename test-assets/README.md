# Accessibility test dependency

`axe.min.js` is an unmodified copy of axe-core 4.14.0 by Deque Systems, Inc., from the [published npm package](https://registry.npmjs.org/axe-core/-/axe-core-4.14.0.tgz). Its original copyright/license header is retained.

SHA-256: `20c09fe157a8a34a30e241aaa1fcdade657734f08ab379ecfbeb7d45cc46e878`.

## License and corresponding source

axe-core is covered by the [Mozilla Public License 2.0](../LICENSES/MPL-2.0.txt). The matching Source Code Form is available without charge in the [v4.14.0 upstream source tree](https://github.com/dequelabs/axe-core/tree/v4.14.0), commit `e797173108eadfa4355fe06af331791734e1757f`, under MPL 2.0. That tree includes the source modules and build instructions. The npm package also contains the unminified distribution, `axe.js`.

The bundle embeds core-js 3.50.0. Its full [MIT copyright and permission notice](../LICENSES/core-js-MIT.txt) is included separately. Keep both notices and this source locator with any redistributed copy; the repository's GPL code grant does not replace the bundle's own terms.

See [the repository's license scope and third-party notices](../THIRD_PARTY_NOTICES.md) for the other components.

## Test-only scope

The optional `tests/browser-qa.mjs` suite verifies the bundle checksum, injects it into its Firefox test pages, and calls `axe.run()` to check supported WCAG A/AA rules and accessibility best practices. The bundle is not a runtime dependency and is not requested by website pages. It belongs to the development/test files, not the runtime file inventory; hosting configuration should exclude it when packaging the website. Sharing the source repository still redistributes the test bundle and its notices.
