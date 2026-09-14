# The disappearing walls (fixed 14 Sep 2026)

## What the user saw

Dragging a room handle (width or depth in plan view, front or back height
in 3D) made the exterior walls flash between present and gone, and they
often stayed gone after the drag. Roof, floor, door frames, furniture and
partitions all stayed. New designs and saved designs alike. Plan view often
still showed the wall band while 3D showed nothing.

## What was actually happening

The wall shell is a CSG mesh (`SafeCsg.tsx`). Every rebuild used to copy the
boolean's new vertex buffers INTO the one `BufferGeometry` object the mesh
was created with. That interacted with two facts about three.js r184:

1. `WebGLObjects.update` uploads a geometry's buffers once per frame, keyed
   on `info.render.frame`. That counter is bumped AFTER the visibility pass
   (`projectObject`) and BEFORE the shadow pass. With shadows on, the shadow
   pass's own upload is therefore stamped with the next frame's number, so
   the next frame's visibility pass skips the geometry and the upload
   normally lands in the shadow pass again.
2. `WebGLBindingStates.setupVertexAttributes` skips any attribute that has
   no GPU buffer yet (`if (attribute === undefined) continue`), and the
   resulting vertex-array object is cached against the attribute objects.
   `needsUpdate` only re-checks when those objects change identity.

So: a rebuild that lands in a frame where the shadow pass does NOT touch
the wall mesh - every handle drag freezes shadow updates
(`gl.shadowMap.autoUpdate = controlsEnabled` in MainScene), and a wall can
also fall outside the shadow camera - reaches the main pass with brand-new
attribute objects and no buffers. three binds an EMPTY vertex array for
(wall geometry, wall material program), caches it against those attribute
objects, and never rebinds. The next frame uploads the buffers, but the
cached binding still has nothing enabled. The data is perfect, the mesh is
visible, bounds are right, shaders compile, and the GPU draws nothing.
Each later rebuild is a fresh gamble, which is the flicker.

Proved with a WebGL call trace: in the broken state the shadow pass drew
the walls with position and uv bound, and the main pass drew the same
ranges with every attribute disabled. Replacing the attribute objects with
identical clones made the walls reappear instantly.

## The fix

`SafeCsg.install()`: every rebuild puts a NEW geometry object on the mesh
(the boolean result itself, or a clone of the base solid for the fallback)
and disposes the previous one. A geometry the renderer has never seen has
no cached binding and is uploaded before its first draw in every frame
ordering. The store/shell NaN guards and the 30-frame watchdog from earlier
the same day stay; they were not the cause but they are still worth having.

## If it ever comes back

With the walls gone, in the console:

```js
(()=>{const st=__modulrScene.__r3f.root.getState(),c=st.gl.getContext();let sg=null;__modulrScene.traverse(o=>{if(!sg&&o.userData&&o.userData.isShell)sg=o});let m=null;sg.traverse(o=>{if(!m&&o.isMesh&&Array.isArray(o.material)&&o.material.length>=6)m=o});const counts=m.geometry.groups.map(g=>g.count),out=[],d=c.drawArrays;c.drawArrays=function(mode,f,n){if(counts.includes(n))out.push(this.getVertexAttrib(0,this.VERTEX_ATTRIB_ARRAY_ENABLED)?'ok':'EMPTY');return d.call(this,mode,f,n)};st.advance(performance.now());c.drawArrays=d;return out.join(' ')})()
```

Any `EMPTY` means the same class of bug: a geometry drawn before its
buffers were uploaded. Look for anything that mutates a rendered
geometry's attributes in place.
