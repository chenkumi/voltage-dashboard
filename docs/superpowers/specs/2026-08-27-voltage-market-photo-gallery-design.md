# Voltage Market Photo Gallery Redesign

## Goal

Replace Voltage Market's current high-contrast, hard-bordered visual style with a
responsive editorial product gallery. Product photos are the primary visual
content; the redesign must not change store behavior or WebMCP capabilities.

## Scope

- Update the visual structure and styling in `src/app/webmcp/voltage-market.tsx`.
- Preserve all catalog filtering, sorting, pagination, cart, checkout, order,
  navigation, persistence, and WebMCP tool behavior.
- Preserve the existing responsive behavior while replacing its presentation.
- Do not alter product data, tool definitions, checkout fields, or commerce
  safety boundaries.

## Visual Direction

The interface is a quiet, independent-editorial product catalog rather than a
neo-brutalist storefront.

- Page background: muted grey-green near `#E9EBE6`.
- Product canvases: near-warm-white variants `#F5F6F1`, `#F4F6F3`, and
  `#F6F3EE`.
- Text: soft charcoal instead of pure black.
- Accent: restrained muted green-grey for metadata and control surfaces.
- Typography: high-contrast serif for editorial headings and product names;
  compact sans-serif for navigation, controls, labels, and metadata.
- Surfaces: no heavy black borders, square button treatments, or hard grid
  dividers.

## Layout

### Header and catalog introduction

- A compact wordmark, text navigation, and cart count form the desktop header.
- The catalog introduction has a large editorial heading and a short
  descriptive paragraph in a separate text block.
- On mobile, text navigation collapses while the wordmark and cart remain
  accessible.

### Catalog controls

- Category, price, and sorting controls retain their existing functionality.
- Controls use compact, rounded, low-contrast surfaces.
- Product count and filters sit in a light editorial toolbar instead of the
  current hard-bordered controls.

### Product cards

- Photos are displayed with `object-contain`, preserving the full product
  image without cropping.
- Product photos occupy a large canvas with approximately 4% inner padding.
- All product metadata, names, prices, ratings, and actions remain outside the
  photo. Text must never be overlaid on images.
- Each canvas receives one faint geometric background treatment: dots, arcs,
  or fine lines. Patterns are neutral, behind the image, and use opacity in
  the 0.12-0.20 range.
- Canvas colors rotate across the three near-warm-white variants so that they
  are visually distinct from, but not strongly contrasted with, the page
  background.
- Product information remains readable regardless of the photo's colors or
  composition.

### Cart, checkout, and orders

- These views adopt the same muted page background, serif/sans typography,
  rounded surfaces, and low-contrast separators.
- Existing forms, confirmation dialogs, validation, and user-only final order
  confirmation behavior remain unchanged.
- No sensitive information is shown to the Agent or passed through WebMCP
  tools.

## Responsive Behavior

- Desktop catalog: three columns with generous gaps.
- Narrow layouts: two columns for the catalog; preserve photo size and move
  card metadata below each image.
- Mobile: compact header and a two-column product grid. Filters collapse to a
  concise first control while preserving available filtering behavior.
- Checkout and order content continue to use a single readable column on
  small screens.

## Accessibility and Interaction

- Keep visible focus states for all interactive controls.
- Preserve semantic buttons, labels, form validation, live announcements, and
  keyboard navigation.
- Retain alternative text from product titles for product images.
- Product photo decoration is presentational and must not alter the image's
  accessible name.

## Verification

- Existing WebMCP tool definitions and commerce-safety tests continue to pass.
- Verify catalog filtering, sorting, pagination, cart updates, checkout
  navigation, user-only order creation, order cancellation confirmation, and
  browser persistence.
- Verify `/chat`, `/webmcp-demo/shop-a`, and `/webmcp-demo/shop-b` at desktop
  and mobile widths.
- Run `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run check:architecture`, and `npm run build` after implementation.
