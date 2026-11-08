import { useEffect, useRef, useState, type FormEvent } from 'react'
import { exportProject, type ExportOptions } from './scene'
import type { ModelNode, Project } from './model'

export function ExportDialog({ project, selected, onClose, onExport }: {
  project: Project; selected?: ModelNode; onClose: () => void; onExport: (message: string) => void;
}) {
  const [format, setFormat] = useState<ExportOptions['format']>('glb')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError('')
    setBusy(true)
    try {
      await exportProject(project, {
        format, name: String(form.get('name')), selection: form.get('scope') === 'selection' ? selected?.id : undefined,
        scale: Number(form.get('scale') ?? 1), origin: (form.get('origin') ?? 'original') as ExportOptions['origin'],
        textureSize: Number(form.get('textureSize') ?? 4096), hidden: form.has('hidden'), trs: form.has('trs'),
        textures: form.has('textures'), animations: form.has('animations'), metadata: form.has('metadata'),
      })
      onExport('Bestand gedownload.')
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Exporteren is mislukt.')
    } finally {
      setBusy(false)
    }
  }
  return <dialog ref={dialog} className="export-dialog" aria-labelledby="export-title" onClose={onClose}
    onCancel={event => { if (busy) event.preventDefault() }}>
    <form onSubmit={submit}>
      <header><div><span className="eyebrow">BESTAND</span><h2 id="export-title">Project exporteren</h2></div>
        <button type="button" aria-label="Exportvenster sluiten" onClick={onClose} disabled={busy}>×</button></header>
      <fieldset disabled={busy} className="form-grid">
        <legend>Bestand</legend>
        <label>Bestandsnaam<input name="name" defaultValue={project.name} required maxLength={100} /></label>
        <label>Formaat<select value={format} onChange={event => setFormat(event.target.value as ExportOptions['format'])}>
          <option value="glb">GLB · binair 3D-model</option><option value="gltf">glTF · ingesloten data</option>
          <option value="godot">Godot 4 · ZIP-pakket</option><option value="json">RS2 · projectgegevens (JSON)</option>
        </select></label>
      </fieldset>
      {format !== 'json' && <>
        <fieldset disabled={busy} className="form-grid">
          <legend>Model</legend>
          <label>Bereik<select name="scope"><option value="all">Hele scène</option>
            <option value="selection" disabled={!selected}>Selectie met inhoud</option></select></label>
          <label>Schaalfactor<input name="scale" type="number" step="any" min={0.001} max={1000} defaultValue={1} required /></label>
          <label>Oorsprong<select name="origin"><option value="original">Origineel</option>
            <option value="center">Midden van model</option><option value="ground">Midden op grondvlak</option></select></label>
          <label>Maximale textuurgrootte<select name="textureSize" defaultValue="4096">
            {[256, 512, 1024, 2048, 4096, 8192].map(size => <option key={size} value={size}>{size} px</option>)}</select></label>
        </fieldset>
        <fieldset disabled={busy} className="form-grid check-grid">
          <legend>Inhoud</legend>
          <label><input type="checkbox" name="textures" defaultChecked /> Texturen</label>
          <label><input type="checkbox" name="animations" defaultChecked /> Animatie</label>
          <label><input type="checkbox" name="metadata" defaultChecked /> Projectmetadata</label>
          <label><input type="checkbox" name="hidden" /> Verborgen objecten</label>
          <label><input type="checkbox" name="trs" /> Losse transformaties (TRS)</label>
        </fieldset>
      </>}
      {error && <p role="alert" className="dialog-error">{error}</p>}
      <footer><button type="button" onClick={onClose} disabled={busy}>Annuleren</button>
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Export voorbereiden…' : 'Downloaden'}</button></footer>
    </form>
  </dialog>
}
