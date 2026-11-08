import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { strToU8, zipSync } from 'fflate'
import { isVisible, type Kind, type ModelNode, type Project } from './model'

const geometries: Record<Exclude<Kind, 'group'>, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(),
  sphere: () => new THREE.SphereGeometry(0.5, 32, 20),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
  cone: () => new THREE.ConeGeometry(0.5, 1, 32),
  plane: () => new THREE.PlaneGeometry(1, 1),
  torus: () => new THREE.TorusGeometry(0.36, 0.14, 16, 48),
  capsule: () => new THREE.CapsuleGeometry(0.3, 0.4, 8, 24),
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

  function getTexture(url: string) {
    const cached = textures.get(url)
    if (cached) return cached
    const texture = new THREE.Texture()
    texture.colorSpace = THREE.SRGBColorSpace
    textures.set(url, texture)
    loading.push(new THREE.ImageLoader().loadAsync(url).then(image => {
      texture.image = image
      texture.needsUpdate = true
    }))
    return texture
  }

  for (const node of project.nodes) {
    const object = node.kind === 'group' ? new THREE.Group() : new THREE.Mesh(
      geometries[node.kind](),
      new THREE.MeshStandardMaterial({
        color: node.color, roughness: node.roughness, metalness: node.metalness,
        side: node.kind === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
        map: node.texture ? getTexture(node.texture) : null,
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

export async function exportProject(project: Project, godot: boolean) {
  const scene = makeScene({ ...project, nodes: project.nodes.filter(node => isVisible(project.nodes, node)) })
  const slug = project.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'rs2-model'
  try {
    await scene.ready
    const data = await new GLTFExporter().parseAsync(scene.root, { binary: true })
    if (!(data instanceof ArrayBuffer)) throw new Error('Geen binair glTF-bestand ontvangen.')
    const glb = new Uint8Array(data)
    if (!godot) {
      download(`${slug}.glb`, glb, 'model/gltf-binary')
      return
    }
    const files: Record<string, Uint8Array> = {
      [`assets/models/${slug}.glb`]: glb,
      'assets/textures/': new Uint8Array(),
      'assets/animations/': new Uint8Array(),
      [`assets/presets/${slug}.json`]: strToU8(JSON.stringify(project, null, 2)),
      'IMPORTEREN.txt': strToU8('Pak deze ZIP uit in je Godot 4-project. Open assets/models en sleep het GLB-bestand vanuit het Bestandssysteem naar je scène. Texturen zitten in het GLB-bestand. De JSON in assets/presets bevat de RS2-editordata.'),
    }
    download(`${slug}-godot.zip`, new Uint8Array(zipSync(files)), 'application/zip')
  } finally {
    scene.dispose()
  }
}
