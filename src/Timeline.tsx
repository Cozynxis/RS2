import { useEffect, useState } from 'react'
import { animationDuration, type Keyframe, type ModelNode, type Pose, type Project } from './model'

export function Timeline({ project, selected, onPreview, onKeys, onPose, onInterpolation }: {
  project: Project; selected?: ModelNode; onPreview: (time: number | null) => void;
  onKeys: (id: string, keys: Keyframe[]) => void;
  onPose: (id: string, pose: Pose) => void;
  onInterpolation: (value: Project['interpolation']) => void;
}) {
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [preview, setPreview] = useState(false)
  const duration = animationDuration(project)
  const fps = project.info?.fps ?? 30
  const cursor = Math.min(duration, time)
  const keys = selected?.keys ?? []
  const atCursor = keys.find(key => Math.abs(key.time - cursor) < 0.0001)
  const hasKeys = project.nodes.some(node => node.keys?.length)

  useEffect(() => {
    if (!playing) return
    let previous = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const elapsed = (now - previous) / 1000
      previous = now
      setTime(current => (current + elapsed) % duration)
    }, 1000 / fps)
    return () => window.clearInterval(timer)
  }, [playing, duration, fps])

  useEffect(() => { onPreview(preview ? cursor : null) }, [preview, cursor, onPreview])
  useEffect(() => () => onPreview(null), [onPreview])

  function record() {
    if (!selected) return
    const time = Math.min(duration, Math.round(cursor * fps) / fps)
    const { position, rotation, scale } = selected
    onKeys(selected.id, [...keys.filter(key => Math.abs(key.time - time) >= 0.0001),
      { time, position, rotation, scale }].sort((a, b) => a.time - b.time))
  }
  return <section className="timeline" aria-label="Animatietijdlijn">
    <header><h2>Animatietijdlijn</h2><span>{selected?.name ?? 'Geen object geselecteerd'} · {fps} fps</span></header>
    <div className="timeline-controls">
      <button disabled={!hasKeys} onClick={() => {
        if (!playing) setPreview(true)
        setPlaying(!playing)
      }}>{playing ? '⏸ Pauze' : '▶ Afspelen'}</button>
      <button aria-pressed={preview} disabled={!hasKeys} onClick={() => {
        setPlaying(false)
        setPreview(!preview)
      }}>{preview ? 'Pose bewerken' : 'Voorbeeld tonen'}</button>
      <button disabled={!selected || preview} onClick={record}>◆ Keyframe opnemen</button>
      <button disabled={!selected || !atCursor} onClick={() => {
        if (!selected || !atCursor) return
        const { position, rotation, scale } = atCursor
        setPlaying(false)
        setPreview(false)
        onPose(selected.id, { position, rotation, scale })
      }}>Pose overnemen</button>
      <button disabled={!selected || !atCursor || preview} onClick={() => {
        if (selected) onKeys(selected.id, keys.filter(key => Math.abs(key.time - cursor) >= 0.0001))
      }}>Keyframe verwijderen</button>
      <label>Interpolatie <select value={project.interpolation ?? 'linear'}
        onChange={event => onInterpolation(event.target.value as Project['interpolation'])}>
        <option value="ease">Vloeiend</option><option value="linear">Lineair</option><option value="step">Stapsgewijs</option>
      </select></label>
    </div>
    <div className="timeline-ruler">
      <input aria-label="Tijdpositie" type="range" min={0} max={duration} step="any" value={cursor}
        onChange={event => { setPlaying(false); setTime(Math.min(duration, Math.round(event.target.valueAsNumber * fps) / fps)) }} />
      <output>{cursor.toFixed(2)} / {duration.toFixed(2)} s</output>
    </div>
    <div className="keyframes" aria-label="Keyframes van geselecteerd object">
      {keys.map(key => <button type="button" key={key.time} aria-pressed={Math.abs(key.time - cursor) < 0.0001}
        onClick={() => { setPlaying(false); setTime(key.time) }}>◆ {key.time.toFixed(2)} s</button>)}
      {!keys.length && <span>Verplaats het object en neem de pose op bij een tijdstip.</span>}
    </div>
  </section>
}
