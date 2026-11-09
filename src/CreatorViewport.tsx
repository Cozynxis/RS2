import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { applyPose, type Asset, type Channel, type Clip } from './creatorModel'
import type { Vector } from './model'

export const cameras = { perspective: 'Perspectief', front: 'Vooraanzicht', side: 'Zijaanzicht', top: 'Bovenaanzicht' } as const
export type CameraView = keyof typeof cameras
type Props = {
  asset: Asset; clip: Clip; frame: number; selected?: string; channel: Channel;
  playing: boolean; grid: boolean; axes: boolean; local: boolean; gizmos: boolean;
  view: CameraView; focus: number; reset: number;
  onTarget: (id: string) => void; onTransform: (value: Vector) => void;
}

export function CreatorViewport(props: Props) {
  const container = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props
  const runtime = useRef<{ sync: () => void; camera: (focus: boolean) => void }>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const host = container.current!
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true }) } catch { setError(true); return }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.domElement.setAttribute('aria-label', 'Animatievoorbeeld in 3D')
    host.prepend(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#191f29')
    scene.add(props.asset.root)
    scene.add(new THREE.HemisphereLight('#e5f1ff', '#778497', 2.5))
    const light = new THREE.DirectionalLight('#fff1df', 2.6)
    light.position.set(3, 7, 5)
    const grid = new THREE.GridHelper(100, 100, '#7486a0', '#47576b')
    const axes = new THREE.AxesHelper(2)
    scene.add(light, grid, axes)
    const perspective = new THREE.PerspectiveCamera(45, 1, 0.005, 10000)
    const ortho = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.005, 10000)
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspective
    let orthoSize = 3
    let orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    const gizmo = new TransformControls(camera, renderer.domElement)
    gizmo.setSize(0.85)
    scene.add(gizmo.getHelper())
    gizmo.addEventListener('dragging-changed', () => { orbit.enabled = !gizmo.dragging })
    gizmo.addEventListener('mouseUp', () => {
      if (!gizmo.object) return
      const { channel, onTransform } = latest.current
      const { position, rotation, scale } = gizmo.object
      const deg = THREE.MathUtils.radToDeg
      onTransform(channel === 'rotation' ? [deg(rotation.x), deg(rotation.y), deg(rotation.z)] :
        channel === 'position' ? position.toArray() : scale.toArray())
    })

    function resize() {
      const { clientWidth: width, clientHeight: height } = host
      if (!width || !height) return
      const aspect = width / height
      perspective.aspect = aspect
      perspective.updateProjectionMatrix()
      ortho.left = -orthoSize * aspect
      ortho.right = orthoSize * aspect
      ortho.top = orthoSize
      ortho.bottom = -orthoSize
      ortho.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    function placeCamera(focus: boolean) {
      const { view, selected, asset } = latest.current
      const object = (focus && asset.targets.find(target => target.id === selected)?.object) || asset.root
      const bounds = new THREE.Box3().setFromObject(object)
      const center = bounds.isEmpty() ? object.getWorldPosition(new THREE.Vector3()) : bounds.getCenter(new THREE.Vector3())
      const radius = bounds.isEmpty() ? 1 : Math.max(0.1, bounds.getSize(new THREE.Vector3()).length() * 0.5)
      orbit.dispose()
      camera = view === 'perspective' ? perspective : ortho
      gizmo.camera = camera
      const direction = view === 'front' ? [0, 0, 1] : view === 'side' ? [1, 0, 0] : view === 'top' ? [0, 1, 0] : [0.85, 0.65, 1]
      camera.position.copy(center).addScaledVector(new THREE.Vector3(...direction).normalize(), radius * 4)
      camera.up.set(0, view === 'top' ? 0 : 1, view === 'top' ? -1 : 0)
      camera.zoom = 1
      orthoSize = radius * 1.4
      orbit = new OrbitControls(camera, renderer.domElement)
      orbit.enableDamping = true
      orbit.enableRotate = view === 'perspective'
      orbit.target.copy(center)
      orbit.update()
      resize()
    }
    function sync() {
      const { asset, clip, frame, selected, channel, playing, grid: showGrid, axes: showAxes, local, gizmos } = latest.current
      grid.visible = showGrid
      axes.visible = showAxes
      if (gizmo.dragging) return
      applyPose(asset, clip, frame)
      const target = asset.targets.find(item => item.id === selected)
      gizmo.setMode(channel === 'position' ? 'translate' : channel === 'rotation' ? 'rotate' : 'scale')
      gizmo.setSpace(local ? 'local' : 'world')
      if (target && !playing && gizmos) gizmo.attach(target.object)
      else gizmo.detach()
    }
    const ray = new THREE.Raycaster()
    let start: { x: number; y: number } | undefined
    const down = (event: PointerEvent) => {
      start = event.button === 0 && !gizmo.dragging && !gizmo.axis ? { x: event.clientX, y: event.clientY } : undefined
    }
    const up = (event: PointerEvent) => {
      const point = start
      start = undefined
      if (!point || gizmo.dragging || Math.hypot(point.x - event.clientX, point.y - event.clientY) > 5) return
      const rect = renderer.domElement.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera)
      const hit = ray.intersectObject(props.asset.root, true).find(item => {
        let object: THREE.Object3D | null = item.object
        while (object) {
          if (!object.visible) return false
          object = object.parent
        }
        return true
      })
      const target = props.asset.targets.find(target => target.object === hit?.object)
      if (target) latest.current.onTarget(target.id)
    }
    renderer.domElement.addEventListener('pointerdown', down)
    renderer.domElement.addEventListener('pointerup', up)
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    runtime.current = { sync, camera: placeCamera }
    sync()
    renderer.setAnimationLoop(() => {
      orbit.update()
      renderer.render(scene, camera)
    })
    return () => {
      runtime.current = null
      observer.disconnect()
      renderer.setAnimationLoop(null)
      renderer.domElement.removeEventListener('pointerdown', down)
      renderer.domElement.removeEventListener('pointerup', up)
      gizmo.dispose()
      orbit.dispose()
      grid.dispose()
      axes.dispose()
      scene.remove(props.asset.root)
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [props.asset])

  useEffect(() => { runtime.current?.sync() }, [
    props.clip, props.frame, props.selected, props.channel, props.playing, props.grid, props.axes, props.local, props.gizmos,
  ])
  useEffect(() => { runtime.current?.camera(false) }, [props.asset, props.view, props.reset])
  useEffect(() => { if (props.focus) runtime.current?.camera(true) }, [props.focus])

  return <div className="creator-viewport" ref={container}>
    <span className="creator-viewport-label">{cameras[props.view]} · {props.frame} f</span>
    {error && <p role="alert">Voor het 3D-voorbeeld is WebGL 2 nodig.</p>}
  </div>
}
