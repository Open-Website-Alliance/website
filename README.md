# Open Website Alliance

This repository contains the Open Website Alliance website: the Alliance Charter, Open Web Manifesto, membership information, news, and member communities.

The website is plain HTML, CSS, and JavaScript in the repository root, with self-hosted fonts and images. It has no build step, package installation, or runtime framework. Reading and navigation work without JavaScript; an optional theme chooser supports system, light, and dark preferences.

## Repository contents

- Root HTML files — the homepage, Charter, membership process, privacy policy, and missing-page recovery.
- `assets/` and `images/` — styles, scripts, fonts, logos, and artwork.
- [CONTRIBUTING.md](CONTRIBUTING.md) — editing, local preview, testing, and contribution guidance.
- [PALETTE.md](PALETTE.md) and [palette.html](palette.html) — color tokens and visual swatches.
- `tests/` — optional browser checks and their fixtures.
- `test-assets/` — the axe-core accessibility testing bundle; not loaded by website pages.

## License

Original implementation code is [GPL-2.0-or-later](LICENSE). Fonts, third-party code, Alliance content, and logos retain separate terms. See [license scope and third-party notices](THIRD_PARTY_NOTICES.md).
