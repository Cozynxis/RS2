import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { kinds, type Project, type Vector } from './model'
import { makeScene } from './scene'

export const channels = { position: 'Positie', rotation: 'Rotatie', scale: 'Schaal' } as const
export const easings = { linear: 'Lineair', step: 'Stap', smooth: 'Vloeiend', in: 'Versnellen', out: 'Vertragen' } as const
export type Channel = keyof typeof channels
export type Easing = keyof typeof easings
export type Key = { frame: number; value: Vector }
export type Track = { target: string; channel: Channel; easing: Easing; muted?: boolean; keys: Key[] }
export type Clip = { id: string; name: string; fps: number; frames: number; tracks: Track[] }
export type ModelSource = { name: string; format: 'glb' | 'gltf' | 'rs2'; data: string }
export type CreatorProject = { format: 'rs2-animation'; version: 1; source: ModelSource; name: string; author: string; notes: string; clips: Clip[] }
export type Target = {
  id: string; name: string; depth: number; object: THREE.Object3D; rest: Record<Channel, Vector>;
  quaternion: THREE.Quaternion;
}
export type Asset = { root: THREE.Group; targets: Target[]; dispose: () => void }
export const createClip = (name: string, fps: number, frames: number): Clip => ({ id: crypto.randomUUID(), name, fps, frames, tracks: [] })

const MAX_FILE = 32 * 1024 * 1024
const MAX_TARGETS = 2500
const vector = (v: unknown): v is Vector =>
  Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e6)
const integer = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max

function validateModel(project: Project) {
  if (project?.version !== 1 || typeof project.name !== 'string' || !Array.isArray(project.nodes) ||
      project.nodes.length > MAX_TARGETS) throw new Error('Dit bestand is geen geldig RS2-model.')
  const nodes = new Map(project.nodes.map(node => {
    if (!node || typeof node.id !== 'string' || typeof node.name !== 'string' || !Object.hasOwn(kinds, node.kind) ||
        !vector(node.position) || !vector(node.rotation) || !vector(node.scale) || typeof node.color !== 'string' ||
        !Number.isFinite(node.roughness) || !Number.isFinite(node.metalness) ||
        (node.texture !== undefined && (typeof node.texture !== 'string' || !/^data:image\/(png|jpeg);base64,/.test(node.texture)))) {
      throw new Error('Het RS2-model bevat ongeldige objectgegevens.')
    }
    return [node.id, node] as const
  }))
  if (nodes.size !== project.nodes.length) throw new Error('Het RS2-model bevat dubbele objecten.')
  for (const node of project.nodes) {
    const seen = new Set([node.id])
    let parent = node.parent
    while (parent !== null) {
      const group = nodes.get(parent)
      if (!group || group.kind !== 'group' || seen.has(parent)) throw new Error('De objecthiërarchie is ongeldig.')
      seen.add(parent)
      parent = group.parent
    }
  }
}

function validateCreator(project: CreatorProject) {
  if (project.version !== 1 || typeof project.name !== 'string' || typeof project.author !== 'string' ||
      typeof project.notes !== 'string' || !project.source || typeof project.source.name !== 'string' ||
      typeof project.source.data !== 'string' || !['glb', 'gltf', 'rs2'].includes(project.source.format) ||
      !Array.isArray(project.clips) || !project.clips.length || project.clips.length > 32) {
    throw new Error('Dit RS2-animatieproject is ongeldig.')
  }
  const ids = new Set<string>()
  for (const clip of project.clips) {
    if (!clip || typeof clip.name !== 'string' || typeof clip.id !== 'string' || ids.has(clip.id) ||
        !integer(clip.fps, 1, 120) || !integer(clip.frames, 1, 7200) ||
        !Array.isArray(clip.tracks) || clip.tracks.length > 1000) throw new Error('Een animatieclip is ongeldig.')
    ids.add(clip.id)
    const tracks = new Set<string>()
    for (const track of clip.tracks) {
      if (!track || typeof track.target !== 'string' || !Object.hasOwn(channels, track.channel) ||
          !Object.hasOwn(easings, track.easing) || !Array.isArray(track.keys) || track.keys.length > clip.frames + 1) {
        throw new Error('Een animatietrack is ongeldig.')
      }
      const id = trackId(track)
      if (tracks.has(id)) throw new Error('Een animatieclip bevat dubbele tracks.')
      tracks.add(id)
      let previous = -1
      for (const key of track.keys) {
        if (!key || !integer(key.frame, previous + 1, clip.frames) || !vector(key.value)) throw new Error('Een keyframe is ongeldig.')
        previous = key.frame
      }
    }
  }
}

export async function readCreatorFile(file: File): Promise<{ source: ModelSource; saved?: CreatorProject }> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (file.size > (ext === 'json' ? MAX_FILE * 1.5 : MAX_FILE)) throw new Error('Dit bestand is te groot om te openen.')
  if (ext === 'glb') {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Dit GLB-bestand kon niet worden gelezen.'))
      reader.readAsDataURL(file)
    })
    return { source: { name: file.name, format: 'glb', data } }
  }
  if (ext !== 'gltf' && ext !== 'json') throw new Error('Kies een GLB, ingesloten glTF of RS2-JSON-bestand.')
  const data = await file.text()
  const parsed = JSON.parse(data)
  if (ext === 'gltf') return { source: { name: file.name, format: 'gltf', data } }
  if (parsed?.format === 'rs2-animation') {
    validateCreator(parsed)
    return { source: parsed.source, saved: parsed }
  }
  validateModel(parsed)
  return { source: { name: file.name, format: 'rs2', data } }
}

function disposeScene(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  const geometries = new Set<THREE.BufferGeometry>()
  root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
    }
    if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose()
  })
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    material.dispose()
  }
  for (const texture of textures) texture.dispose()
  for (const geometry of geometries) geometry.dispose()
}

export async function loadAsset(source: ModelSource): Promise<Asset> {
  const root = new THREE.Group()
  root.name = source.name.replace(/\.[^.]+$/, '')
  let original: THREE.Object3D
  let dispose: () => void
  if (source.format === 'rs2') {
    const project: Project = JSON.parse(source.data)
    validateModel(project)
    const scene = makeScene(project)
    try { await scene.ready } catch { scene.dispose(); throw new Error('Een modeltextuur kon niet worden geladen.') }
    original = scene.root
    dispose = scene.dispose
  } else {
    const manager = new THREE.LoadingManager()
    manager.setURLModifier(url => {
      if (!url.startsWith('data:') && !url.startsWith('blob:')) throw new Error('Gebruik een GLB of glTF met ingesloten buffers en texturen.')
      return url
    })
    const input = source.format === 'glb'
      ? Uint8Array.from(atob(source.data.slice(source.data.indexOf(',') + 1)), char => char.charCodeAt(0)).buffer
      : source.data
    if (source.format === 'glb' && !source.data.startsWith('data:')) throw new Error('Het ingesloten GLB-model is ongeldig.')
    let json: string
    if (typeof input === 'string') json = input
    else {
      if (input.byteLength < 20) throw new Error('Het GLB-bestand is te kort.')
      const header = new DataView(input)
      const length = header.getUint32(12, true)
      if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 ||
          header.getUint32(16, true) !== 0x4e4f534a || length > input.byteLength - 20) throw new Error('Kies een geldig glTF 2.0-model.')
      json = new TextDecoder().decode(new Uint8Array(input, 20, length))
    }
    const manifest = JSON.parse(json)
    if ([...(manifest.buffers ?? []), ...(manifest.images ?? [])].some(item =>
      item?.uri !== undefined && (typeof item.uri !== 'string' || !item.uri.startsWith('data:')))) {
      throw new Error('Gebruik een GLB of glTF met ingesloten buffers en texturen.')
    }
    const result = await new GLTFLoader(manager).parseAsync(input, '')
    original = result.scene
    dispose = () => disposeScene(original)
  }
  root.add(original)
  const targets: Target[] = []
  function walk(object: THREE.Object3D, id: string, depth: number) {
    const rotation = new THREE.Euler().setFromQuaternion(object.quaternion, 'XYZ')
    const degrees = THREE.MathUtils.radToDeg
    targets.push({
      id, depth, name: object.name || (object instanceof THREE.Bone ? 'Bot' : `Object ${targets.length + 1}`),
      object, rest: { position: object.position.toArray(), rotation: [degrees(rotation.x), degrees(rotation.y), degrees(rotation.z)], scale: object.scale.toArray() },
      quaternion: object.quaternion.clone(),
    })
    if (depth > 120 || targets.length > MAX_TARGETS) throw new Error('Het model bevat te veel objecten of geneste groepen.')
    for (const [index, child] of object.children.entries()) walk(child, `${id}/${index}`, depth + 1)
    object.rotation.reorder('XYZ')
  }
  try { walk(original, '0', 0) } catch (error) { dispose(); throw error }
  return { root, targets, dispose }
}

export const trackId = (track: Pick<Track, 'target' | 'channel'>) => `${track.target}:${track.channel}`

export function sample(track: Track, frame: number, rest: Vector): Vector {
  const { keys, easing } = track
  if (track.muted || !keys.length) return rest
  let low = 0
  let high = keys.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (keys[mid].frame <= frame) low = mid + 1
    else high = mid
  }
  if (low === 0) return keys[0].value
  const previous = keys[low - 1]
  const next = keys[low]
  if (!next || easing === 'step') return previous.value
  const t = (frame - previous.frame) / (next.frame - previous.frame)
  const weight = easing === 'smooth' ? t * t * (3 - 2 * t) : easing === 'in' ? t * t : easing === 'out' ? 1 - (1 - t) ** 2 : t
  return previous.value.map((n, i) => THREE.MathUtils.lerp(n, next.value[i], weight)) as Vector
}

export function keyAt(track: Track, frame: number, value: Vector) {
  return { ...track, keys: [...track.keys.filter(key => key.frame !== frame), { frame, value }].sort((a, b) => a.frame - b.frame) }
}

export function restorePose(asset: Asset) {
  for (const { object, rest, quaternion } of asset.targets) {
    object.position.fromArray(rest.position)
    object.quaternion.copy(quaternion)
    object.scale.fromArray(rest.scale)
  }
}

const radians = THREE.MathUtils.degToRad
export function applyPose(asset: Asset, clip: Clip, frame: number) {
  restorePose(asset)
  const targets = new Map(asset.targets.map(target => [target.id, target]))
  for (const track of clip.tracks) {
    const target = targets.get(track.target)
    if (!target || track.muted || !track.keys.length) continue
    const [x, y, z] = sample(track, frame, target.rest[track.channel])
    if (track.channel === 'rotation') target.object.rotation.set(radians(x), radians(y), radians(z), 'XYZ')
    else target.object[track.channel].set(x, y, z)
  }
}

function exportClip(clip: Clip, asset: Asset) {
  const targets = new Map(asset.targets.map(target => [target.id, target]))
  const tracks: THREE.KeyframeTrack[] = []
  for (const track of clip.tracks) {
    const target = targets.get(track.target)
    if (!target || !track.keys.length || track.muted) continue
    const sparse = track.easing === 'step' || (track.easing === 'linear' && track.channel !== 'rotation')
    const frames = sparse ? [...new Set([0, ...track.keys.map(key => key.frame), clip.frames])] :
      Array.from({ length: clip.frames + 1 }, (_, index) => index)
    const times = frames.map(frame => frame / clip.fps)
    const values = frames.map(frame => sample(track, frame, target.rest[track.channel]))
    const interpolation = track.easing === 'step' ? THREE.InterpolateDiscrete : THREE.InterpolateLinear
    const binding = target.object.uuid
    if (track.channel === 'rotation') {
      const rotation = new THREE.Euler()
      const q = new THREE.Quaternion()
      let last: THREE.Quaternion | undefined
      const quaternions = values.flatMap(([x, y, z]) => {
        q.setFromEuler(rotation.set(radians(x), radians(y), radians(z)))
        if (last && last.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w)
        last = q.clone()
        return q.toArray()
      })
      tracks.push(new THREE.QuaternionKeyframeTrack(`${binding}.quaternion`, times, quaternions, interpolation))
    } else {
      tracks.push(new THREE.VectorKeyframeTrack(`${binding}.${track.channel}`, times, values.flat(), interpolation))
    }
  }
  return tracks.length ? new THREE.AnimationClip(clip.name, clip.frames / clip.fps, tracks) : undefined
}

export function downloadFile(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const safeName = (name: string) => name.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'rs2-animatie'

export async function exportAnimation(project: CreatorProject, clips: Clip[], format: 'glb' | 'gltf') {
  const asset = await loadAsset(project.source)
  try {
    const animations = clips.map(clip => exportClip(clip, asset)).filter(clip => clip !== undefined)
    if (!animations.length) throw new Error('Voeg eerst keyframes toe aan een actieve track.')
    asset.root.userData.project = { name: project.name, author: project.author, notes: project.notes }
    const data = await new GLTFExporter().parseAsync(asset.root, { binary: format === 'glb', animations, onlyVisible: false })
    if (data instanceof ArrayBuffer) downloadFile(`${safeName(project.name)}.glb`, data, 'model/gltf-binary')
    else downloadFile(`${safeName(project.name)}.gltf`, JSON.stringify(data), 'model/gltf+json')
  } finally {
    asset.dispose()
  }
}
