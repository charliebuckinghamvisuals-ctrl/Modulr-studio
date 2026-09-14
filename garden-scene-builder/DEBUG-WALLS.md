# If the walls disappear again

Last seen 14 Sep 2026 on the live site (build "14 Sept, 10:20", commit
2dcf7c9): dragging the back-height handle in 3D on a 12000 x 6500 room with
a 3800 seven-leaf bifold on the front, front 2750 / back 2250 total. The
walls flipped between present and gone while dragging and stayed gone at
rest; the roof, floor, frames and furniture stayed. Same on new designs.
It cleared on its own later the same morning.

What was ruled out that day, on the live bundle, on the same laptop:

- The wall boolean (three-bvh-csg) built the correct geometry for that exact
  design and for every 50 mm of back height from 2300 down to 1300, every
  100 mm of width 3-15 m, depth 2-8 m, and ~250 random designs. No throw,
  no empty result, no NaN.
- The same design rendered correctly in the Claude desktop browser pane on
  this laptop's NVIDIA GPU. The user's Chrome window did not. So the
  difference was inside Chrome itself (most likely which GPU Chrome was
  drawing on, or its GPU process state), not the design or the code path.
- Chrome's console at the time showed "Texture marked for update but no
  image data found" x56 and the PCFSoftShadowMap deprecation repeating
  hundreds of times. Blank texture maps make the walls BLACK, not
  invisible, so that was not the cause either.

What is in the build to catch it:

- `store.updateRoom` drops non-finite numbers; the shell falls back on any
  non-finite dimension; SafeCsg refuses a non-finite boolean result.
- A watchdog in `RoomGeometry` checks the shell geometry every 30 frames,
  rebuilds it, and records any failure to `localStorage['modulr:shell-diag']`
  and `window.__modulrShellDiag`.

## The one thing to do when it happens

With the walls gone, press F12, open Console, type `allow pasting` and
Enter once, then paste this and Enter. It copies a report to the clipboard;
paste it to whoever is debugging.

```js
copy((()=>{const S=window.__modulrStore,sc=window.__modulrScene,st=sc.__r3f.root.getState(),gl=st.gl,c=gl.getContext(),e=c.getExtension('WEBGL_debug_renderer_info');let sg=null;sc.traverse(o=>{if(!sg&&o.userData&&o.userData.isShell)sg=o});let m=null;sg.traverse(o=>{if(!m&&o.isMesh&&Array.isArray(o.material)&&o.material.length>=6)m=o});const g=m.geometry;g.computeBoundingBox();const b=g.boundingBox;let vis=[],p=m;while(p){vis.push(p.visible);p=p.parent}const mats=m.material.map(x=>{const pr=gl.properties.get(x).currentProgram;return{t:x.type,v:x.visible,map:!!x.map,img:x.map&&x.map.image?1:0,prog:pr?(pr.diagnostics?'FAIL':'ok'):'none',log:pr&&pr.program?c.getProgramInfoLog(pr.program).slice(0,120):''}});const r=S.getState().scene.room;return JSON.stringify({gpu:e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):'?',ua:navigator.userAgent,room:[r.widthMm,r.depthMm,r.heightMm,r.backHeightMm],view:S.getState().viewMode,count:g.attributes.position?g.attributes.position.count:0,box:[b.min.toArray(),b.max.toArray()],dr:g.drawRange,groups:g.groups.length,vis,mats,csg:window.__csgUpdates,diag:window.__modulrShellDiag||null,err:c.getError(),design:localStorage.getItem('modulr_scene_autosave_v1')})})())
```

How to read it:

- `count` 0 or `box` the wrong size: the boolean failed. `diag` will say why.
- `count` right, `box` right, every `prog` "ok", but nothing on screen: the
  GPU is not drawing a valid mesh. Check `gpu`, then chrome://gpu, and try
  with hardware acceleration toggled or Chrome restarted.
- Any `prog` "FAIL": a wall shader did not compile on that GPU; `log` has
  the driver message.
- `design` is the exact room to load with `__modulrStore.getState().loadRoom(JSON.parse(design).room)`.
