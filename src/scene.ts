import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { strToU8, zipSync } from 'fflate'
import { descendants, isVisible, type Kind, type ModelNode, type Project } from './model'
import { makeClip } from './animation'

const geometries: Record<Exclude<Kind, 'group'>, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(),
  sphere: () => new THREE.SphereGeometry(0.5, 32, 20),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
  cone: () => new THREE.ConeGeometry(0.5, 1, 32),
  plane: () => new THREE.PlaneGeometry(1, 1),
  torus: () => new THREE.TorusGeometry(0.36, 0.14, 16, 48),
  capsule: () => new THREE.CapsuleGeometry(0.3, 0.4, 8, 24),
  tetrahedron: () => new THREE.TetrahedronGeometry(0.55),
  octahedron: () => new THREE.OctahedronGeometry(0.55),
  icosahedron: () => new THREE.IcosahedronGeometry(0.55),
  dodecahedron: () => new THREE.DodecahedronGeometry(0.55),
  disc: () => new THREE.CircleGeometry(0.5, 32),
  wedge: () => {
    const profile = new THREE.Shape()
    profile.moveTo(-0.5, -0.5)
    profile.lineTo(0.5, -0.5)
    profile.lineTo(0.5, 0.5)
    profile.closePath()
    return new THREE.ExtrudeGeometry(profile, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5)
  },
}

export function makeScene(project: Project) {
  const root = new THREE.Group()
  root.name = project.name
  const objects = new Map<string, THREE.Object3D>()
  const textures = new Map<string, THREE.Texture>()
  const loading: Promise<void>[] = []

  function getTexture(url: string, uv?: ModelNode['uv']) {
    const key = uv ? `${url}|${JSON.stringify(uv)}` : url
    const cached = textures.get(key)
    if (cached) return cached
    const texture = new THREE.Texture()
    texture.colorSpace = THREE.SRGBColorSpace
    if (uv) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(uv.repeatU, uv.repeatV)
      texture.offset.set(uv.offsetU, uv.offsetV)
      texture.rotation = THREE.MathUtils.degToRad(uv.rotation)
    }
    textures.set(key, texture)
    loading.push(new THREE.ImageLoader().loadAsync(url).then(image => {
      texture.image = image
      texture.needsUpdate = true
    }))
    return texture
  }

  for (const node of project.nodes) {
    let geometry = node.kind === 'group' ? undefined : geometries[node.kind]()
    if (geometry && node.flat) {
      if (geometry.index) {
        const indexed = geometry
        geometry = indexed.toNonIndexed()
        indexed.dispose()
      }
      geometry.deleteAttribute('normal')
      geometry.computeVertexNormals()
    }
    const object = !geometry ? new THREE.Group() : new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: node.color, roughness: node.roughness, metalness: node.metalness,
        side: (node.doubleSided ?? (node.kind === 'plane' || node.kind === 'disc')) ? THREE.DoubleSide : THREE.FrontSide,
        flatShading: node.flat ?? false,
        opacity: node.opacity ?? 1, transparent: (node.opacity ?? 1) < 1,
        emissive: node.color, emissiveIntensity: node.emission ?? 0,
        map: node.texture ? getTexture(node.texture, node.uv) : null,
      }),
    )
    object.name = node.name
    object.visible = !node.hidden
    object.position.fromArray(node.position)
    object.rotation.set(...node.rotation.map(THREE.MathUtils.degToRad) as ModelNode['rotation'])
    object.scale.fromArray(node.scale)
    object.userData.editorId = node.id
    objects.set(node.id, object)
  }
  for (const node of project.nodes) {
    const parent = (node.parent ? objects.get(node.parent) : undefined) ?? root
    parent.add(objects.get(node.id)!)
  }

  return {
    root, objects, ready: Promise.all(loading),
    dispose() {
      root.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          object.material.dispose()
        }
      })
      textures.forEach(texture => texture.dispose())
    },
  }
}

function download(name: string, bytes: Uint8Array<ArrayBuffer>, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type ExportOptions = {
  format: 'glb' | 'gltf' | 'godot' | 'json'; name: string; selection?: string;
  hidden: boolean; textures: boolean; animations: boolean; metadata: boolean;
  scale: number; origin: 'original' | 'center' | 'ground'; textureSize: number; trs: boolean;
}

export async function exportProject(project: Project, options: ExportOptions) {
  const slug = options.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'rs2-model'
  if (options.format === 'json') {
    download(`${slug}.json`, new Uint8Array(strToU8(JSON.stringify(project, null, 2))), 'application/json')
    return
  }
  const selected = options.selection ? descendants(project.nodes, options.selection) : null
  if (selected) {
    let node = project.nodes.find(node => node.id === options.selection)
    while (node?.parent) {
      selected.add(node.parent)
      node = project.nodes.find(parent => parent.id === node?.parent)
    }
  }
  const nodes = project.nodes.filter(node => (!selected || selected.has(node.id)) &&
    (options.hidden || isVisible(project.nodes, node))).map(node => ({
      ...node, hidden: false, texture: options.textures ? node.texture : undefined,
    }))
  if (!nodes.some(node => node.kind !== 'group')) throw new Error('De gekozen selectie bevat geen exporteerbare vormen.')
  const scene = makeScene({ ...project, nodes })
  try {
    await scene.ready
    const wrapper = new THREE.Group()
    wrapper.name = project.name
    wrapper.add(scene.root)
    if (options.metadata && project.info) wrapper.userData.project = project.info
    scene.root.traverse(object => { delete object.userData.editorId })
    if (options.origin !== 'original') {
      const bounds = new THREE.Box3().setFromObject(scene.root)
      const center = bounds.getCenter(new THREE.Vector3())
      if (options.origin === 'ground') center.y = bounds.min.y
      scene.root.position.sub(center)
    }
    wrapper.scale.setScalar(options.scale)
    const clip = options.animations ? makeClip({ ...project, nodes }, scene.objects) : undefined
    const data = await new GLTFExporter().parseAsync(wrapper, {
      binary: options.format !== 'gltf', animations: clip ? [clip] : [],
      maxTextureSize: options.textureSize, trs: options.trs || !!clip,
    })
    if (options.format === 'gltf') {
      download(`${slug}.gltf`, new Uint8Array(strToU8(JSON.stringify(data, null, 2))), 'model/gltf+json')
      return
    }
    if (!(data instanceof ArrayBuffer)) throw new Error('Geen binair glTF-bestand ontvangen.')
    const glb = new Uint8Array(data)
    if (options.format === 'glb') {
      download(`${slug}.glb`, glb, 'model/gltf-binary')
      return
    }
    const files: Record<string, Uint8Array> = {
      [`assets/models/${slug}.glb`]: glb,
      'assets/textures/': new Uint8Array(),
      'assets/animations/': new Uint8Array(),
      'assets/presets/': new Uint8Array(),
      'IMPORTEREN.txt': strToU8('Pak deze ZIP uit in je Godot 4-project. Open assets/models en sleep het GLB-bestand vanuit het Bestandssysteem naar je scène. Geselecteerde texturen en animatie zitten in het GLB-bestand.'),
    }
    if (options.metadata) files[`assets/presets/${slug}.json`] = strToU8(JSON.stringify(project, null, 2))
    download(`${slug}-godot.zip`, new Uint8Array(zipSync(files)), 'application/zip')
  } finally {
    scene.dispose()
  }
}
