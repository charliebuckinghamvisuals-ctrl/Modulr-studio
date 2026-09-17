# Render engine: diagnosis and rebuild plan for Thu 17 and Fri 18 Sep 2026

## 1. Straight answers to your questions

**Is it a Sunburst issue?**
Mostly, yes. Until 15 Sep the configurator render ran on Gemini flash-image, which
was A/B-proven on 4 Sep to reproduce the building 1:1 (3 of 3 with fresh seeds).
On 15 Sep every image call moved to GPT Image 2.5 Sunburst through the OpenAI
`/v1/images/edits` endpoint. That change was never put through the A/B harness,
because the harness (`scripts/render-ab.mjs`) only speaks Gemini. Your own rule
from 4 Sep, written into server.js, says "do not upgrade the render model without
re-running that harness". It was upgraded without re-running it.

Sunburst is an *editing* model. It re-synthesises the whole frame from the prompt
plus the reference image. It is not pixel-locked to the input, which is exactly
what gemini-3-pro-image did to you on 25 Aug (shorter building, moved window,
glazed door). Same failure class, new model.

**Why are the close-up material shots fine, then?**
Because Material Studio never lets the model touch geometry. It is a masked
inpaint on a crop, and the result is composited back over the ORIGINAL pixels.
Everything outside the mask literally cannot change. "Send to render" hands the
model the whole frame and asks it nicely to keep the geometry. Nicely is not
enough for an editing model.

**Is there code that needs changing?**
The code is not "broken" in the crash sense. It is three generations of prompt
and guard, each written for a different model, all still live at once. What I
found today, in order of likely effect on the decking:

1. `openAiImageEdit` (server.js ~line 1151) sends no `input_fidelity` parameter.
   On gpt-image-1 the edits endpoint accepts `input_fidelity: "high"` to preserve
   the input image. Whether 2.5 Sunburst honours it is a ten-minute test. If it
   does, this alone may fix most of the drift.
2. The prompt (`sketchUpPrompt`, ~line 2720) was written for Gemini flash and
   tells the model: "YOU MUST REPLACE, NOT PRESERVE", "discard the flat fill
   colours", "the flat green ground plane ... are PLACEHOLDERS", "build the
   designed garden around the building", "a pebble or paving margin where lawn
   meets ...". On a faithful model that was harmless. On an editing model it is a
   licence to repaint the ground, and the ground is where the decking sits.
3. The same prompt also says "do NOT invent decking, patios" and lists the
   decking areas (~line 2386). So the model gets both instructions, thousands of
   words apart. The hard-rules block at the top covers camera, openings and roof
   form. It does not mention decking, paths, the boundary or the lights.
4. The QA inspector (~line 2994) checks doors, windows, roof form, cladding
   colour, door type and camera. It does NOT check decking, paths, boundary or
   exterior lights. A render with the wrong deck comes back `verified: true`.
5. The source image is the on-screen canvas at whatever size your browser window
   is, then compressed to 1920 on the long edge (DesignerView.tsx ~line 133).
   The model is asked for 2048. On a small window it is upscaling a soft source
   and inventing detail to fill it.
6. Noise: the prompt still says "Engine: Nano Banana Pro (V3.2)", "8K-UHD", and
   asks for "2K output" while the size is set separately. Renders go through
   ~950 lines of `/api/renderBuilding` with three engines' worth of branches.

So: a rebuild is justified, but rebuilding blind would be a mistake. If Sunburst
simply cannot hold geometry at full-frame, a beautifully clean new engine on
Sunburst inherits the same problem and you have lost two days. Thursday morning
is for finding out, with evidence, before anything is deleted.

## 2. Thursday 17 Sep: diagnose, then strip

### Morning: the A/B (about 3 hours, roughly 15 to 20 pounds of API calls)

- [ ] **Step 1. Fix three test designs** in the configurator on localhost and
      save them. Suggested: (a) simple box with a front deck; (b) outdoor section
      plus deck and a fence run; (c) complex: paths, boundary, two wall lights,
      bi-fold doors. These three are the golden set for everything that follows.
- [ ] **Step 2. Capture each one** as source.png + spec.json. Either
      `temp-puppeteer/capture-design.js` or log the RENDER_3D_SCENE payload from
      the browser console. Keep them in `test-designs/<name>/` in the repo.
- [ ] **Step 3. Add a Sunburst variant to `scripts/render-ab.mjs`**. Today it only
      calls Gemini. It needs to call `/v1/images/edits` with the same prompt the
      server builds, so the comparison is one variable at a time.
- [ ] **Step 4. Run the matrix on design (a)**, two seeds each, and look at every
      image yourself. Do not trust the flash-lite inspector on this.

      | Variant | Engine | Prompt | What it tells you |
      |---|---|---|---|
      | A | Sunburst | current prompt | the live behaviour, baseline |
      | B | Gemini flash-image | current prompt | the 4 Sep proven path, does it still hold? |
      | C | Sunburst + `input_fidelity: high` | current prompt | does the engine have a fidelity switch at all |
      | D | Sunburst | stripped contract prompt (hard rules + inventory, no "replace/discard/dress" language) | is it the prompt or the model |
      | E | Sunburst, source upscaled to 2048 first | current prompt | is a soft source part of it |

- [ ] **Step 5. Decide by lunch.** Write the result as a table in this file:
      which engine held the deck, openings, roof and camera on both seeds. That
      decision sets the provider the new engine defaults to. If nothing holds
      geometry full-frame, the new engine gets the outline-drawing input (three.js
      edge pass) on day one rather than as a later extra.

### Afternoon: strip the old engine (about 3 hours)

- [ ] **Step 6. Branch.** `git checkout -b render-rebuild`. Main stays parked
      (`UNDER_CONSTRUCTION = true`). Nothing is pushed until you sign off renders.
- [ ] **Step 7. Delete the old render code.** The list:
      - server.js: `/api/renderBuilding`, `/api/editImage`, `/api/applyWeather`,
        `/api/generatePresentationBoard`, `/api/export4k`, `/api/generateLineDrawing`,
        `/api/segmentMaterials`, `/api/inpaintMasked`, the materials analyser
        endpoints, `MATERIALS_PASS_PROMPT`, `buildConfigSpecBlock`, `buildSpecFacts`,
        the house-style and site-context blocks. That is roughly 3,000 of 4,700 lines.
      - services/geminiService.ts: every render, edit, weather, board, line and 4K function.
      - services/maskedEdit.ts, components/views/MaterialStudioView.tsx, the
        Render / Line / Weather parts of WorkspaceView, the render paths in
        hooks/useAppEngine.ts, `QualityChips` in App.tsx.
      - scripts/render-refine.mjs, the Gemini-only parts of scripts/prompt-tests.mjs.
- [ ] **Step 8. Keep, untouched:** configurator, auth, credits and the credit
      charge helpers, Stripe, projects, gallery, share, planning checker,
      Animation Studio, PDF, `logRender` and the cost log, `resolveImageQuality`
      and the Business-only Max rule, `openAiImageEdit` / `openAiImageGenerate`
      as raw provider calls (they move into the new folder).
- [ ] **Step 9. Get it building and running.** "Send to render" shows a plain
      "render engine being rebuilt" stub. `npm run build` clean, `npm test` green
      (trim the tests that pointed at deleted code). Commit on the branch.

## 3. Friday 18 Sep: build the new engine

- [ ] **Step 10. New folder `render/`** with one file per job. Nothing render-
      related lives in server.js again except mounting the route.

      ```
      render/
        index.js        the single POST /api/render route: auth, credits, log
        inputs.js       source frame(s) from the configurator, sized correctly
        contract.js     builds the prompt from roomSpec
        verify.js       item-level check, one retry
        providers/
          sunburst.js   OpenAI edits, size, quality, input_fidelity
          gemini.js     flash-image, the fallback and the A/B partner
      ```

- [ ] **Step 11. Inputs.** The configurator renders the frame OFFSCREEN at 2048
      on the long edge, not the on-screen canvas. Image 1 is that frame. If
      Thursday said full-frame drift is the model, image 1 becomes the three.js
      edge/outline pass and image 2 the shaded frame as colour reference.
- [ ] **Step 12. Contract prompt.** Under 40 lines. Order matters on the edits
      endpoint, so: HARD RULES (camera, geometry, every opening, roof, decking
      outline, paths, boundary, lights: unchanged), then a numbered INVENTORY
      generated from roomSpec (every wall, opening, deck, path, fence run, light,
      with its material and colour), then FORBIDDEN (nothing added, removed, moved,
      restyled; no furniture; no paving or platforms not in the inventory), then
      LOOK last (sun, sky, planting, material finish). No "replace", "discard",
      "placeholder" or "dress the set" language anywhere.
- [ ] **Step 13. Verifier.** One pinned vision model. It gets the inventory and
      answers per item: present, unchanged, yes or no. Decking, paths, boundary
      and lights are items, not afterthoughts. Any failure: one retry with the
      failed items promoted to the top of the hard rules. Both attempts and the
      verdict go in the log so you can see what QA actually saw.
- [ ] **Step 14. Wire it in.** Credits charged once per accepted render, quality
      tier respected, `logRender` with tokens, gallery save, share, PDF. Cost per
      tier shown on the button.
- [ ] **Step 15. Test on the three golden designs**, two seeds each, against
      Thursday's baseline images. Pass means: deck, openings, roof, camera and
      colours all held on both seeds, judged by eye.
- [ ] **Step 16. Sign-off and ship.** You look at the six renders. If good:
      merge to main, flip `UNDER_CONSTRUCTION` to false, one push (one Render
      restart, one 520 window). If not good: stay parked, and the Monday job is
      the outline-input variant.

## 4. Before you start Thursday

- Local `.env` has `OPENAI_API_KEY`, `GEMINI_API_KEY` and `FAL_KEY`.
- OpenAI org is verified (Sunburst refuses otherwise).
- Budget about 20 pounds for the A/B and 20 pounds for Friday's testing.
- Localhost is up on port 3000 with `?preview=1` to get past the parked page.
- Untracked GLB models sitting in `public/3d-config/models/` are not part of
  this. Leave them.

## 5. Out of scope this week (on purpose)

Material Studio stays locked. Line Converter and Weather Lab come back as
modes of the new engine later, not this week. No Stripe work. No 4K upscale
decision.
