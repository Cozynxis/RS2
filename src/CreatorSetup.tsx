import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { createClip, loadAsset, readCreatorFile, type Asset, type CreatorProject, type ModelSource } from './creatorModel'

export function CreatorSetup({ onExit, onOpen }: {
  onExit: () => void; onOpen: (project: CreatorProject, asset: Asset) => void;
}) {
  const [source, setSource] = useState<ModelSource>()
  const [count, setCount] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function read(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const { source, saved } = await readCreatorFile(file)
      const asset = await loadAsset(source)
      if (saved) {
        const targets = new Set(asset.targets.map(target => target.id))
        if (saved.clips.some(clip => clip.tracks.some(track => !targets.has(track.target)))) {
          asset.dispose()
          throw new Error('Een track verwijst naar een object dat ontbreekt in het model.')
        }
        onOpen(saved, asset)
      } else {
        setCount(asset.targets.length)
        asset.dispose()
        setSource(source)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Importeren is mislukt.')
    } finally { setBusy(false) }
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!source) return
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name')).trim()
    const clip = String(form.get('clip')).trim()
    if (!name || !clip) { setError('Vul een projectnaam en clipnaam in.'); return }
    setBusy(true)
    setError('')
    try {
      const asset = await loadAsset(source)
      onOpen({
        format: 'rs2-animation', version: 1, source, name,
        author: String(form.get('author')).trim(), notes: String(form.get('notes')).trim(),
        clips: [createClip(clip, Number(form.get('fps')), Number(form.get('frames')))],
      }, asset)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Openen is mislukt.')
    } finally { setBusy(false) }
  }

  return <main className="home creator-setup">
    <header className="home-hero">
      <div><span className="eyebrow">RS2 STUDIO · ANIMATIE</span><h1>Animation Creator</h1>
        <p>Importeer een model en maak er één of meer animatieclips voor.</p></div>
    </header>
    <section className="project-setup fields">
      <button type="button" disabled={busy} onClick={onExit}>← Startscherm</button>
      <div className="creator-steps">
        <span aria-current={source ? undefined : 'step'}>1. Model importeren</span>
        <span aria-current={source ? 'step' : undefined}>2. Animatiedetails</span>
      </div>
      <input ref={input} type="file" accept=".glb,.gltf,.json" onChange={event => void read(event)} hidden />
      {source ? <>
        <div className="creator-import-summary">
          <span><strong>{source.name}</strong><small>{count} animeerbare knooppunten</small></span>
          <button type="button" disabled={busy} onClick={() => input.current?.click()}>Ander model kiezen</button>
        </div>
        <form className="fields" key={source.name} onSubmit={event => void start(event)}>
          <fieldset className="form-grid" disabled={busy}>
            <legend>Animatiedetails</legend>
            <label>Projectnaam<input name="name" defaultValue={source.name.replace(/\.[^.]+$/, '') + ' animatie'} maxLength={80} required /></label>
            <label>Clipnaam<input name="clip" defaultValue="Animatie 01" maxLength={80} required /></label>
            <label>Auteur<input name="author" maxLength={80} /></label>
            <label>Beeldsnelheid (fps)<input name="fps" type="number" min={1} max={120} defaultValue={30} required /></label>
            <label>Eindframe<input name="frames" type="number" min={1} max={7200} defaultValue={60} required /></label>
          </fieldset>
          <label>Notities<textarea name="notes" maxLength={500} rows={2} /></label>
          <button className="primary" disabled={busy}>Animation Creator openen</button>
        </form>
      </> : <>
        <p>Exporteer je model vanuit RS2 Studio als GLB of RS2-JSON. Je kunt hier ook ingesloten glTF of een eerder bewaard RS2-animatieproject openen.</p>
        <button className="primary" type="button" disabled={busy} onClick={() => input.current?.click()}>Model of animatieproject importeren</button>
      </>}
      {busy && <p role="status">Bestand wordt gelezen…</p>}
      {error && <p role="alert" className="dialog-error">{error}</p>}
    </section>
  </main>
}
