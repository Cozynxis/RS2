import { useRef, useState, type PointerEvent } from 'react'
import { channels, trackId, type Clip, type Track } from './creatorModel'

function KeyMarker({ frame, end, label, active, onMove }: {
  frame: number; end: number; label: string; active: boolean; onMove: (frame: number) => void;
}) {
  const [draft, setDraft] = useState<number>()
  const drag = useRef<{ x: number; width: number } | undefined>(undefined)
  function position(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current!
    return Math.min(end, Math.max(0, frame + Math.round((event.clientX - start.x) / start.width * end)))
  }
  return <button className="creator-key" aria-label={label} aria-pressed={active} title={`Frame ${draft ?? frame}`}
    style={{ left: `${(draft ?? frame) / end * 100}%` }} onPointerDown={event => {
      if (event.button !== 0) return
      event.stopPropagation()
      const width = event.currentTarget.parentElement?.clientWidth ?? 0
      if (!width) return
      drag.current = { x: event.clientX, width }
      event.currentTarget.setPointerCapture(event.pointerId)
    }} onPointerMove={event => { if (drag.current) setDraft(position(event)) }}
    onPointerUp={event => {
      if (!drag.current) return
      const next = position(event)
      drag.current = undefined
      setDraft(undefined)
      onMove(next)
    }} onLostPointerCapture={() => { drag.current = undefined; setDraft(undefined) }}
    onClick={event => { if (event.detail === 0) onMove(frame) }}>◆</button>
}

export function CreatorTimeline({ clip, frame, zoom, selected, label, onFrame, onSelect, onMove }: {
  clip: Clip; frame: number; zoom: number; selected?: string; label: (track: Track) => string;
  onFrame: (frame: number) => void; onSelect: (track: Track) => void;
  onMove: (track: Track, from: number, to: number) => void;
}) {
  const tick = Math.max(1, Math.ceil(clip.frames / (10 * zoom)))
  const ticks = Array.from({ length: Math.floor(clip.frames / tick) + 1 }, (_, index) => index * tick)
  const percent = (value: number) => `${value / clip.frames * 100}%`
  function seek(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    onFrame(Math.round((event.clientX - rect.left) / rect.width * clip.frames))
  }
  return <section className="creator-timeline" aria-label="Tracktijdlijn">
    <div className="creator-timeline-canvas" style={{ width: `${zoom * 100}%` }}>
      <div className="creator-track-row">
        <strong>Tracks · {clip.tracks.length}</strong>
        <div className="creator-ruler" onPointerDown={seek}>
          {ticks.map(value => <span key={value} style={{ left: percent(value) }}>{value}</span>)}
          <i className="playhead" style={{ left: percent(frame) }} />
        </div>
      </div>
      {clip.tracks.map(track => <div key={trackId(track)} className="creator-track-row">
        <button aria-pressed={trackId(track) === selected} onClick={() => onSelect(track)} title={label(track)}>
          {track.muted ? '◌ ' : ''}{label(track)} · {channels[track.channel]}
        </button>
        <div className="creator-track-lane" onPointerDown={seek}>
          <i className="playhead" style={{ left: percent(frame) }} />
          {track.keys.map(key => <KeyMarker key={key.frame} frame={key.frame} end={clip.frames}
            label={`${label(track)} ${channels[track.channel]} frame ${key.frame}`}
            active={key.frame === frame && trackId(track) === selected}
            onMove={next => { onSelect(track); onMove(track, key.frame, next) }} />)}
        </div>
      </div>)}
      {!clip.tracks.length && <p>Kies een object en neem een keyframe op om een track te maken.</p>}
    </div>
  </section>
}
