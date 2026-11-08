import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import type { Mode, ModelNode, Project } from './model'
import { makeScene } from './scene'
import { isVisible } from './model'
import { makeClip } from './animation'

export type ViewOptions = { grid: boolean; snap: boolean; local: boolean; wireframe: boolean }

type Transform = Pick<ModelNode, 'position' | 'rotation' | 'scale'>
type Props = {
  project: Project
  selected: string | null
  mode: Mode
  options: ViewOptions
  previewTime: number | null
  onSelect: (id: string | null) => void
  onTransform: (id: string, transform: Transform) => void
}

export function Viewport(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props
  const runtime = useRef<{ refresh: () => void; focus: () => void; reset: () => void }>(null)
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
    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    function reset() { orbit.reset() }
    camera.position.set(4.4, 3.5, 5.6)
    orbit.target.set(0, 0.45, 0)
    orbit.update()
    orbit.saveState()
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
    const grid = new THREE.GridHelper(100, 100, '#7b8da5', '#485971')
    scene.add(grid, new THREE.HemisphereLight('#dfefff', '#61718b', 2))
    const key = new THREE.DirectionalLight('#fff3df', 2.8)
    key.position.set(4, 8, 5)
    scene.add(key)

    let source: Project | undefined
    let model: ReturnType<typeof makeScene> | undefined
    let mixer: THREE.AnimationMixer | undefined
    let action: THREE.AnimationAction | undefined
    let lastTime: number | null = null
    function refresh() {
      const { project, selected, mode, options } = latest.current
      if (source !== project) {
        gizmo.detach()
        mixer?.stopAllAction()
        mixer = undefined
        action = undefined
        lastTime = null
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
        const clip = makeClip(project, next.objects)
        if (clip) {
          mixer = new THREE.AnimationMixer(next.root)
          action = mixer.clipAction(clip)
          action.setLoop(THREE.LoopOnce, 1)
          action.clampWhenFinished = true
        }
      }
      grid.visible = options.grid
      model?.root.traverse(object => {
        if (object instanceof THREE.Mesh) object.material.wireframe = options.wireframe
      })
      gizmo.setMode(mode)
      gizmo.setSpace(options.local ? 'local' : 'world')
      gizmo.setTranslationSnap(options.snap ? 0.25 : null)
      gizmo.setRotationSnap(options.snap ? Math.PI / 12 : null)
      gizmo.setScaleSnap(options.snap ? 0.25 : null)
      const node = project.nodes.find(node => node.id === selected)
      const object = node && isVisible(project.nodes, node) && model?.objects.get(node.id)
      if (object && latest.current.previewTime === null) gizmo.attach(object)
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
    runtime.current = { refresh, focus, reset }
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
      const { nodes } = latest.current.project
      const hit = ray.intersectObject(model.root, true).find(({ object }) => {
        const node = nodes.find(node => node.id === object.userData.editorId)
        return node && isVisible(nodes, node)
      })
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
      const time = latest.current.previewTime
      if (time !== lastTime) {
        if (time === null) {
          action?.stop()
        } else if (mixer && action) {
          action.enabled = true
          action.paused = false
          action.play()
          mixer.setTime(time)
        }
        lastTime = time
        if (time === null || gizmo.object) refresh()
      }
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

  useEffect(() => { runtime.current?.refresh() }, [props.project, props.selected, props.mode, props.options])

  return <div className="viewport" ref={host}>
    <div className="view-label"><span /> PERSPECTIEF</div>
    {error && <p role="status" className="viewport-error">{error}</p>}
    <div className="focus tools">
      <button onClick={() => runtime.current?.focus()}>Centreren</button>
      <button onClick={() => runtime.current?.reset()}>Camera herstellen</button>
    </div>
    <div className="view-help">Slepen · draaien &nbsp; / &nbsp; Scrollen · zoomen &nbsp; / &nbsp; Rechtermuisknop · verschuiven</div>
    <div className="axes" aria-hidden="true"><b>X</b><b>Y</b><b>Z</b></div>
  </div>
}
