import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import type { Mode, ModelNode, Project } from './model'
import { makeScene } from './scene'

type Transform = Pick<ModelNode, 'position' | 'rotation' | 'scale'>
type Props = {
  project: Project
  selected: string | null
  mode: Mode
  onSelect: (id: string | null) => void
  onTransform: (id: string, transform: Transform) => void
}

export function Viewport(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props
  const runtime = useRef<{ refresh: () => void; focus: () => void }>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const container = host.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      setError('De 3D-weergave vereist een browser met WebGL 2.')
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.setAttribute('aria-label', 'Interactieve 3D-weergave')
    container.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#151d2a')
    scene.fog = new THREE.FogExp2('#151d2a', 0.035)
    const camera = new THREE.PerspectiveCamera(48, 1, 0.01, 500)
    camera.position.set(4.4, 3.5, 5.6)
    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.target.set(0, 0.45, 0)
    orbit.enableDamping = true
    orbit.update()
    const gizmo = new TransformControls(camera, renderer.domElement)
    gizmo.setSize(0.85)
    scene.add(gizmo.getHelper())
    gizmo.addEventListener('dragging-changed', () => { orbit.enabled = !gizmo.dragging })
    gizmo.addEventListener('mouseUp', () => {
      const object = gizmo.object
      if (!object) return
      latest.current.onTransform(object.userData.editorId, {
        position: object.position.toArray(),
        rotation: [object.rotation.x, object.rotation.y, object.rotation.z].map(
          THREE.MathUtils.radToDeg,
        ) as Transform['rotation'],
        scale: object.scale.toArray(),
      })
    })
    const grid = new THREE.GridHelper(100, 100, '#57677e', '#2d3a4d')
    scene.add(grid, new THREE.HemisphereLight('#dfefff', '#61718b', 2))
    const key = new THREE.DirectionalLight('#fff3df', 2.8)
    key.position.set(4, 8, 5)
    scene.add(key)

    let source: Project | undefined
    let model: ReturnType<typeof makeScene> | undefined
    function refresh() {
      const { project, selected, mode } = latest.current
      if (source !== project) {
        gizmo.detach()
        if (model) {
          scene.remove(model.root)
          model.dispose()
        }
        source = project
        const next = makeScene(project)
        model = next
        setError('')
        next.ready.catch(() => {
          if (model === next) setError('Een textuur kon niet worden geladen.')
        })
        scene.add(model.root)
      }
      gizmo.setMode(mode)
      const object = selected && model?.objects.get(selected)
      if (object) gizmo.attach(object)
      else gizmo.detach()
    }
    function focus() {
      const object = gizmo.object ?? model?.root
      if (!object) return
      const bounds = new THREE.Box3().setFromObject(object)
      const center = bounds.isEmpty() ? object.getWorldPosition(new THREE.Vector3()) :
        bounds.getCenter(new THREE.Vector3())
      const radius = bounds.isEmpty() ? 1 : Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 0.5)
      const direction = camera.position.clone().sub(orbit.target).normalize()
      orbit.target.copy(center)
      camera.position.copy(center).addScaledVector(direction, radius * 3.5)
      orbit.update()
    }
    runtime.current = { refresh, focus }
    refresh()

    const ray = new THREE.Raycaster()
    let down: { x: number; y: number; id: number } | undefined
    function pointerDown(event: PointerEvent) {
      down = event.button === 0 && !gizmo.dragging && !gizmo.axis
        ? { x: event.clientX, y: event.clientY, id: event.pointerId } : undefined
    }
    function pointerUp(event: PointerEvent) {
      const start = down
      down = undefined
      if (!start || event.pointerId !== start.id || gizmo.dragging || !model ||
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return
      const rect = renderer.domElement.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(
        (event.clientX - rect.left) / rect.width * 2 - 1,
        1 - (event.clientY - rect.top) / rect.height * 2,
      ), camera)
      const hit = ray.intersectObject(model.root, true)[0]
      latest.current.onSelect(hit?.object.userData.editorId ?? null)
    }
    renderer.domElement.addEventListener('pointerdown', pointerDown)
    renderer.domElement.addEventListener('pointerup', pointerUp)

    const resize = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = container
      if (!clientWidth || !clientHeight) return
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(clientWidth, clientHeight, false)
    })
    resize.observe(container)
    renderer.setAnimationLoop(() => {
      orbit.update()
      renderer.render(scene, camera)
    })
    return () => {
      runtime.current = null
      resize.disconnect()
      renderer.setAnimationLoop(null)
      renderer.domElement.removeEventListener('pointerdown', pointerDown)
      renderer.domElement.removeEventListener('pointerup', pointerUp)
      gizmo.dispose()
      orbit.dispose()
      grid.dispose()
      model?.dispose()
      model = undefined
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  useEffect(() => { runtime.current?.refresh() }, [props.project, props.selected, props.mode])

  return <div className="viewport" ref={host}>
    <div className="view-label"><span /> PERSPECTIEF</div>
    {error && <p role="status" className="viewport-error">{error}</p>}
    <button className="focus" onClick={() => runtime.current?.focus()}>Centreren</button>
    <div className="view-help">Slepen · draaien &nbsp; / &nbsp; Scrollen · zoomen &nbsp; / &nbsp; Rechtermuisknop · verschuiven</div>
    <div className="axes" aria-hidden="true"><b>X</b><b>Y</b><b>Z</b></div>
  </div>
}
