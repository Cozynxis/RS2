import * as THREE from 'three'
import type { Pose, Project } from './model'

const radians = THREE.MathUtils.degToRad

function quaternion(pose: Pose) {
  const [x, y, z] = pose.rotation
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(radians(x), radians(y), radians(z)))
}

export function makeClip(project: Project, objects: Map<string, THREE.Object3D>) {
  const tracks: THREE.KeyframeTrack[] = []
  for (const node of project.nodes) {
    const object = objects.get(node.id)
    const keys = node.keys
    if (!object || !keys?.length) continue
    const times: number[] = []
    const positions: number[] = []
    const rotations: number[] = []
    const scales: number[] = []
    const first = keys[0]
    times.push(first.time)
    positions.push(...first.position)
    rotations.push(...quaternion(first).toArray())
    scales.push(...first.scale)
    for (let index = 1; index < keys.length; index++) {
      const a = keys[index - 1]
      const b = keys[index]
      const startRotation = quaternion(a)
      const endRotation = quaternion(b)
      const steps = project.interpolation === 'ease'
        ? Math.max(1, Math.ceil((b.time - a.time) * (project.info?.fps ?? 30))) : 1
      for (let step = 1; step <= steps; step++) {
        const fraction = step / steps
        const weight = fraction * fraction * (3 - 2 * fraction)
        times.push(step === steps ? b.time : THREE.MathUtils.lerp(a.time, b.time, fraction))
        positions.push(...a.position.map((value, axis) => THREE.MathUtils.lerp(value, b.position[axis], weight)))
        scales.push(...a.scale.map((value, axis) => THREE.MathUtils.lerp(value, b.scale[axis], weight)))
        rotations.push(...startRotation.clone().slerp(endRotation, weight).toArray())
      }
    }
    const interpolation = project.interpolation === 'step' ? THREE.InterpolateDiscrete : THREE.InterpolateLinear
    tracks.push(
      new THREE.VectorKeyframeTrack(`${object.uuid}.position`, times, positions, interpolation),
      new THREE.QuaternionKeyframeTrack(`${object.uuid}.quaternion`, times, rotations, interpolation),
      new THREE.VectorKeyframeTrack(`${object.uuid}.scale`, times, scales, interpolation),
    )
  }
  return tracks.length ? new THREE.AnimationClip(`${project.name} · Animatie`, -1, tracks) : undefined
}
