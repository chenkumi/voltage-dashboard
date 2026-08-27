# Voltage Market Photo Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Voltage Market as a low-contrast editorial photo gallery while preserving all store and WebMCP behavior.

**Architecture:** Keep all state, WebMCP registrations, navigation, cart mutations, checkout validation, and local persistence in `voltage-market.tsx` unchanged. Replace its presentation layer with reusable in-file photo-canvas markup and coherent utility-class tokens so catalog, cart, checkout, and orders share the approved neutral gallery visual language.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Lucide React, Vitest.

---

### Task 1: Add the photo-canvas presentation primitive

**Files:**
- Modify: `src/app/webmcp/voltage-market.tsx:413-439`
- Test: Manual visual verification at `/webmcp-demo/shop-b`

- [ ] **Step 1: Confirm the existing catalog has no behavior test surface for visual-only changes**

Run: `npm test -- src/app/webmcp/demo.test.ts src/app/webmcp/commerce-safety.test.ts`

Expected: The normalizer and commerce-boundary tests pass once the local Rollup optional dependency is available. No new unit test is required because this task changes DOM presentation only and preserves product callbacks and data.

- [ ] **Step 2: Add a catalog-only image canvas that keeps photo, decoration, and metadata separate**

Add this component after `ProductImage` in `src/app/webmcp/voltage-market.tsx`:

```tsx
const ProductPhotoCanvas = ({
  product,
  index,
}: {
  product: VoltageProduct
  index: number
}) => {
  const pattern = [
    "bg-[radial-gradient(circle_at_1px_1px,rgba(111,125,114,0.16)_1px,transparent_0)] bg-size-[15px_15px]",
    "bg-[repeating-radial-gradient(circle_at_0_100%,transparent_0_18px,rgba(111,125,114,0.14)_19px_20px,transparent_21px_38px)]",
    "bg-[repeating-linear-gradient(135deg,transparent_0_13px,rgba(134,128,112,0.12)_14px_15px,transparent_16px_28px)]",
  ][index % 3]
  const canvas = ["bg-[#f5f6f1]", "bg-[#f4f6f3]", "bg-[#f6f3ee]"][
    index % 3
  ]

  return (
    <div className={`relative aspect-[1/1.08] overflow-hidden rounded-md p-[4%] ${canvas} ${pattern}`}>
      <ProductImage product={product} className="relative z-10 size-full object-contain" />
    </div>
  )
}
```

- [ ] **Step 3: Verify image constraints manually**

Open `http://localhost:6171/webmcp-demo/shop-b` and confirm that one product with a light photo and one product with a saturated photo both retain their complete image, have no text over the image, and show only a faint decoration behind the image.

### Task 2: Rebuild catalog header, filters, and cards

**Files:**
- Modify: `src/app/webmcp/voltage-market.tsx:839-1144`
- Test: Manual catalog interaction verification at `/webmcp-demo/shop-b`

- [ ] **Step 1: Replace the hard-bordered catalog shell with the approved neutral palette**

Apply these root classes and use the same palette for the header, hero copy, and controls:

```tsx
<main className="min-h-full bg-[#e9ebe6] px-4 py-5 text-[#30322e] sm:px-6 sm:py-7">
  <div className="mx-auto max-w-7xl">
    <header className="mb-10 flex items-center justify-between gap-5">
      {/* existing navigation buttons retain their onClick handlers */}
    </header>
  </div>
</main>
```

Use rounded, low-contrast surfaces such as `bg-[#e2e5df]`,
`hover:bg-[#d8ddd5]`, `rounded-full`, and
`focus-visible:ring-2 focus-visible:ring-[#6f7d72]` for navigation and filter
controls. Do not change the `setView`, `applyFilters`, `setFilters`, or
`setPage` calls.

- [ ] **Step 2: Replace the promotional panel with separate editorial text blocks**

Keep the live catalog counts but present them without product-photo overlays:

```tsx
<section className="mb-8 grid gap-6 border-y border-[#cfd3cb] py-9 min-[900px]:grid-cols-[minmax(0,1fr)_18rem]">
  <div>
    <p className="text-[10px] font-semibold tracking-[0.16em] text-[#7b8078] uppercase">
      Curated daily objects
    </p>
    <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-[0.86] tracking-[-0.07em] sm:text-7xl">
      Objects for everyday use.
    </h1>
  </div>
  <p className="self-end font-serif text-sm leading-6 text-[#747872]">
    瀏覽 {voltageProducts.length} 件商品與 {voltageCategories.length} 個分類；所有訂單只保存於這個瀏覽器。
  </p>
</section>
```

- [ ] **Step 3: Render every catalog photo through `ProductPhotoCanvas` and move all labels below it**

Replace the current catalog photo container with:

```tsx
{visibleProducts.map((product, index) => (
  <article key={product.id} className="group min-w-0 [content-visibility:auto]">
    <ProductPhotoCanvas product={product} index={index} />
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-1 pt-3">
      <div>
        <p className="text-[9px] font-semibold tracking-[0.12em] text-[#7b8078] uppercase">
          {formatVoltageCategory(product.category)}
        </p>
        <h2 className="mt-1 font-serif text-xl leading-[0.95] tracking-[-0.045em]">
          {product.title}
        </h2>
      </div>
      <span className="pt-4 text-sm">{formatMoney(product.salePrice)}</span>
    </div>
    {/* Preserve rating, original price, stock state, and existing handleAdd callback below this block. */}
  </article>
))}
```

- [ ] **Step 4: Preserve catalog behavior manually**

At `/webmcp-demo/shop-b`, verify search, category selection, maximum price,
sort selection, clearing filters, pagination, out-of-stock presentation, and
adding a product to the cart. Confirm the clicked product and cart count are
unchanged from the previous implementation.

### Task 3: Apply the same visual system to cart, checkout, and orders

**Files:**
- Modify: `src/app/webmcp/voltage-market.tsx:1146-1593`
- Test: Manual commerce-flow verification at `/webmcp-demo/shop-b`

- [ ] **Step 1: Restyle cart rows and summary without changing quantity or checkout callbacks**

Use near-warm-white item surfaces and rounded low-contrast controls:

```tsx
<article className="grid gap-4 rounded-lg bg-[#f5f6f1] p-4 sm:grid-cols-[112px_minmax(0,1fr)_auto]">
  <ProductImage product={item.product} className="h-28 w-full rounded-md bg-[#eef0e9] object-contain p-2" />
  {/* Preserve quantity buttons and setQuantity calls. */}
</article>
```

Use `bg-[#f4f6f3]`, `rounded-xl`, and `border border-[#cfd3cb]` for the order
summary. Preserve `setView("checkout")` and its disabled state exactly.

- [ ] **Step 2: Restyle checkout form and order history while preserving high-risk confirmation rules**

Use the following shared surface pattern for checkout and order records:

```tsx
<section className="rounded-xl bg-[#f5f6f1] p-5 sm:p-7">
  <p className="text-[10px] font-semibold tracking-[0.14em] text-[#7b8078] uppercase">
    Checkout / demo only
  </p>
  {/* Preserve existing inputs, submitCheckout handler, and user confirmation checkbox. */}
</section>
```

Inputs must retain their `id`, `required`, `autoComplete`, `value`, and
`onChange` properties. The submit button must retain `type="submit"` and the
existing `submitCheckout` handler. Order cancellation must retain its
two-step `cancelTarget` confirmation state.

- [ ] **Step 3: Verify the user-controlled commerce flow manually**

Add an in-stock product, alter its quantity, open checkout, enter data only
inside the iframe, confirm the checkbox, create a simulated order, open the
order history, start cancellation, and confirm it. Verify the relevant cart,
order, and localStorage state updates at each step.

### Task 4: Verify the redesign and maintain boundaries

**Files:**
- Modify: `src/app/webmcp/voltage-market.tsx`
- Test: `src/app/webmcp/commerce-safety.test.ts`
- Test: `src/app/webmcp/demo.test.ts`
- Test: `src/app/webmcp/voltage-market-data.test.ts`

- [ ] **Step 1: Run static checks and focused tests**

Run:

```bash
npm run typecheck
npm run lint
npm test -- src/app/webmcp/commerce-safety.test.ts src/app/webmcp/demo.test.ts src/app/webmcp/voltage-market-data.test.ts
npm run check:architecture
```

Expected: all commands exit successfully. If Vitest cannot start because
`@rollup/rollup-linux-x64-gnu` is missing, reinstall dependencies without
editing `package-lock.json`, then rerun the command.

- [ ] **Step 2: Build and complete visual regression checks**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite complete successfully. Then inspect `/chat`,
`/webmcp-demo/shop-a`, and `/webmcp-demo/shop-b` at desktop and mobile
widths. Confirm only Voltage Market changed visually, its iframe still
registers tools, and both sites preserve their navigation controls.
