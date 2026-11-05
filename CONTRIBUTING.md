# Contributing

Edit the HTML, CSS, JavaScript, and assets directly in the repository root. No build step or package installation is needed.

## Editing

- Homepage, news, and member links: `index.html`.
- Documents: `charter.html`, `membership-process.html`, and `privacy.html`.
- Missing-page recovery: `404.html`.
- Layout and styling: `assets/site.css`.
- Shared color tokens: `assets/palette.css`; see the [palette reference](PALETTE.md).
- Theme chooser and automatic footer year: `assets/theme.js`.
- Logos, decorative artwork, and self-hosted fonts: `images/` and `assets/fonts/`.

Update shared header, theme-control, and footer markup in every HTML page. The footer year follows the visitor's current year through JavaScript. Keep the HTML fallback year current in all five pages for visitors without JavaScript; the footer tests reject a stale fallback. Preserve font/logo bytes and notices unless an asset change is intended; review [third-party terms](THIRD_PARTY_NOTICES.md) before replacing them.

When changing CSS or JavaScript, update the version query on its asset URL in all five HTML pages. The `theme.js` version is the first 12 characters of its SHA-256 checksum. Version the palette import in `site.css` when changing palette semantics.

## Content and design

Preserve the Charter/Open Web Manifesto, membership process, privacy policy, legal footer wording, document anchors, and list numbering unless a content change is explicitly approved. Updating the footer year is routine maintenance.

The Drupal Association, Open Source Matters, TYPO3 Association, and WordPress Foundation have equal standing. FAIR Package Manager is an affiliate, not another founding member. Keep member opinion distinct from adopted Alliance policy, and link the WordPress Foundation organization to `https://wordpressfoundation.org/`.

Keep news newest first, with dates and direct sources. Preserve profile qualifiers such as “photo archive” or “experimental.”

Keep readable document hierarchy, official light/dark logos, keyboard access, and no-JavaScript behavior. Internal routes, fragments, and email stay in the same tab; external HTTP(S) links use safe new tabs with an accessible description. Social icons need complete accessible names and visible focus. Keep the compact header and arrow-free hero links; do not add hosting/review banners or replace official artwork with decorative imagery.

## Preview and checks

Open `index.html` in a browser, or serve the repository root with a local static web server. With Python installed:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory .
```

Open [localhost:8000](http://localhost:8000). Check narrow and desktop widths, both themes, keyboard navigation, JavaScript-disabled behavior, images, links, anchors, and the footer.

Keep this basic server bound to loopback: it serves repository files, including `.git` and test assets, and returns a generic error page for missing URLs. Use the optional browser suite, or a server configured to serve `404.html` for missing routes, to check custom nested-URL recovery.

The [optional test suite](tests/README.md) checks footer-year behavior and broader browser regressions, including root-level missing-page recovery. Update `tests/fixtures.json` when deliberately changing its expected profiles, logos, or anchors. Keep changes focused and include the checks you ran.

## Pull requests

Use a topic branch and keep changes focused. Include the checks you ran and screenshots for visible changes. Preserve the root-level pages and `CNAME` used by the Open Website Alliance website.

This repository includes no deployment workflow. Submitting code for review does not authorize hosting, DNS, or access changes. Never commit secrets or private URLs.

Canonical and social URLs target `https://openwebsitealliance.org/`; missing-page resources and recovery links use root-relative paths. Test a nested missing URL after changing them.

The website permits search indexing: `robots.txt` allows crawling, and the HTML has no restrictive crawler metadata. The indexing tests guard this policy.
