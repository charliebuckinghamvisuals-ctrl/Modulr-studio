# Modulr Studio - To Do

The live list. Ticked items stay for a while so the history is visible;
prune when a section is all done. Dates are when the item was added or
last moved.

## 1. Quoting system - the last piece (added 22 Sep 2026)

Design agreed in chat, 22 Sep. About 40% of it already exists: the
configurator's `calculatePrice()` measures the design, Projects already has
client details, estimate value, lead/quoted/won/lost/complete and the
quotedAt/wonAt stamps, and the PDF export has estimate/actual/none price
modes.

**Phase 1 - price book and quote builder (~2 days)**
- [ ] Company profile in Account: logo, address, VAT number, VAT-registered
      toggle, terms text, deposit schedule, quote validity days.
- [ ] Company price book, per account not per scene: move the PricingPanel
      rates out of the scene into Firestore under the company. Versioned, so
      a sent quote keeps the rates it was priced at.
- [ ] Extras catalogue the firm defines: electrics pack, heating, groundworks
      per m², delivery bands, foundation types.
- [ ] `calculatePrice()` -> `buildBillOfQuantities()` in the configurator
      store, returning line items (`Base structure · 18.2 m² x £1,200`) not
      one number. Price pill keeps using the total. Must stay cheap - it runs
      on every edit.
- [ ] Quote entity under a project: generated lines + manual lines +
      discounts + subtotal/VAT/total + deposit + validity + quote number +
      status (draft/sent/viewed/accepted/declined/expired) + version +
      design snapshot + attached renders.
- [ ] Quotes tab in Projects: "Quote from design" pre-fills from the BoQ,
      every line editable, tick extras, pick renders. Sending stamps quotedAt
      and moves the project to Quoted.
- [ ] Branded quote PDF (reuse PDFGenerator / ExportPDFModal).

**Phase 2 - client page (~1-2 days)**
- [ ] Public `/q/{token}` page: hero render, walkthrough clip if any, line
      items, terms, **Accept this quote** (name + tick + timestamp).
- [ ] Acceptance stamps wonAt, flips project to Won, emails the firm.
      View tracking (sent -> viewed).
- [ ] Revisions: v2 supersedes v1, old link shows "superseded".

**Phase 3 - later**
- [ ] Stripe Checkout deposit on Accept.
- [ ] Pipeline dashboard in Projects: quoted value, win rate, time to accept.
- [ ] Extras templates per product range; client tweaks options on the
      quote page and sees the price move.

**Decisions still Charlie's**
- [ ] Which tier: lean is Configurator (£49.99) gets quotes + PDF, The Hub
      gets the client page with renders and Accept.
- [ ] Price book shape: per-m² model (as now) vs range base price + options.
      Both can coexist - a range base price is just a line item.

## 2. Billing - Stripe and plan enforcement

- [ ] **Stripe setup** (Charlie): products and prices for Trial / Configurator
      £49.99 / The Hub £199 (restructured 20 Sep), webhook secret, keys on
      Render. Billing stays closed until this is done; everyone who confirms
      an email is a tester (40 renders / 7 days).
- [ ] Plan enforcement server-side once Stripe is live: `canUseRenderTools`,
      4K export allowance, animation clips per month. Deferred on purpose
      until there is something to enforce against.
- [ ] Video credit packs for Animation Studio: separate packs with a server
      price table, not user-side billing (recommended 17 Sep, undecided).
      Animation is on Kling O3 Pro via fal.ai; Charlie wants Seedance 2.5
      via Higgsfield - `FAL_KEY` / `HF_CREDENTIALS` needed on Render.
- [ ] Founding-company offer mechanics (first 5 companies) if still wanted.
- [ ] 4K: rerender vs upscale - undecided; cost controls branch (26 Aug)
      still uncommitted on its worktree.

## 3. Launch loose ends

- [ ] Google Search Console verification + `www` redirect check (Charlie).
- [ ] Share link for designs (Charlie's; server has `/api/share/:token`).
- [ ] Material Editor upload -> analyse -> Apply and the interior render
      path: run once on a real account after the 22 Sep deploy (b4176e0).
- [ ] Lazy-load the tool views (bundle warning: chunks > 500 kB).
- [ ] Render judge upgrade + model pinning (parked 7 Sep).

## 4. 3D Configurator - Charlie's list (22 Sep 2026)

- [x] **L-shaped buildings** back in the picker (22 Sep): Footprint row
      (Rectangle / L-Shape) under Roof Shape, cut-out width/depth inputs,
      price subtracts the notch, render inventory names the L. Flat roof only.
- [ ] L-shape follow-ups: doors and windows on the two INNER faces of the
      cut-out (openings still only take front/back/left/right); canopy and
      the per-elevation dimension labels skip L today; PDF elevations show
      four faces not six; walk-mode collision round the notch unchecked.
- [ ] **Gable over an L** - two ridges or a hip at the corner. Separate job.
- [x] Roof coverings (22 Sep, ambientCG CC0): clay pantiles, round slate,
      slate (gable only), corrugated steel dark / black / dark grey (both
      roof shapes). Found and fixed on the way: the gable slabs had ONE
      material group, so their textured top never showed - rubber and
      aluminium had been plain colour on every gable since they were added.
- [x] Cladding (22 Sep): corrugated black / dark grey, box metal black /
      anthracite (Poly Haven box profile). Laminate floor added. Timber lap
      siding and Japanese cedar plank were added and pulled the same day
      ("terrible") - keys still resolve for saved designs, textures gone.
- [x] Decking edges are a flat skirting in the deck colour; boards on top
      only (22 Sep).
- [ ] Poliigon "Aged Wooden Shingle Roof" (free, but behind a Poliigon
      login, so not fetched): download the 1K JPG set, drop it in
      garden-scene-builder/public/textures as roof_shingle_{color,normal,
      roughness,ao}.jpg and add a roofTiles def like roof_slate.
- [ ] **GLB / SketchUp export of a design** - see chat 22 Sep: three.js
      GLTFExporter on the live scene minus helpers; SketchUp imports GLB.
- [x] Internal walls reach the gable (22 Sep): a profile cap on every
      partition follows the ceiling - vaulted or flat - checked by raycast
      and by eye in the live scene, main run and L-leg alike.
- [x] Decking is the painted-boards set in any colour (22 Sep): every deck
      key is the same white_planks board texture at 140mm boards; presets are
      colours, plus a colour picker (`room.deckingTint`) and Reset.

## 5. Tools - open threads

- [ ] Floor Plan Studio: CAD plan figures still drift; SVG/DXF export and
      bird's-eye preset parked.
- [ ] Garden tool: surfaces/zones + clay massing next.
- [ ] Multi-view close-ups from user-framed configurator cameras - parked,
      do not build unasked.
- [ ] Kitchen paint material: next lever is an indoor reflection env.

## Done (recent)

- [x] Material Studio split into Detail Studio + Material Editor (22 Sep).
- [x] Gallery: Camera Shots section; Animations: games-room clip; Home step
      03 shows three camera shots (22 Sep).
- [x] Interior render mode, saved cameras, time x weather (21-22 Sep).
- [x] Pricing restructure, editorial home, watermark gone (20 Sep).
- [x] Gallery featured works, compare sliders, Detail Studio sheets and
      standalone studio examples (the original roadmap).
