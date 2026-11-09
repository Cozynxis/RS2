import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CreatorSetup } from './CreatorSetup'
import { CreatorTimeline } from './CreatorTimeline'
import { CreatorViewport, cameras, type CameraView } from './CreatorViewport'
import {
  channels, createClip, downloadFile, easings, exportAnimation, keyAt, safeName, sample, trackId,
  type Asset, type Channel, type Clip, type CreatorProject, type Key, type Track,
} from './creatorModel'
import type { Vector } from './model'
import './creator.css'

type History = { past: CreatorProject[]; current: CreatorProject; future: CreatorProject[] }
const channelList = Object.keys(channels) as Channel[]
const axisNames = ['X', 'Y', 'Z']

function CommitField({ label, value, onCommit, min, max, step }: {
  label: string; value: string | number; onCommit: (value: string) => void;
  min?: number; max?: number; step?: number | 'any';
}) {
  return <label>{label}<input key={value} defaultValue={value} type={typeof value === 'number' ? 'number' : 'text'}
    {...{ min, max, step }} required maxLength={80} onKeyDown={event => {
      if (event.key === 'Enter') event.currentTarget.blur()
      if (event.key === 'Escape') { event.currentTarget.value = String(value); event.currentTarget.blur() }
    }} onBlur={event => {
      const input = event.currentTarget
      if (input.validity.valid && input.value.trim() && input.value !== String(value)) onCommit(input.value.trim())
      else input.value = String(value)
    }} /></label>
}

function CreatorMenu({ title, children }: { title: string; children: ReactNode }) {
  return <details className="studio-menu" name="creator-menu" onClick={event => {
    if ((event.target as HTMLElement).closest('button')) event.currentTarget.open = false
  }}><summary>{title}</summary><div className="menu-items">{children}</div></details>
}

function Workspace({ initial, asset, onExit }: { initial: CreatorProject; asset: Asset; onExit: () => void }) {
  const [history, setHistory] = useState<History>({ past: [], current: initial, future: [] })
  const project = history.current
  const [clipId, setClipId] = useState(project.clips[0].id)
  const clip = project.clips.find(item => item.id === clipId) ?? project.clips[0]
  const [targetId, setTargetId] = useState(asset.targets[1]?.id ?? asset.targets[0]?.id)
  const [channel, setChannel] = useState<Channel>('position')
  const [playhead, setPlayhead] = useState(0)
  const frame = Math.min(clip.frames, Math.round(playhead))
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [pingPong, setPingPong] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [search, setSearch] = useState('')
  const [clipboard, setClipboard] = useState<{ channel: Channel; value: Vector }>()
  const [solo, setSolo] = useState(false)
  const [grid, setGrid] = useState(true)
  const [axes, setAxes] = useState(true)
  const [local, setLocal] = useState(false)
  const [gizmos, setGizmos] = useState(true)
  const [view, setView] = useState<CameraView>('perspective')
  const [focus, setFocus] = useState(0)
  const [reset, setReset] = useState(0)
  const [saved, setSaved] = useState<CreatorProject>()
  const [status, setStatus] = useState('Selecteer een object en neem een keyframe op.')
  const [exporting, setExporting] = useState(false)
  const [exit, setExit] = useState(false)
  const target = asset.targets.find(item => item.id === targetId)
  const track = clip.tracks.find(item => item.target === targetId && item.channel === channel)
  const key = track?.keys.find(item => item.frame === frame)
  const current = target && (track ? sample(track, frame, target.rest[channel]) : target.rest[channel])
  const preview = useMemo(() => solo ? { ...clip, tracks: track ? [track] : [] } : clip, [clip, solo, track])
  const targetNames = useMemo(() => new Map(asset.targets.map(item => [item.id, item.name])), [asset])
  const previous = track?.keys.filter(item => item.frame < frame).at(-1)
  const next = track?.keys.find(item => item.frame > frame)

  function edit(change: (current: CreatorProject) => CreatorProject) {
    setHistory(state => {
      const next = change(state.current)
      if (next === state.current) return state
      return { past: [...state.past.slice(-59), state.current], current: next, future: [] }
    })
  }
  function undo(redo = false) {
    setPlaying(false)
    setHistory(state => {
      const { past, current, future } = state
      if (redo && future.length) return { past: [...past, current], current: future[0], future: future.slice(1) }
      if (!redo && past.length) return { past: past.slice(0, -1), current: past[past.length - 1], future: [current, ...future] }
      return state
    })
  }
  function updateClip(change: (item: Clip) => Clip) {
    edit(state => ({ ...state, clips: state.clips.map(item => item.id === clip.id ? change(item) : item) }))
  }
  function updateTrack(change: (item: Track) => Track) {
    if (!track) return
    const id = trackId(track)
    updateClip(item => ({ ...item, tracks: item.tracks.map(row => trackId(row) === id ? change(row) : row) }))
  }
  function put(values: Partial<Record<Channel, Vector>>, at = frame) {
    if (!target) return
    const id = target.id
    const missing = channelList.filter(ch => values[ch] && !clip.tracks.some(row => row.target === id && row.channel === ch))
    if (clip.tracks.length + missing.length > 1000) { setStatus('Deze clip kan maximaal 1000 tracks bevatten.'); return }
    setPlaying(false)
    updateClip(item => {
      const tracks = [...item.tracks]
      for (const ch of channelList) {
        const value = values[ch]
        if (!value) continue
        const index = tracks.findIndex(row => row.target === id && row.channel === ch)
        if (index === -1) tracks.push(keyAt({ target: id, channel: ch, easing: 'linear', keys: [] }, at, value))
        else tracks[index] = keyAt(tracks[index], at, value)
      }
      return { ...item, tracks }
    })
  }
  function recordAll() {
    if (!target) return
    const values = { ...target.rest }
    for (const row of clip.tracks) {
      if (row.target === target.id) values[row.channel] = sample(row, frame, target.rest[row.channel])
    }
    put(values)
  }
  function seek(value: number) {
    setPlaying(false)
    setPlayhead(Math.max(0, Math.min(clip.frames, Math.round(value))))
  }
  function togglePlay() {
    if (!playing && frame >= clip.frames) setPlayhead(0)
    setPlaying(!playing)
  }
  function selectClip(id: string) {
    seek(0)
    setClipId(id)
  }
  function addClip(duplicate = false) {
    if (project.clips.length >= 32) return
    const added = createClip(duplicate ? `${clip.name} kopie` : `Animatie ${project.clips.length + 1}`, clip.fps, clip.frames)
    if (duplicate) added.tracks = clip.tracks
    edit(state => ({ ...state, clips: [...state.clips, added] }))
    selectClip(added.id)
  }
  function removeClip() {
    if (project.clips.length < 2) return
    const clips = project.clips.filter(item => item.id !== clip.id)
    edit(state => ({ ...state, clips }))
    selectClip(clips[0].id)
  }
  function copyKey() {
    if (key) { setClipboard({ channel, value: key.value }); setStatus('Keyframe gekopieerd.') }
  }
  function pasteKey() {
    if (clipboard?.channel === channel) put({ [channel]: clipboard.value })
  }
  function deleteKey() {
    if (key) updateTrack(row => ({ ...row, keys: row.keys.filter(item => item.frame !== frame) }))
  }
  function shiftKey(offset: number) {
    if (!track || !key || frame + offset < 0 || frame + offset > clip.frames ||
        track.keys.some(item => item.frame === frame + offset)) return
    updateTrack(row => keyAt({ ...row, keys: row.keys.filter(item => item.frame !== frame) }, frame + offset, key.value))
    seek(frame + offset)
  }
  function reverseTrack() {
    updateTrack(row => ({ ...row, keys: row.keys.map(item => ({ ...item, frame: clip.frames - item.frame })).reverse() }))
  }
  function moveTimelineKey(row: Track, from: number, to: number) {
    if (from === to) { seek(to); return }
    const key = row.keys.find(item => item.frame === from)
    if (!key || row.keys.some(item => item.frame === to)) {
      setStatus('Op dat frame staat al een keyframe voor deze track.')
      return
    }
    updateClip(item => ({ ...item, tracks: item.tracks.map(track =>
      trackId(track) === trackId(row) ? keyAt({ ...track, keys: track.keys.filter(key => key.frame !== from) }, to, key.value) : track,
    ) }))
    seek(to)
  }
  function save() {
    downloadFile(`${safeName(project.name)}.rs2-animation.json`, JSON.stringify(project), 'application/json')
    setSaved(project)
    setStatus('Bewerkbaar animatieproject gedownload.')
  }
  async function exportFile(format: 'glb' | 'gltf', all: boolean) {
    setExporting(true)
    setPlaying(false)
    try {
      await exportAnimation(project, all ? project.clips : [clip], format)
      setStatus('Geanimeerd model gedownload.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Exporteren is mislukt.')
    } finally { setExporting(false) }
  }
  function selectTrack(row: Track) {
    setTargetId(row.target)
    setChannel(row.channel)
  }
  function resizeClip(end: number, trim = false) {
    const last = Math.max(0, ...clip.tracks.map(row => row.keys.at(-1)?.frame ?? 0))
    if (!trim && end < last) { setStatus(`Laatste keyframe staat op frame ${last}. Gebruik Bijsnijden om latere keys te verwijderen.`); return }
    setStatus(`Eindframe: ${end}.`)
    updateClip(item => ({ ...item, frames: end, tracks: trim ? item.tracks.map(row => ({
      ...row, keys: row.keys.filter(key => key.frame <= end),
    })) : item.tracks }))
    seek(Math.min(frame, end))
  }

  useEffect(() => () => asset.dispose(), [asset])
  useEffect(() => {
    if (!playing) return
    let handle: number
    let last = performance.now()
    let position = frame
    function tick(now: number) {
      position += (now - last) * clip.fps * speed / 1000
      last = now
      if (position >= clip.frames) {
        if (!loop) {
          setPlayhead(clip.frames)
          setPlaying(false)
          return
        }
        position %= pingPong ? clip.frames * 2 : clip.frames
      }
      setPlayhead(loop && pingPong && position > clip.frames ? clip.frames * 2 - position : position)
      handle = requestAnimationFrame(tick)
    }
    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
    // Reopening the playback clock is only needed for transport settings.
  }, [playing, clip.id, clip.fps, clip.frames, speed, loop, pingPong])

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (exit || event.isComposing || event.defaultPrevented || event.getModifierState('AltGraph')) return
      const inField = event.target instanceof HTMLElement && event.target.closest('input,select,textarea,[contenteditable]')
      const k = event.key.toLowerCase()
      if (inField) return
      const commands: Record<string, () => void> = event.ctrlKey || event.metaKey ? {
        z: () => undo(event.shiftKey), y: () => undo(true), s: save, c: copyKey, v: pasteKey,
      } : {
        ' ': togglePlay, arrowleft: () => seek(frame - (event.shiftKey ? 10 : 1)),
        arrowright: () => seek(frame + (event.shiftKey ? 10 : 1)), home: () => seek(0), end: () => seek(clip.frames),
        delete: deleteKey, k: () => { if (current) put({ [channel]: current }) },
        f: () => setFocus(n => n + 1), g: () => setChannel('position'), r: () => setChannel('rotation'), s: () => setChannel('scale'),
      }
      if (!event.altKey && Object.hasOwn(commands, k)) {
        if (k === ' ' && event.target instanceof HTMLElement && event.target.closest('button,summary')) return
        event.preventDefault()
        if (!event.repeat || k.startsWith('arrow')) commands[k]()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  })

  const canAddClip = project.clips.length < 32
  const targetMatches = asset.targets.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()))
  const name = (row: Track) => targetNames.get(row.target) ?? row.target
  return <div className="creator-shell">
    <header className="top creator-top">
      <div className="brand"><div aria-hidden="true">▶</div><strong>Animation Creator</strong></div>
      <nav className="menu-bar" aria-label="Animatiemenu">
        <CreatorMenu title="Bestand">
          <button onClick={() => project === saved || project === initial ? onExit() : setExit(true)}>Startscherm</button>
          <button onClick={save}>Projectbestand bewaren <kbd>Ctrl+S</kbd></button>
          <button disabled={exporting} onClick={() => void exportFile('glb', false)}>Actieve clip als GLB</button>
          <button disabled={exporting} onClick={() => void exportFile('glb', true)}>Alle clips als GLB</button>
          <button disabled={exporting} onClick={() => void exportFile('gltf', false)}>Actieve clip als glTF</button>
          <button disabled={exporting} onClick={() => void exportFile('gltf', true)}>Alle clips als glTF</button>
        </CreatorMenu>
        <CreatorMenu title="Bewerken">
          <button disabled={!history.past.length} onClick={() => undo()}>Ongedaan maken <kbd>Ctrl+Z</kbd></button>
          <button disabled={!history.future.length} onClick={() => undo(true)}>Opnieuw uitvoeren <kbd>Ctrl+Y</kbd></button>
          <button disabled={!key} onClick={copyKey}>Keyframe kopiëren <kbd>Ctrl+C</kbd></button>
          <button disabled={!key} onClick={() => { copyKey(); deleteKey() }}>Keyframe knippen</button>
          <button disabled={!target || clipboard?.channel !== channel} onClick={pasteKey}>Keyframe plakken <kbd>Ctrl+V</kbd></button>
          <button disabled={!key} onClick={deleteKey}>Keyframe verwijderen <kbd>Del</kbd></button>
        </CreatorMenu>
      </nav>
      <div className="actions"><button onClick={save}>Projectbestand bewaren</button>
        <button className="primary" disabled={exporting} onClick={() => void exportFile('glb', true)}>
          {exporting ? 'Exporteren…' : 'GLB downloaden'}
        </button></div>
    </header>
    <div className="creator-project-strip">
      <strong>{project.name}</strong><span>{project.source.name}</span>
      {project.author && <span>Door {project.author}</span>}
      {project.notes && <details><summary>Notities</summary><p>{project.notes}</p></details>}
    </div>
    <main className="creator-workspace">
      <aside className="sidebar creator-assets">
        <section><h2>Clips</h2>
          <label>Actieve clip<select value={clip.id} onChange={event => selectClip(event.target.value)}>
            {project.clips.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <div className="creator-controls"><button disabled={!canAddClip} onClick={() => addClip()}>Nieuwe clip</button>
            <button disabled={!canAddClip} onClick={() => addClip(true)}>Dupliceren</button>
            <button disabled={project.clips.length < 2} onClick={removeClip}>Clip verwijderen</button></div>
          <div className="fields">
            <CommitField label="Clipnaam" value={clip.name} onCommit={name => updateClip(item => ({ ...item, name }))} />
            <CommitField label="Beeldsnelheid (fps)" value={clip.fps} min={1} max={120} onCommit={fps => updateClip(item => ({ ...item, fps: Number(fps) }))} />
            <CommitField label="Eindframe" value={clip.frames} min={1} max={7200} onCommit={end => resizeClip(Number(end))} />
            <button disabled={frame < 1 || frame >= clip.frames} onClick={() => resizeClip(frame, true)}>Bijsnijden op afspeelkop</button>
          </div>
        </section>
        <section><h2>Modelhiërarchie</h2>
          <label>Object zoeken<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <ul className="creator-targets">{targetMatches.map(item =>
            <li key={item.id}><button aria-pressed={item.id === targetId}
              style={{ paddingInlineStart: `${6 + Math.min(10, item.depth) * 8}px` }}
              onClick={() => setTargetId(item.id)} onDoubleClick={() => setFocus(n => n + 1)}>{item.name}</button></li>,
          )}</ul>
          {!targetMatches.length && <p>Geen objecten gevonden.</p>}
        </section>
      </aside>
      <section className="creator-stage" aria-label="Animatiewerkgebied">
        <div className="creator-controls creator-view-controls">
          <label>Camera<select value={view} onChange={event => setView(event.target.value as CameraView)}>
            {(Object.keys(cameras) as CameraView[]).map(item => <option key={item} value={item}>{cameras[item]}</option>)}
          </select></label>
          <button aria-pressed={grid} onClick={() => setGrid(!grid)}>Raster</button>
          <button aria-pressed={axes} onClick={() => setAxes(!axes)}>Assen</button>
          <button aria-pressed={local} onClick={() => setLocal(!local)}>Lokale assen</button>
          <button aria-pressed={gizmos} onClick={() => setGizmos(!gizmos)}>Gizmo</button>
          <button disabled={!target} onClick={() => setFocus(n => n + 1)}>Object centreren</button>
          <button onClick={() => setReset(n => n + 1)}>Camera herstellen</button>
        </div>
        <CreatorViewport {...{ asset, clip: preview, frame: playing ? playhead : frame, selected: targetId, channel, playing, grid, axes, local, gizmos, view, focus, reset }}
          onTarget={setTargetId} onTransform={value => put({ [channel]: value })} />
        <div className="creator-controls creator-transport" aria-label="Afspelen">
          <button onClick={() => seek(0)}>⏮ Begin</button>
          <button disabled={frame === 0} onClick={() => seek(frame - 1)}>−1 f</button>
          <button className="primary" onClick={togglePlay}>{playing ? '⏸ Pauze' : '▶ Afspelen'}</button>
          <button onClick={() => seek(0)}>■ Stop</button>
          <button disabled={frame === clip.frames} onClick={() => seek(frame + 1)}>+1 f</button>
          <button onClick={() => seek(clip.frames)}>Einde ⏭</button>
          <button aria-pressed={loop} onClick={() => setLoop(!loop)}>Herhalen</button>
          <button disabled={!loop} aria-pressed={pingPong} onClick={() => setPingPong(!pingPong)}>Heen en terug</button>
          <label>Snelheid<select value={speed} onChange={event => setSpeed(Number(event.target.value))}>
            {[0.25, 0.5, 1, 1.5, 2].map(value => <option key={value} value={value}>{value}×</option>)}
          </select></label>
        </div>
        <div className="creator-controls creator-seek">
          <CommitField label="Frame" value={frame} min={0} max={clip.frames} onCommit={value => seek(Number(value))} />
          <input aria-label="Afspeelkop" type="range" min={0} max={clip.frames} value={frame} onChange={event => seek(Number(event.target.value))} />
          <output>{(frame / clip.fps).toFixed(2)} / {(clip.frames / clip.fps).toFixed(2)} s</output>
          <label>Tijdlijnzoom<select value={zoom} onChange={event => setZoom(Number(event.target.value))}>
            {[1, 2, 4, 8].map(value => <option key={value} value={value}>{value}×</option>)}
          </select></label>
        </div>
        <CreatorTimeline clip={clip} frame={frame} zoom={zoom} selected={track && trackId(track)} label={name}
          onFrame={seek} onSelect={selectTrack} onMove={moveTimelineKey} />
      </section>
      <aside className="sidebar creator-properties">
        <section><h2>Transformtracks</h2><p>{target?.name ?? 'Kies een object'}</p>
          <div className="creator-controls">{channelList.map(item =>
            <button key={item} aria-pressed={channel === item} onClick={() => setChannel(item)}>{channels[item]}</button>,
          )}</div>
          {target && current && <>
            <div className="vector">{current.map((value, axis) => <CommitField key={axis} label={axisNames[axis]}
              value={Number(value.toFixed(5))} min={-1000000} max={1000000} step="any" onCommit={next => {
                const vector: Vector = [...current]
                vector[axis] = Number(next)
                put({ [channel]: vector })
              }} />)}</div>
            <div className="creator-controls">
              <button onClick={() => put({ [channel]: current })}>◆ {key ? 'Keyframe vervangen' : 'Keyframe opnemen'}</button>
              <button onClick={recordAll}>Alle transformaties opnemen</button>
              <button onClick={() => put({ [channel]: target.rest[channel] })}>Rustpose opnemen</button>
            </div>
          </>}
        </section>
        <section><h2>Trackopties</h2>
          {track ? <>
            <label>Interpolatie<select value={track.easing} onChange={event => updateTrack(row => ({
              ...row, easing: event.target.value as Track['easing'],
            }))}>{(Object.keys(easings) as Track['easing'][]).map(value => <option key={value} value={value}>{easings[value]}</option>)}</select></label>
            <div className="creator-controls">
              <button aria-pressed={!!track.muted} onClick={() => updateTrack(row => ({ ...row, muted: !row.muted }))}>Track dempen</button>
              <button aria-pressed={solo} onClick={() => setSolo(!solo)}>Solo in voorbeeld</button>
              <button disabled={track.keys.length === 0} onClick={reverseTrack}>Track omkeren</button>
              <button className="danger" onClick={() => updateClip(item => ({ ...item, tracks: item.tracks.filter(row => trackId(row) !== trackId(track)) }))}>Track verwijderen</button>
            </div>
          </> : <p>Neem een keyframe op voor trackopties.</p>}
        </section>
        <section><h2>Keyframes</h2>
          <div className="creator-controls">
            <button disabled={!previous} onClick={() => previous && seek(previous.frame)}>Vorige key</button>
            <button disabled={!next} onClick={() => next && seek(next.frame)}>Volgende key</button>
            <button disabled={!key} onClick={copyKey}>Kopiëren</button>
            <button disabled={!key} onClick={() => { copyKey(); deleteKey() }}>Knippen</button>
            <button disabled={!target || clipboard?.channel !== channel} onClick={pasteKey}>Plakken</button>
            <button disabled={!key || frame >= clip.frames || track?.keys.some(item => item.frame === frame + 1)}
              onClick={() => { if (key) { put({ [channel]: key.value }, frame + 1); seek(frame + 1) } }}>Dupliceren naar +1 f</button>
            <button disabled={!key || frame <= 0 || track?.keys.some(item => item.frame === frame - 1)} onClick={() => shiftKey(-1)}>Key −1 f</button>
            <button disabled={!key || frame >= clip.frames || track?.keys.some(item => item.frame === frame + 1)} onClick={() => shiftKey(1)}>Key +1 f</button>
            <button disabled={!key} className="danger" onClick={deleteKey}>Key verwijderen</button>
          </div>
        </section>
      </aside>
    </main>
    <footer><span role="status">{status}</span><span>{clip.tracks.reduce((total, row) => total + row.keys.length, 0)} keyframes</span></footer>
    {exit && <div className="creator-overlay" role="alertdialog" aria-modal="true" aria-label="Animatieproject sluiten">
      <section><h2>Animatieproject sluiten?</h2><p>Je hebt wijzigingen gemaakt sinds je laatste download.</p>
        <div className="creator-controls"><button autoFocus onClick={() => setExit(false)}>Verder werken</button>
          <button onClick={onExit}>Sluiten</button>
          <button className="primary" onClick={() => { save(); onExit() }}>Bewaren en sluiten</button></div>
      </section>
    </div>}
  </div>
}

export default function AnimationCreator({ onExit }: { onExit: () => void }) {
  const [session, setSession] = useState<{ project: CreatorProject; asset: Asset }>()
  return session ? <Workspace initial={session.project} asset={session.asset} onExit={onExit} /> :
    <CreatorSetup onExit={onExit} onOpen={(project, asset) => setSession({ project, asset })} />
}
