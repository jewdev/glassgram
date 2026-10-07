---
name: Glassgram
description: Liquid Glass settings for a local-first Instagram browser extension; translucent panels floating over a soft three-pool light field.
colors:
  accent: "#4b48e0"
  accent-dark: "#7b7bff"
  accent-ink: "#ffffff"
  accent-ink-dark: "#0b0d18"
  accent-soft: "rgb(75 72 224 / 0.12)"
  accent-soft-dark: "rgb(123 123 255 / 0.16)"
  risk: "#c4362a"
  risk-dark: "#ff8a7a"
  risk-soft: "rgb(229 72 58 / 0.13)"
  risk-soft-dark: "rgb(255 120 100 / 0.14)"
  danger-fill: "#c4362a"
  danger-fill-hover: "#ad2e23"
  ok: "#138a4b"
  ok-dark: "#5ee39a"
  field-base: "#e9edf6"
  field-base-dark: "#080a12"
  pool-indigo: "rgb(99 102 241 / 0.42)"
  pool-indigo-dark: "rgb(79 70 229 / 0.36)"
  pool-aqua: "rgb(34 211 238 / 0.34)"
  pool-aqua-dark: "rgb(6 182 212 / 0.36)"
  pool-coral: "rgb(251 113 133 / 0.30)"
  pool-coral-dark: "rgb(244 98 116 / 0.18)"
  lattice: "rgb(15 20 36 / 0.14)"
  lattice-dark: "rgb(255 255 255 / 0.10)"
  ink: "#0f1424"
  ink-dark: "#f2f4fa"
  ink-2: "#454c63"
  ink-2-dark: "#c3c8d6"
  ink-3: "#5f667d"
  ink-3-dark: "#a3a9ba"
  glass: "rgb(255 255 255 / 0.52)"
  glass-dark: "rgb(255 255 255 / 0.085)"
  glass-strong: "rgb(255 255 255 / 0.72)"
  glass-strong-dark: "rgb(30 33 46 / 0.78)"
  glass-rim: "rgb(255 255 255 / 0.9)"
  glass-rim-dark: "rgb(255 255 255 / 0.32)"
  glass-rim-low: "rgb(255 255 255 / 0.25)"
  glass-rim-low-dark: "rgb(255 255 255 / 0.06)"
  hairline: "rgb(15 20 36 / 0.09)"
  hairline-dark: "rgb(255 255 255 / 0.08)"
  fill: "rgb(118 118 128 / 0.14)"
  fill-dark: "rgb(255 255 255 / 0.1)"
  fill-hover: "rgb(118 118 128 / 0.22)"
  fill-hover-dark: "rgb(255 255 255 / 0.14)"
  switch-off: "rgb(120 120 128 / 0.30)"
  switch-off-dark: "rgb(120 120 128 / 0.36)"
  brand-from: "#5856e8"
  brand-to: "#2fb3d6"
  knob: "#ffffff"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 680
    letterSpacing: "-0.015em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 650
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  row-label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 560
    lineHeight: 1.45
  body-small:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  badge:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "11.5px"
    fontWeight: 650
    letterSpacing: "0.01em"
  mono:
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
rounded:
  capsule: "999px"
  panel: "28px"
  row: "18px"
  nav-item: "12px"
  control: "11px"
  tile: "10px"
  icon-tile: "9px"
  key: "6px"
spacing:
  hair: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "28px"
  section: "36px"
components:
  panel:
    backgroundColor: "{colors.glass}"
    rounded: "{rounded.panel}"
    padding: "8px"
  feature-row:
    rounded: "{rounded.row}"
    padding: "13px 12px"
  feature-row-open:
    backgroundColor: "{colors.fill}"
    rounded: "{rounded.row}"
  switch-off:
    backgroundColor: "{colors.switch-off}"
    rounded: "{rounded.capsule}"
    width: "52px"
    height: "32px"
  switch-on:
    backgroundColor: "{colors.accent}"
    rounded: "{rounded.capsule}"
    width: "52px"
    height: "32px"
  pill-button:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.capsule}"
    padding: "0 12px"
    height: "32px"
  pill-button-hover:
    backgroundColor: "{colors.fill-hover}"
  pill-button-quiet:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.capsule}"
    height: "32px"
  pill-button-danger:
    backgroundColor: "{colors.danger-fill}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.capsule}"
    height: "32px"
  pill-button-danger-hover:
    backgroundColor: "{colors.danger-fill-hover}"
  control:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "34px"
  control-focus:
    backgroundColor: "{colors.glass-strong}"
  search-capsule:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink-3}"
    rounded: "{rounded.capsule}"
    padding: "0 10px 0 12px"
    height: "38px"
  nav-item:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.nav-item}"
    padding: "8px 10px"
  nav-item-active:
    backgroundColor: "{colors.glass-strong}"
    textColor: "{colors.ink}"
    rounded: "{rounded.nav-item}"
  badge-experimental:
    textColor: "{colors.risk}"
    typography: "{typography.badge}"
    rounded: "{rounded.capsule}"
    height: "20px"
    padding: "0 8px"
  badge-untested:
    textColor: "{colors.ink-2}"
    typography: "{typography.badge}"
    rounded: "{rounded.capsule}"
    height: "20px"
    padding: "0 8px"
  badge-risky:
    backgroundColor: "{colors.risk-soft}"
    textColor: "{colors.risk}"
    typography: "{typography.badge}"
    rounded: "{rounded.capsule}"
    height: "20px"
    padding: "0 8px"
  saved-pill:
    backgroundColor: "{colors.glass-strong}"
    textColor: "{colors.ink-3}"
    typography: "{typography.label}"
    rounded: "{rounded.capsule}"
    padding: "7px 14px"
  warning-callout:
    backgroundColor: "{colors.risk-soft}"
    textColor: "{colors.risk}"
    rounded: "{rounded.nav-item}"
    padding: "9px 12px"
---

# Design System: Glassgram

Scope: the extension's own UI: the settings page (`src/options/`, the reference implementation) and the popup (`src/popup/`). Both load `src/shared/glass.css`, which owns the tokens, light field, glass material, switch, pill buttons and brand mark; each page's own stylesheet holds only its layout. The brand mark is the only place `brand-from`/`brand-to` appear.

Token naming: an unsuffixed color key is the light-scheme value; its `-dark` sibling is the dark value. In code each pair is one `light-dark()` custom property, so the scheme follows `color-scheme`: the OS setting by default, or the user's choice (Settings header segmented control, popup theme button; setting `ui.theme`: system / light / dark) pinned with `data-theme` on `<html>`. Non-color tokens (`--glass-sat`, `--glass-shadow`) have an explicit dark override. In code both resolve through one custom property (`--accent`, `--glass`, ...), so components never branch on scheme.

## Overview

**Creative North Star: "Glass Over Light"**

Every surface is a pane of frosted glass floating over a soft ambient field: three blurred light pools (indigo top-left, aqua right, coral bottom) laid over a fine dot lattice that gives the glass something to visibly blur and bend. The user pinned this direction to Apple's Liquid Glass. The page keeps the grouped-list grammar people already trust from system settings and drops the flat white two-column options page that most extensions ship.

Density is calm and list-like. Rows are separated by inset hairlines rather than boxes, and a feature's sub-options open in a drawer beneath it, tinted by a quiet fill, only while the feature is on. Color is scarce. Indigo marks on-state and focus. Coral is held back for risk and experimental status, so it means "look before you turn this on" every time it appears.

The material is translucent but not invisible. Text always sits on a fill strong enough to read, and the reduced-transparency preference replaces blur with a solid strong-glass fill.

**Key Characteristics:**
- An ambient field of three blurred pools (56px blur) over a 22px dot lattice, fixed behind everything.
- One glass recipe: translucent fill, 24px backdrop blur with saturate, a 1px specular rim that is brightest at the top-left and bottom-right, and a soft shadow that drops low and wide.
- Concentric radii: panel 28px, row 18px, controls 11px, and capsule shapes for anything you press or toggle.
- One system sans family. Weight and tracking carry the hierarchy.
- Indigo means on and focused. Coral means risk.
- Light and dark schemes from the same tokens, with a calmer dark field.

## Colors

The palette is a cool neutral glass set with one indigo signal and one coral warning. The field pools supply ambient color, so components stay nearly colorless.

### Primary
- **Indigo Signal** (accent / accent-dark): the on-state of every switch, the focus ring (2px outline, 2px offset), the caret, the active nav item's icon, and the section icon tile in the Everyday half. **Indigo Wash** (accent-soft) tints focus halos, text selection and Everyday icon tiles.
- **Accent Ink** (accent-ink / accent-ink-dark): text placed on a solid indigo or solid danger fill.

### Secondary
- **Coral Risk** (risk / risk-dark): experimental and risky badges, the inline warning callout under a feature, the icon tiles in the Power tools half, and the Saved pill's error state. **Coral Wash** (risk-soft) is the fill behind risky badges, warnings and Power icon tiles.
- **Danger Fill** (danger-fill, hover danger-fill-hover): the solid fill of a destructive confirm button. It is fixed across both schemes so white text keeps its contrast.

### Tertiary
- **Saved Green** (ok / ok-dark): used only for the Saved pill's confirmation flash.

### Neutral
- **Field Base** (field-base / field-base-dark): the page ground beneath the pools. Pale blue-grey in light, near-black blue in dark.
- **Field Pools** (pool-indigo, pool-aqua, pool-coral and their dark siblings): ambient light only. They never color a component. In dark the indigo and coral pools are quieter (0.36 and 0.18) so the glass doesn't glow.
- **Lattice** (lattice / lattice-dark): the 1px dot grid at a 22px pitch.
- **Ink, Ink 2, Ink 3**: primary text, then descriptions and secondary copy, then counts, placeholders, group labels and resting meta.
- **Glass / Glass Strong**: panel fill, then the denser fill used for focused inputs, the active nav item, the Saved pill, the confirm dialog and the reduced-transparency fallback.
- **Glass Rim / Glass Rim Low**: the specular edge gradient and its inner top highlight.
- **Fill / Fill Hover**: the neutral tint of controls, pill buttons, the search capsule, open drawers and hovered nav items.
- **Hairline**: inset separators between rows and above the sidebar footer.
- **Switch Off**: the resting switch track.

### Named Rules
**The Two Signals Rule.** Indigo means on or focused. Coral means risky or experimental. Neither is used for decoration, and no third accent is introduced.

**The Field Is Not a Fill Rule.** Pool colors exist only in the field. Components take their color from glass and fill tokens, and the field shows through them.

## Typography

**Body Font:** the system sans stack (-apple-system, SF Pro Text, Segoe UI Variable Text, Segoe UI, Roboto, Helvetica, Arial)
**Mono Font:** ui-monospace (SF Mono, Cascadia Code, Consolas)

**Character:** one native family, so the page reads like part of the OS it floats over. Hierarchy comes from weight steps in between the usual ones (520, 560, 650, 680) and from slightly negative tracking on larger sizes. Extension pages can only load local assets, so no webfont is shipped.

### Hierarchy
- **Display** (700, 34px, 1.1, -0.025em; 28px under 860px): the single page title.
- **Headline** (680, 20px, -0.015em): the two half titles, Everyday and Power tools. The dialog title uses the same weight at 18px.
- **Title** (650, 17px, -0.01em): panel (group) names. The brand name uses 650 at 15px.
- **Body** (400, 15px/1.45): the base text. Feature row labels are set at 560 (sub-option labels at 500). Nav items are set at 520.
- **Body Small** (400, 13.5px): feature descriptions in Ink 2, capped at 60ch. Panel intros are 14px (62ch) and help text is 13px (70ch).
- **Label** (600, 13px): pill buttons, the Saved pill and the warning callout (520). Counts are 12 to 13px with tabular numerals in Ink 3. Sidebar group labels are 12px at 600 in Ink 3, in sentence case.
- **Badge** (650, 11.5px, +0.01em): status badges, sentence case.
- **Mono** (13px): text fields, shortcut buttons (600) and the filename preview (12.5px).

### Named Rules
**The Weight Not Size Rule.** Neighboring levels are separated by weight and tracking first. Sizes stay within 11.5 to 20px everywhere except the page title.

**The Tabular Count Rule.** Every on-count ("3/4", "3 of 4 on") uses tabular numerals in Ink 3, so the numbers don't jitter as switches change.

## Layout

- **Shell:** a centered two-column grid. A 272px sidebar sits beside a content column of up to 760px, with a 28px gap and 28px / 24px / 64px outer padding.
- **Sidebar:** a sticky glass panel (top 28px, max height viewport minus 56px). From top to bottom it holds the brand, the search capsule, a scrolling nav grouped by half with an on-count per group, and a footer row of Export, Import and Reset separated by a hairline.
- **Content:** a header row with the title and subline on the left and the Saved pill aligned to the bottom-right. The two halves follow, 36px apart. Within a half, panels sit 16px apart. Power tools carries one explanatory subline.
- **Rows:** a two-column grid (text, then control on the right) with 13px / 12px padding and a 4px / 20px gap. Sub-option rows indent to 24px. Text settings stack the field below the label.
- **Rhythm:** 4, 8, 12, 16, 20, 28 and 36px. 8px panel padding plus 12px row padding puts text 20px in from the glass edge.
- **Search:** filters rows, panels and halves in place. Nav items and group labels with no matches hide, and a glass empty state appears when nothing matches. A sub-option that matches opens its drawer.
- **Under 860px:** a single column. The sidebar becomes a sticky glass bar (top 8px) without the brand, and the nav becomes a horizontal chip row with no visible scrollbar. That row hides group labels and counts and fades out at its right edge (mask from 85%). Select, number and shortcut rows stack their control full-width beneath the label.

## Elevation & Depth

Depth comes from material more than from shadow. Every raised surface is the same glass pane over the field. What separates one layer from another is blur, the specular rim and one soft shadow that sits low and wide. Nothing stacks more than one glass layer, except the confirm dialog over a blurred scrim.

### Shadow Vocabulary
- **Glass lift, light** (`0 24px 48px -28px rgb(40 48 100 / 0.38), 0 2px 6px -2px rgb(40 48 100 / 0.12)`): every glass panel, paired with `inset 0 1px 0` Glass Rim Low.
- **Glass lift, dark** (`0 30px 60px -30px rgb(0 0 0 / 0.75), 0 2px 8px -2px rgb(0 0 0 / 0.35)`).
- **Active nav seat** (`0 1px 2px rgb(0 0 0 / 0.08)` plus the inset rim): the selected nav item sitting on the sidebar glass.
- **Switch knob** (`0 3px 8px rgb(0 0 0 / 0.18), 0 1px 1px rgb(0 0 0 / 0.08)`).
- **Focus halo** (`0 0 0 3px` Indigo Wash, plus `0 0 0 1px` Indigo for fields): focus and listening states, never at rest.

### Glass Recipe
Fill Glass. Backdrop `blur(24px) saturate(175%)` in light and `saturate(120%)` in dark. A 1px rim drawn as a masked border gradient at 155deg: full Glass Rim at 0%, Rim Low at 28%, transparent at 55%, Rim Low at 85%, full Rim at 100%. Then the glass lift shadow. Under `prefers-reduced-transparency: reduce`, the fill becomes Glass Strong and the blur is removed.

### Named Rules
**The One Material Rule.** A raised surface is glass made with this recipe, or it is a fill tint sitting on glass. No opaque cards and no ad-hoc borders.

**The Calm Dark Rule.** Dark mode lowers pool strength and saturation rather than raising glass opacity. The field should read as light behind frosted glass, not as neon.

## Shapes

Corners are concentric: an element nested inside another uses a smaller radius, roughly the parent's radius minus its inset. Panels and the dialog use 28px. Feature rows and drawers use 18px. Nav items and warning callouts use 12px. Controls use 11px. The brand tile is 10px, icon tiles are 9px and keycaps are 6px. Anything pressed or toggled is a full capsule (999px): switches, pill buttons, the search field, badges and the Saved pill. The specular rim follows its parent's radius (`border-radius: inherit`). There are no visible strokes apart from hairline separators and the outline of badges.

**The Concentric Rule.** A nested element never has a larger radius than its container, and controls you press are capsules.

## Components

### Switch (signature)
- A 52 × 32px capsule with a 26px white knob and a 3px inset. The track is Switch Off at rest and Indigo when on, with a 240ms background ease.
- The knob travels 20px on a 280ms ease-out. **Pressed:** it stretches 1.24× horizontally toward its destination and goes slightly translucent, like a drop of glass.
- Focus shows a 2px Indigo outline at a 3px offset. Disabled is shown at 50% opacity.
- It is a native checkbox with `role="switch"` and an aria-label naming the feature.

### Feature Row and Drawer (signature)
- Rows are separated by an inset hairline. When an expandable feature is on, the row and its drawer share one Fill tint at an 18px radius, and the hairlines around it drop away.
- The drawer opens by animating grid rows from 0fr to 1fr over 260ms, and it is `inert` while closed. Sub-option rows are indented 24px and sit at 55% opacity while the parent is off.
- **Warning callout:** a Coral Wash block with Coral text and a triangle icon, indented with the sub-rows.

### Buttons
- **Shape:** capsule, 32px tall, label type.
- **Default:** a Fill background with Ink text that turns to Fill Hover on hover. It scales to 0.96 while pressed.
- **Quiet:** transparent with Ink 2 text, gaining Fill on hover. Used for Reset and Cancel.
- **Danger:** a solid Danger Fill with white text. Used only for the destructive confirm action in the dialog.

### Inputs / Fields
- **Style:** a Fill background with no border, an 11px radius and 34px height. Fill Hover on hover.
- **Focus:** the background lifts to Glass Strong and gains the focus halo (3px Indigo Wash plus a 1px Indigo ring).
- **Select:** a native select with the appearance reset, a 12px chevron on the right and a 170px minimum width.
- **Number:** 78px wide, right-aligned tabular numerals, with an optional Ink 3 unit beside it.
- **Text and template:** full width, mono. The filename preview beneath is a mono Fill block.
- **Shortcut recorder:** a mono button of at least 112px. While listening it reads "Press keys…" in Indigo with the focus halo.
- **Disabled:** 50% opacity.

### Search Capsule
- A 38px capsule in Fill with a 16px magnifier and a "/" keycap hint. On focus it turns Glass Strong with the Indigo Wash halo, and the keycap hides.

### Navigation
- Items are 18px line icons (1.8 stroke) with a label and a tabular count, on a 12px radius in Ink 2. Hover adds Fill and Ink.
- **Active:** a Glass Strong seat with the soft seat shadow. The icon turns Indigo.
- Group labels (Everyday, Power tools) are 12px Ink 3 in sentence case. They mirror the half titles in the content and hide when search empties their group.
- **Mobile:** a horizontal row of chips with an edge fade, as described in Layout.

### Panels
- Glass, a 28px radius and 8px padding. The head holds a 30px icon tile (9px radius) tinted Indigo Wash in Everyday and Coral Wash in Power tools, a title-weight group name and an "N of M on" count. An optional intro (14px, Ink 2) follows.

### Badges
- 20px capsules in sentence case, placed after the row label.
- **Experimental:** a Coral 1px inset outline with Coral text, no fill.
- **Untested:** an Ink 3 outline with Ink 2 text, no fill.
- **Risky:** a Coral Wash fill with Coral text.

### Saved Pill
- A Glass Strong capsule with a check icon, reading "Saved" in Ink 3 at rest. When a save lands it turns Saved Green and pulses (scales to 1.06 at 40% of 500ms) for 1.6s. On error it turns Coral and hides the check.

### Confirm Dialog
- A native dialog in Glass Strong with a 28px radius and 22px padding, at most 400px wide. It rises 8px and scales from 0.98 over 240ms. The scrim is `rgb(8 10 18 / 0.35)` with a 6px blur. Actions are right-aligned: Quiet Cancel, then Danger.

### Motion
- One easing for everything: `cubic-bezier(0.22, 1, 0.36, 1)`, a soft ease-out. Durations run from 120ms (button press) through 180 to 200ms (hovers and fills) to 240 to 280ms (switch, drawer, dialog).
- `prefers-reduced-motion` turns off all transitions and animations and makes anchor scrolling instant.

## Do's and Don'ts

### Do:
- **Do** build every raised surface from the one glass recipe (24px blur, scheme saturate, specular rim, glass lift shadow) and let the field show through.
- **Do** keep radii concentric (28, 18, 12, 11) and make anything pressed or toggled a capsule.
- **Do** reserve Indigo for on-state and focus, and Coral for risk, experimental status and destructive context.
- **Do** separate list rows with inset hairlines and reveal dependent options in a drawer beneath their parent.
- **Do** mark experimental, untested and risky features with their badge, and give risky toggles a warning callout.
- **Do** honor `prefers-reduced-transparency` (solid Glass Strong) and `prefers-reduced-motion` (no animation).
- **Do** take every color from a token so light and dark resolve from the same properties.

### Don't:
- **Don't** fall back to a flat white two-column options page or opaque bordered cards.
- **Don't** color components with the pool hues, and don't use Instagram's gradient or logo anywhere in the UI.
- **Don't** use Coral for anything that isn't risk. It stops working as a warning if it decorates.
- **Don't** stack glass on glass beyond the dialog over its scrim. Nested surfaces use Fill tints.
- **Don't** load remote fonts, scripts or images. Extension pages ship local assets only.
