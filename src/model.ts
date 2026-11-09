export const kinds = {
  box: 'Kubus', sphere: 'Bol', cylinder: 'Cilinder', cone: 'Kegel',
  plane: 'Vlak', torus: 'Ring', capsule: 'Capsule', wedge: 'Wig', group: 'Groep',
  tetrahedron: 'Tetraëder', octahedron: 'Octaëder', icosahedron: 'Icosaëder',
  dodecahedron: 'Dodecaëder', disc: 'Schijf',
} as const

export type Kind = keyof typeof kinds
export type Vector = [number, number, number]
export type Mode = 'translate' | 'rotate' | 'scale'
export type Pose = { position: Vector; rotation: Vector; scale: Vector }
export type Keyframe = Pose & { time: number }
export type UV = { repeatU: number; repeatV: number; offsetU: number; offsetV: number; rotation: number }
export const defaultUV: UV = { repeatU: 1, repeatV: 1, offsetU: 0, offsetV: 0, rotation: 0 }
export type ModelNode = {
  id: string
  name: string
  kind: Kind
  parent: string | null
  position: Vector
  rotation: Vector
  scale: Vector
  color: string
  roughness: number
  metalness: number
  texture?: string
  uv?: UV
  locked?: boolean
  hidden?: boolean
  opacity?: number
  emission?: number
  flat?: boolean
  doubleSided?: boolean
  keys?: Keyframe[]
}

export const projectTypes = {
  model: { label: 'Model', description: 'Bouw en textureer een 3D-object.', templates: ['Leeg', 'Kubus'] },
  animation: { label: 'Animatie', description: 'Animeer objecten met keyframes.', templates: ['Leeg', 'Stuiterende bol'] },
  gfx: { label: 'GFX', description: 'Maak een effect van geanimeerde, lichtgevende vormen.', templates: ['Leeg', 'Energiepuls'] },
  level: { label: 'Levelblok', description: 'Maak een bouwstuk voor je level.', templates: ['Leeg', 'Platform met helling'] },
  prefab: { label: 'Prefab', description: 'Bouw een groep die je als één asset kunt exporteren.', templates: ['Leeg', 'Gegroepeerd obstakel'] },
} as const
export type ProjectType = keyof typeof projectTypes
export type ProjectInfo = {
  type: ProjectType; name: string; author: string; notes: string;
  template: number; duration: number; fps: number;
}
export type Project = {
  version: 1; name: string; nodes: ModelNode[];
  info?: Omit<ProjectInfo, 'name' | 'template'>; interpolation?: 'linear' | 'step' | 'ease';
}
export const storageKey = 'rs2-modelengine-v1'

export function createNode(kind: Kind, parent: string | null): ModelNode {
  return {
    id: crypto.randomUUID(), name: kinds[kind], kind, parent,
    position: [0, kind === 'plane' || kind === 'disc' || kind === 'group' ? 0 : 0.5, 0],
    rotation: kind === 'plane' || kind === 'disc' ? [-90, 0, 0] : [0, 0, 0],
    scale: [1, 1, 1], color: '#39cbb7', roughness: 0.55, metalness: 0,
  }
}

export function newProject({ name, template, ...info }: ProjectInfo): Project {
  const project: Project = { version: 1, name, info, nodes: [], interpolation: 'ease' }
  if (!template) return project
  if (info.type === 'model') project.nodes.push(createNode('box', null))
  if (info.type === 'animation' || info.type === 'gfx') {
    const gfx = info.type === 'gfx'
    const node = createNode(gfx ? 'torus' : 'sphere', null)
    if (gfx) Object.assign(node, { name: 'Energiering', color: '#53baff', emission: 2, opacity: 0.8 })
    const pose: Pose = { position: node.position, rotation: node.rotation, scale: node.scale }
    node.keys = [
      { ...pose, time: 0 },
      { ...pose, time: info.duration / 2, position: [0, 2, 0], scale: gfx ? [2.5, 2.5, 2.5] : [1, 1, 1] },
      { ...pose, time: info.duration },
    ]
    project.nodes.push(node)
  }
  if (info.type === 'level') {
    project.nodes.push(
      { ...createNode('box', null), name: 'Platform', scale: [4, 0.4, 3], position: [0, 0.2, 0] },
      { ...createNode('wedge', null), name: 'Helling', scale: [2, 0.4, 3], position: [-3, 0.2, 0] },
    )
  }
  if (info.type === 'prefab') {
    const group = createNode('group', null)
    project.nodes.push(group,
      { ...createNode('box', group.id), name: 'Voet', scale: [2, 0.4, 1], position: [0, 0.2, 0] },
      { ...createNode('cylinder', group.id), name: 'Paal', position: [0, 0.9, 0] },
    )
  }
  return project
}

export function animationDuration(project: Project) {
  return Math.max(project.info?.duration ?? 2, ...project.nodes.flatMap(node => node.keys?.map(key => key.time) ?? []))
}

export function loadProject(): Project {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      const project = JSON.parse(saved)
      if (project.version === 1 && typeof project.name === 'string' && Array.isArray(project.nodes)) {
        return project
      }
    }
  } catch {
    // De editor kan ook draaien wanneer browseropslag is uitgeschakeld.
  }
  return { version: 1, name: 'Mijn model', nodes: [createNode('box', null)] }
}

export function descendants(nodes: ModelNode[], id: string) {
  const ids = new Set([id])
  for (const child of nodes.filter(node => node.parent === id)) {
    for (const descendant of descendants(nodes, child.id)) ids.add(descendant)
  }
  return ids
}

export type ObjectClip = { root: ModelNode; nodes: ModelNode[] }

export function copyObject(project: Project, root: ModelNode): ObjectClip {
  const ids = descendants(project.nodes, root.id)
  return { root, nodes: project.nodes.filter(node => ids.has(node.id)) }
}

export function cloneObject(clip: ObjectClip, parent: string | null, offset: number) {
  const ids = new Map(clip.nodes.map(node => [node.id, crypto.randomUUID()]))
  const id = ids.get(clip.root.id)!
  const nodes = clip.nodes.map((node): ModelNode => {
    const isRoot = node.id === clip.root.id
    const position: Vector = [...node.position]
    if (isRoot) position[0] += offset
    return {
      ...node, id: ids.get(node.id)!, position,
      keys: isRoot ? node.keys?.map(key => ({
        ...key, position: [key.position[0] + offset, key.position[1], key.position[2]],
      })) : node.keys,
      name: isRoot ? `${node.name} kopie` : node.name,
      parent: isRoot ? parent : ids.get(node.parent!)!,
    }
  })
  return { id, nodes }
}

export function isVisible(nodes: ModelNode[], node: ModelNode): boolean {
  if (node.hidden) return false
  const parent = nodes.find(candidate => candidate.id === node.parent)
  return !parent || isVisible(nodes, parent)
}
