# Member-derived color palette

A charcoal foundation with cyan, green, and orange accents. This is the palette used by this website, not an official Alliance-wide brand standard.

Open the [visual palette board](palette.html) in a browser. The reusable [CSS tokens](assets/palette.css) are imported by [the site stylesheet](assets/site.css); there is no build step.

## Member colors

The four colors are sampled from the member logos in `images/logos/`:

| Member | Color | Token | Source |
| --- | --- | --- | --- |
| Drupal | `#009CDE` cyan | `--owa-drupal` | [Source logo](images/logos/drupal.svg) |
| Joomla! | `#7AC143` green | `--owa-joomla` | [Source logo](images/logos/joomla.svg) |
| TYPO3 | `#FF8700` orange | `--owa-typo3` | [Source logo](images/logos/typo3.svg) |
| WordPress | `#32373C` charcoal | `--owa-wordpress` | [Source logo](images/logos/wordpress.svg) |

Joomla! contributes one of its existing logo colors; its full multicolor logo is unchanged. WordPress contributes the charcoal in its artwork instead of another blue. Official light/dark logo variants, original asset bytes, and equal member standing are preserved. Colors do not replace member names or accessible labels.

## Supporting neutrals

| Color | Token | Role |
| --- | --- | --- |
| `#F5F7FA` Porcelain | `--owa-porcelain` | Light-mode News field; dark-mode text |
| `#FFFFFF` White | `--owa-white` | Light-mode canvas and surfaces; reversed text and dark-mode actions |
| `#D9E1E6` Mist | `--owa-mist` | Light-mode decorative dividers; dark-mode secondary text/control borders |
| `#17242C` Deep ink | `--owa-ink` | Dark-mode canvas; text on bright fills |

## Application

Keep most of the site neutral. Primary actions use charcoal with white text in light mode, and white with Deep ink text in dark mode. Each member receives the same-sized decorative accent, independently of its official logo. Dark-mode accent frames keep the charcoal sample visible. Four separate quadrilaterals also represent the four members in the Hero, Members, Affiliates, and News artwork. Their rotation, scale, proportions, and arrangement vary by placement; dark variants add a narrow Mist boundary around charcoal without recoloring its fill. The site uses charcoal for subtle dark-mode dividers, keeping those separate from high-contrast control borders.

`palette.css` supplies the base colors, semantic light/dark roles, and opt-in `.owa-page`, `.owa-surface`, `.owa-link`, and `.owa-button` classes. The existing site classes are mapped to those tokens in `site.css`. CSS follows the operating-system preference without JavaScript; the existing chooser's `data-theme="light"` or `data-theme="dark"` override takes precedence.

## Text contrast

For opaque, solid fills:

| Text | Background | Contrast |
| --- | --- | --- |
| Deep ink | Drupal cyan | 5.14:1 |
| Deep ink | Joomla! green | 7.20:1 |
| Deep ink | TYPO3 orange | 6.58:1 |
| White | WordPress charcoal | 12.02:1 |

These pairings exceed the 4.5:1 normal-text contrast threshold. White text on the three bright colors does not. Mist is not a sufficient essential control outline on a white or Porcelain background; use the semantic control-border token. Decorative member colors must not become the sole means of conveying meaning.

The optional browser suite checks base tokens, actual theme backgrounds, equal member accent dimensions/colors, and rendered text/control contrast. These checks are not a full WCAG or screen-reader conformance assessment.
