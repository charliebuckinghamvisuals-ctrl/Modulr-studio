/**
 * Fork of @react-three/csg (MIT) with one crucial behavioural change.
 *
 * The original Geometry.update() DISPOSES the current geometry BEFORE
 * evaluating the boolean, and its catch block just console.log's - so
 * whenever three-bvh-csg throws (it does intermittently on certain opening
 * sizes/alignments), the mesh is left as NOTHING until the next successful
 * rebuild. That was the "walls flash out while resizing a window" bug.
 *
 * This version evaluates FIRST and only swaps the geometry in on success;
 * on failure the previous geometry stays visible and a console.warn records
 * it. Base/Addition/Subtraction are forked too because they read a context
 * private to the original module.
 */
import * as React from 'react'
import * as THREE from 'three'
import { extend } from '@react-three/fiber'
import {
  SUBTRACTION,
  ADDITION,
  DIFFERENCE,
  INTERSECTION,
  REVERSE_SUBTRACTION,
  Brush as BrushImpl,
  Evaluator,
} from 'three-bvh-csg'

const TYPES: Record<string, number> = {
  subtraction: SUBTRACTION,
  reverseSubtraction: REVERSE_SUBTRACTION,
  addition: ADDITION,
  difference: DIFFERENCE,
  intersection: INTERSECTION,
}

type Brush = BrushImpl & { operator: keyof typeof TYPES; showOperation?: boolean }

function dispose(geometry: THREE.BufferGeometry) {
  geometry.dispose()
  geometry.attributes = {}
  geometry.groups = []
  ;(geometry as any).boundsTree = geometry.index = geometry.boundingBox = geometry.boundingSphere = null as any
  geometry.drawRange = { start: 0, count: Infinity }
}

/** Every coordinate a real number. A NaN'd geometry has the right vertex
 *  count and draws nothing, so the count checks alone let it through. */
function isFinite(geometry: THREE.BufferGeometry): boolean {
  const pos = geometry?.attributes?.position
  if (!pos) return false
  const a = pos.array as ArrayLike<number>
  const n = Math.min(a.length, (pos.count || 0) * pos.itemSize)
  for (let i = 0; i < n; i++) if (!Number.isFinite(a[i])) return false
  return true
}

/** Would this geometry put anything on screen? Vertices, finite, something
 *  to draw, and (under useGroups) at least one group for the material array
 *  to bind to. */
export function healthy(geometry: THREE.BufferGeometry): boolean {
  const pos = geometry?.attributes?.position
  if (!pos || pos.count === 0) return false
  if (geometry.drawRange && geometry.drawRange.count === 0) return false
  return isFinite(geometry)
}

function resolve(op: THREE.Object3D): Brush {
  let currentOp: THREE.Object3D = null!
  if (op instanceof BrushImpl) {
    op.updateMatrixWorld()
    currentOp = op
  } else {
    op.traverse((obj) => {
      obj.updateMatrixWorld()
      if (!currentOp && obj instanceof BrushImpl) currentOp = obj
    })
  }
  return currentOp as Brush
}

const csgContext = React.createContext<{ showOperations: boolean }>({ showOperations: false })

export type SafeGeometryProps = {
  children?: React.ReactNode
  useGroups?: boolean
  computeVertexNormals?: boolean
  showOperations?: boolean
}

/** Cheap fingerprint of the boolean inputs: operator, geometry identity/params
 *  and world transform of every brush. If this is unchanged there is nothing
 *  to recompute.
 *
 *  The uuid is ALWAYS part of the print, not just for parameter-less
 *  geometries. The clad walls are BoxGeometries whose UVs are rewritten in
 *  place (world-scale mapping, cladding orientation), so two geometries with
 *  identical box parameters can render completely differently - keying on
 *  parameters alone made the vertical/horizontal cladding toggle a no-op.
 *  Geometries are memoized upstream, so the uuid is stable between renders
 *  and only changes when a genuinely new geometry is supplied. */
/**
 * A brush's transform relative to the operations group - which is the frame
 * the boolean is evaluated in (update() forces the group's world matrix to
 * identity first). This used to key on matrixWorld, which also carries every
 * ancestor above the group: drag an internal wall and its world matrix
 * changes on every pointer move, so the boolean was rebuilt - disposed and
 * swapped - on every frame of the drag, and the wall flashed in and out.
 * Moving the whole object does not change the boolean; only the brushes'
 * placement within it does.
 */
function relativeMatrix(o: THREE.Object3D, root: THREE.Object3D): THREE.Matrix4 {
  const m = new THREE.Matrix4()
  let n: THREE.Object3D | null = o
  while (n && n !== root) {
    n.updateMatrix()
    m.premultiply(n.matrix)
    n = n.parent
  }
  return m
}

function signature(ops: Brush[], root: THREE.Object3D): string {
  return ops
    .map((o) => {
      const g: any = o.geometry
      const params = g?.parameters ? Object.values(g.parameters).join(',') : ''
      const m = relativeMatrix(o, root).elements.map((n) => Math.round(n * 1e4)).join(',')
      return `${o.operator}|${params}|${g?.uuid || ''}|${m}`
    })
    .join(';')
}

export const Geometry = React.forwardRef<any, SafeGeometryProps>(({ children, computeVertexNormals = false, useGroups = false, showOperations = false }, fref) => {
  const geo = React.useRef<THREE.BufferGeometry>(null!)
  const operations = React.useRef<THREE.Group>(null!)
  const lastSig = React.useRef<string>('')
  // Self-retry bookkeeping: which inputs the last attempt was for, and how
  // many times they have failed in a row.
  const lastAttempt = React.useRef<string>('')
  const failRetries = React.useRef(0)
  const ev = React.useMemo(() => Object.assign(new Evaluator(), { useGroups, consolidateGroups: false }), [useGroups])
  // The geometry object currently on the mesh. It starts as the R3F-created
  // <bufferGeometry> below and is replaced wholesale by every rebuild.
  const live = React.useRef<THREE.BufferGeometry | null>(null)

  const getMesh = React.useCallback((): THREE.Mesh | null => (geo.current as any)?.__r3f?.parent?.object ?? null, [])
  const liveGeometry = React.useCallback((): THREE.BufferGeometry => getMesh()?.geometry ?? live.current ?? geo.current, [getMesh])

  /**
   * Put `next` on the mesh as a whole new geometry object.
   *
   * This used to copy the boolean's buffers INTO the one geometry the mesh
   * was created with. That is the bug behind "the walls disappear when I
   * drag" (14 Sep 2026, traced at the WebGL call level): three r184 uploads
   * a geometry's vertex buffers once per frame, keyed on a frame counter
   * that is bumped after the visibility pass and before the shadow pass, so
   * with shadows on the upload normally lands in the shadow pass. A rebuild
   * that arrives in a frame where the shadow pass skips this mesh - every
   * drag freezes shadow updates, and a wall can also leave the shadow
   * camera - reaches the main pass with new attribute objects and NO GPU
   * buffers yet. three then caches an EMPTY vertex array for this geometry
   * under the wall material's program, keyed on those attribute objects, and
   * never rebinds it: the data is perfect, the mesh is visible, and the GPU
   * draws nothing until the next rebuild happens to land in a good frame.
   * That is exactly the flicker-then-gone Charlie recorded. A geometry the
   * renderer has never seen has no such cache: it is uploaded before its
   * first draw in every frame ordering. So: new object every time.
   */
  const install = React.useCallback((next: THREE.BufferGeometry, material?: THREE.Material | THREE.Material[]) => {
    next.boundingBox = null
    next.boundingSphere = null
    const mesh = getMesh()
    if (!mesh) {
      // No mesh to hand it to (should not happen once mounted): fall back to
      // the in-place copy so at least something is there.
      dispose(geo.current)
      geo.current.index = next.index
      geo.current.attributes = next.attributes
      geo.current.groups = next.groups
      geo.current.drawRange = next.drawRange
      return
    }
    const prev = mesh.geometry
    mesh.geometry = next
    live.current = next
    if (ev.useGroups && material) mesh.material = material as any
    // The R3F-created geometry is left alone (React still owns it); anything
    // we installed before is ours to free.
    if (prev && prev !== next && prev !== geo.current) prev.dispose()
  }, [ev, getMesh])

  /** Put the uncut base solid on screen. Cloned, because the base geometry
   *  is often shared with a plain mesh elsewhere and is disposed on the next
   *  swap. Returns false when there is no base to show. */
  const showBase = React.useCallback((): boolean => {
    const baseBrush = operations.current?.children[0] as Brush | undefined
    const base = baseBrush ? resolve(baseBrush) : null
    const baseGeom = base?.geometry
    if (!baseGeom?.attributes?.position || !isFinite(baseGeom)) return false
    install(baseGeom.clone(), (base as any).material)
    return true
  }, [install])

  const update = React.useCallback(() => {
    const ops = operations.current.children.slice() as Brush[]
    if (ops.length === 0) return

    // The upstream library re-runs its layout effect on EVERY render with no
    // dependency array, so any unrelated state change re-ran the whole
    // boolean. Measured: 61 rebuilds during a single 12-step window drag.
    // Skip when the inputs are byte-for-byte the same as last time.
    const sig = signature(ops, operations.current)
    if (sig === lastSig.current) return
    lastSig.current = sig
    if (sig !== lastAttempt.current) { lastAttempt.current = sig; failRetries.current = 0 }

    // Debug counter: boolean rebuilds are the expensive operation in this
    // scene, so being able to count them is how we tell a real fix from a
    // hopeful one. Nothing in the app reads this.
    ;(window as any).__csgUpdates = (((window as any).__csgUpdates as number) || 0) + 1
    const baseBrush = ops[0]
    try {
      operations.current.matrixWorld.identity()
      let root = resolve(ops.shift()!)
      if (!root) throw new Error('no base brush resolved')
      while (ops.length) {
        const op = resolve(ops.shift()!)
        if (op) root = ev.evaluate(root, op, TYPES[op.operator] ?? ADDITION) as Brush
      }
      // three-bvh-csg can also fail SILENTLY: a degenerate input mid-drag
      // returns an empty geometry with no throw. Swapping that in is how
      // the walls vanished while resizing the building - so an empty result
      // is treated exactly like a throw.
      const pos = root.geometry?.attributes?.position
      if (!pos || pos.count === 0) throw new Error('boolean produced empty geometry')
      // The other silent failure: a NaN anywhere in the inputs (a dimension
      // that never became a number) gives a result with the right vertex
      // COUNT and not one finite coordinate in it. Nothing throws, nothing is
      // empty, the GPU just draws nothing - measured on the live build: a NaN
      // width left 36 NaN vertices, no warning, no walls. A non-finite bound
      // is treated as a failure so the previous walls stay up.
      if (!isFinite(root.geometry)) throw new Error('boolean produced non-finite geometry')
      // Success: put the result on the mesh as a NEW geometry object - never
      // by copying its buffers into the geometry already there. See install().
      if (computeVertexNormals) root.geometry.computeVertexNormals()
      install(root.geometry, root.material)
      failRetries.current = 0
    } catch (e) {
      // Keep the previous geometry on screen - a stale opening beats no
      // walls - and FORGET the signature. It was recorded before the
      // evaluate, so leaving it latched marked the failed state as "done":
      // the walls then stayed missing (or stale - the vertical-cladding
      // toggle doing nothing) until some unrelated input changed. Clearing
      // it makes the very next update retry the same inputs, and the rAF
      // below covers the case where that failure was the LAST update of a
      // gesture, with no further render to trigger the retry. Bounded so a
      // genuinely impossible boolean cannot spin forever.
      lastSig.current = ''
      if (failRetries.current < 3) {
        failRetries.current++
        requestAnimationFrame(() => update())
      }
      // Nothing to keep: the very first evaluate for this mesh failed (a
      // saved design loading, a wall that has just gained its first
      // opening), so "previous geometry" is an empty buffer and the wall
      // would simply not exist. A wall must never disappear - show the base
      // solid uncut instead.
      if (!healthy(liveGeometry())) showBase()
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[SafeCsg] boolean evaluate failed; keeping previous geometry', e)
      // Whoever owns the mesh (the room shell) listens for this and records
      // the design that produced it, so a report of missing walls comes with
      // the exact inputs instead of a screenshot.
      window.dispatchEvent(new CustomEvent('modulr-csg-failed', { detail: { message: msg } }))
    }
  }, [computeVertexNormals, ev, install, liveGeometry, showBase])

  /** Throw the signature away and run the boolean again from scratch. */
  const rebuild = React.useCallback(() => {
    lastSig.current = ''
    update()
  }, [update])

  // The geometry installed last is ours to dispose when the mesh goes.
  React.useEffect(() => () => {
    const g = live.current
    if (g && g !== geo.current) g.dispose()
  }, [])

  const ctx = React.useMemo(() => ({ showOperations }), [showOperations])
  React.useLayoutEffect(() => void update())
  React.useImperativeHandle(fref, () => ({
    get geometry() { return liveGeometry() },
    operations: operations.current,
    update,
    rebuild,
    showBase,
    healthy: () => healthy(liveGeometry()),
  }), [update, rebuild, showBase, liveGeometry])

  return (
    <>
      <group matrixAutoUpdate={false} ref={operations}>
        <csgContext.Provider value={ctx}>{children}</csgContext.Provider>
      </group>
      <bufferGeometry ref={geo} />
    </>
  )
})

type BaseProps = any

export const Base = React.forwardRef<Brush, BaseProps>(({ showOperation = false, operator = 'addition', ...props }, fref) => {
  extend({ Brush: BrushImpl })
  const { showOperations } = React.useContext(csgContext)
  return (
    // @ts-ignore - <brush> is registered via extend above
    <brush operator={operator} raycast={() => null} visible={showOperation || showOperations} ref={fref} {...props} />
  )
})

export const Addition = React.forwardRef<Brush, BaseProps>((props, fref) => <Base ref={fref} operator="addition" {...props} />)
export const Subtraction = React.forwardRef<Brush, BaseProps>((props, fref) => <Base ref={fref} operator="subtraction" {...props} />)
export const Difference = React.forwardRef<Brush, BaseProps>((props, fref) => <Base ref={fref} operator="difference" {...props} />)
export const Intersection = React.forwardRef<Brush, BaseProps>((props, fref) => <Base ref={fref} operator="intersection" {...props} />)
