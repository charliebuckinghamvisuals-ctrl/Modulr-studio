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
 *  to recompute. */
function signature(ops: Brush[]): string {
  return ops
    .map((o) => {
      o.updateMatrixWorld()
      const g: any = o.geometry
      const params = g?.parameters ? Object.values(g.parameters).join(',') : g?.uuid || ''
      const m = o.matrixWorld.elements.map((n) => Math.round(n * 1e4)).join(',')
      return `${o.operator}|${params}|${m}`
    })
    .join(';')
}

export const Geometry = React.forwardRef<any, SafeGeometryProps>(({ children, computeVertexNormals = false, useGroups = false, showOperations = false }, fref) => {
  const geo = React.useRef<THREE.BufferGeometry>(null!)
  const operations = React.useRef<THREE.Group>(null!)
  const lastSig = React.useRef<string>('')
  const ev = React.useMemo(() => Object.assign(new Evaluator(), { useGroups, consolidateGroups: false }), [useGroups])

  const update = React.useCallback(() => {
    const ops = operations.current.children.slice() as Brush[]
    if (ops.length === 0) return

    // The upstream library re-runs its layout effect on EVERY render with no
    // dependency array, so any unrelated state change re-ran the whole
    // boolean. Measured: 61 rebuilds during a single 12-step window drag.
    // Skip when the inputs are byte-for-byte the same as last time.
    const sig = signature(ops)
    if (sig === lastSig.current) return
    lastSig.current = sig

    // Debug counter: boolean rebuilds are the expensive operation in this
    // scene, so being able to count them is how we tell a real fix from a
    // hopeful one. Nothing in the app reads this.
    ;(window as any).__csgUpdates = (((window as any).__csgUpdates as number) || 0) + 1
    try {
      operations.current.matrixWorld.identity()
      let root = resolve(ops.shift()!)
      if (root) {
        while (ops.length) {
          const op = resolve(ops.shift()!)
          if (op) root = ev.evaluate(root, op, TYPES[op.operator] ?? ADDITION) as Brush
        }
        // Success: NOW dispose the old and swap the new in - never before.
        dispose(geo.current)
        ;(geo.current as any).boundsTree = (root.geometry as any).boundsTree
        geo.current.index = root.geometry.index
        geo.current.attributes = root.geometry.attributes
        geo.current.groups = root.geometry.groups
        geo.current.drawRange = root.geometry.drawRange
        if (ev.useGroups && (geo.current as any)?.__r3f?.parent?.object?.material)
          (geo.current as any).__r3f.parent.object.material = root.material
        if (computeVertexNormals) geo.current.computeVertexNormals()
      }
    } catch (e) {
      // Keep the previous geometry on screen - a stale opening beats no walls.
      console.warn('[SafeCsg] boolean evaluate failed; keeping previous geometry', e)
    }
  }, [computeVertexNormals, ev])

  const ctx = React.useMemo(() => ({ showOperations }), [showOperations])
  React.useLayoutEffect(() => void update())
  React.useImperativeHandle(fref, () => ({ geometry: geo.current, operations: operations.current, update }), [update])

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
