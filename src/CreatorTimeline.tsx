import type { PointerEvent } from 'react'
import { channels, trackId, type Clip, type Track } from './creatorModel'

export function CreatorTimeline({ clip, frame, zoom, selected, label, onFrame, onSelect }: {
  clip: Clip; frame: number; zoom: number; selected?: string; label: (track: Track) => string;
  onFrame: (frame: number) => void; onSelect: (track: Track) => void;
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
          {track.keys.map(key => <button key={key.frame} className="creator-key"
            aria-label={`${label(track)} ${channels[track.channel]} frame ${key.frame}`}
            aria-pressed={key.frame === frame && trackId(track) === selected}
            style={{ left: percent(key.frame) }} onPointerDown={event => event.stopPropagation()}
            onClick={() => { onSelect(track); onFrame(key.frame) }}>◆</button>)}
        </div>
      </div>)}
      {!clip.tracks.length && <p>Kies een object en neem een keyframe op om een track te maken.</p>}
    </div>
  </section>
}
