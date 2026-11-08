export const kinds = {
  box: 'Kubus', sphere: 'Bol', cylinder: 'Cilinder', cone: 'Kegel',
  plane: 'Vlak', torus: 'Ring', group: 'Groep',
} as const

export type Kind = keyof typeof kinds
export type Vector = [number, number, number]
export type Mode = 'translate' | 'rotate' | 'scale'
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
}

export type Project = { version: 1; name: string; nodes: ModelNode[] }
export const storageKey = 'rs2-modelengine-v1'

export function createNode(kind: Kind, parent: string | null): ModelNode {
  return {
    id: crypto.randomUUID(), name: kinds[kind], kind, parent,
    position: [0, kind === 'plane' || kind === 'group' ? 0 : 0.5, 0],
    rotation: kind === 'plane' ? [-90, 0, 0] : [0, 0, 0],
    scale: [1, 1, 1], color: '#39cbb7', roughness: 0.55, metalness: 0,
  }
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
