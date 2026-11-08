import { useEffect, useState, type ChangeEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { createNode, descendants, kinds, loadProject, storageKey } from './model'
import type { Kind, Mode, ModelNode, Project, Vector } from './model'
import { exportProject } from './scene'
import { Viewport } from './Viewport'
import './style.css'

const modes = { translate: 'Verplaatsen', rotate: 'Roteren', scale: 'Schalen' } as const
const symbols = { box: '◇', sphere: '○', cylinder: '▤', cone: '△', plane: '▱', torus: '◎', group: '▰' }
type History = { past: Project[]; current: Project; future: Project[] }

function ObjectTree({ nodes, parent, selected, onSelect }: {
  nodes: ModelNode[]
  parent: string | null
  selected: string | null
  onSelect: (id: string) => void
}) {
  return <ul className="tree">
    {nodes.filter(node => node.parent === parent).map(node => <li key={node.id}>
      <button aria-pressed={selected === node.id} onClick={() => onSelect(node.id)}>
        <span aria-hidden="true">{symbols[node.kind]}</span> {node.name}
      </button>
      {node.kind === 'group' && <ObjectTree {...{ nodes, parent: node.id, selected, onSelect }} />}
    </li>)}
  </ul>
}

function NumberField({ label, value, onChange, min, max, step = 'any' }: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number | 'any'
}) {
  return <label>{label}<input key={value} type="number" defaultValue={Number(value.toFixed(4))}
    {...{ min, max, step }} onKeyDown={event => {
      if (event.key === 'Enter') event.currentTarget.blur()
    }} onBlur={event => {
      const input = event.currentTarget
      const next = input.valueAsNumber
      if (!Number.isFinite(next) || !input.validity.valid) input.value = input.defaultValue
      else if (input.value !== input.defaultValue) onChange(next)
    }} /></label>
}

function App() {
  const [history, setHistory] = useState<History>(() => ({ past: [], current: loadProject(), future: [] }))
  const project = history.current
  const [selectedId, select] = useState<string | null>(() => project.nodes[0]?.id ?? null)
  const [mode, setMode] = useState<Mode>('translate')
  const [saved, setSaved] = useState<Project>()
  const [message, setMessage] = useState('')
  const [exporting, setExporting] = useState(false)
  const selected = project.nodes.find(node => node.id === selectedId)
  const subtree = selected && descendants(project.nodes, selected.id)

  function edit(change: (current: Project) => Project) {
    setHistory(previous => {
      const current = change(previous.current)
      if (current === previous.current) return previous
      return { past: [...previous.past.slice(-49), previous.current], current, future: [] }
    })
  }
  function stepHistory(redo: boolean) {
    setHistory(({ past, current, future }) => {
      if (redo && future.length) return { past: [...past, current], current: future[0], future: future.slice(1) }
      if (!redo && past.length) return { past: past.slice(0, -1), current: past[past.length - 1], future: [current, ...future] }
      return { past, current, future }
    })
  }
  function updateNode(id: string, patch: Partial<ModelNode>) {
    edit(current => {
      const index = current.nodes.findIndex(node => node.id === id)
      if (index === -1) return current
      const nodes = [...current.nodes]
      nodes[index] = { ...nodes[index], ...patch }
      return { ...current, nodes }
    })
  }
  function add(kind: Kind) {
    const node = createNode(kind, selected?.kind === 'group' ? selected.id : null)
    edit(current => ({ ...current, nodes: [...current.nodes, node] }))
    select(node.id)
  }
  function remove() {
    if (!subtree) return
    edit(current => ({ ...current, nodes: current.nodes.filter(node => !subtree.has(node.id)) }))
    select(null)
  }
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(project))
      setSaved(project)
      setMessage('Project bewaard in deze browser.')
    } catch {
      setMessage('Bewaren mislukt. Browseropslag is vol of uitgeschakeld.')
    }
  }
  async function runExport(godot: boolean) {
    setExporting(true)
    setMessage('Export wordt voorbereid…')
    try {
      await exportProject(project, godot)
      setMessage(godot ? 'Godot-pakket gedownload.' : 'GLB-bestand gedownload.')
    } catch (error) {
      setMessage(`Export mislukt. ${error instanceof Error ? error.message : 'Controleer de texturen.'}`)
    } finally {
      setExporting(false)
    }
  }
  async function loadTexture(event: ChangeEvent<HTMLInputElement>, id: string) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 1_500_000) {
      setMessage('Kies een PNG- of JPEG-bestand van maximaal 1,5 MB.')
      return
    }
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      const reader = new FileReader()
      const data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      updateNode(id, { texture: data })
      setMessage('Textuur toegevoegd.')
    } catch {
      setMessage('Deze afbeelding kon niet worden geopend.')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement &&
        event.target.closest('input, select, textarea, [contenteditable]')) return
      const key = event.key.toLowerCase()
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z' || key === 'y') {
          event.preventDefault()
          stepHistory(key === 'y' || event.shiftKey)
        }
        if (key === 's') {
          event.preventDefault()
          save()
        }
      } else if (key === 'delete') remove()
      else if (key === 'g') setMode('translate')
      else if (key === 'r') setMode('rotate')
      else if (key === 's') setMode('scale')
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  })

  const hasMesh = project.nodes.some(node => node.kind !== 'group')
  return <>
    <header className="top">
      <div className="brand"><div aria-hidden="true">RS</div><span>RS2 <strong>Modelengine</strong><small>3D STUDIO</small></span></div>
      <input aria-label="Projectnaam" className="project-name" key={project.name} defaultValue={project.name}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
        onBlur={event => {
          const name = event.currentTarget.value.trim() || project.name
          event.currentTarget.value = name
          if (name !== project.name) edit(current => ({ ...current, name }))
        }} />
      <div className="actions">
        <button onClick={save}>Lokaal bewaren</button>
        <button disabled={exporting || !hasMesh} onClick={() => void runExport(false)}>GLB exporteren</button>
        <button className="primary" disabled={exporting || !hasMesh} onClick={() => void runExport(true)}>Godot-pakket</button>
      </div>
    </header>
    <main className="workspace">
      <aside className="sidebar">
        <section>
          <h2>Toevoegen</h2>
          <div className="primitives">{(Object.keys(kinds) as Kind[]).map(kind =>
            <button key={kind} onClick={() => add(kind)}><span aria-hidden="true">{symbols[kind]}</span>{kinds[kind]}</button>,
          )}</div>
        </section>
        <section>
          <h2>Objectboom <span className="count">{project.nodes.length}</span></h2>
          {project.nodes.length ? <ObjectTree nodes={project.nodes} parent={null}
            selected={selected?.id ?? null} onSelect={select} /> : <p>Voeg een vorm of groep toe.</p>}
        </section>
      </aside>
      <section className="stage" aria-label="Werkgebied">
        <div className="toolbar">
          <div className="tools" role="group" aria-label="Transformaties">
            {(Object.keys(modes) as Mode[]).map((item, index) =>
              <button key={item} aria-pressed={mode === item} onClick={() => setMode(item)}>
                {modes[item]} <kbd>{['G', 'R', 'S'][index]}</kbd>
              </button>,
            )}
          </div>
          <div className="tools" role="group" aria-label="Geschiedenis">
            <button title="Ongedaan maken" aria-label="Ongedaan maken" disabled={!history.past.length} onClick={() => stepHistory(false)}>↶</button>
            <button title="Opnieuw uitvoeren" aria-label="Opnieuw uitvoeren" disabled={!history.future.length} onClick={() => stepHistory(true)}>↷</button>
          </div>
        </div>
        <Viewport project={project} selected={selected?.id ?? null} mode={mode} onSelect={select} onTransform={updateNode} />
      </section>
      <aside className="inspector sidebar" aria-label="Eigenschappen">
        <section>
          <h2>Eigenschappen</h2>
          {selected ? <div key={selected.id} className="fields">
            <label>Naam<input key={selected.name} defaultValue={selected.name}
              onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
              onBlur={event => {
                const name = event.currentTarget.value.trim() || selected.name
                event.currentTarget.value = name
                if (name !== selected.name) updateNode(selected.id, { name })
              }} /></label>
            <label>Bovenliggende groep<select value={selected.parent ?? ''} onChange={event =>
              updateNode(selected.id, { parent: event.target.value || null })}>
              <option value="">Scène</option>
              {project.nodes.filter(node => node.kind === 'group' && !subtree?.has(node.id))
                .map(node => <option key={node.id} value={node.id}>{node.name}</option>)}
            </select></label>
            <button className="danger" onClick={remove}>{selected.kind === 'group' ? 'Groep met inhoud verwijderen' : 'Object verwijderen'}</button>
          </div> : <p>Selecteer een object in de scène of objectboom.</p>}
        </section>
        {selected && <section key={selected.id}>
          <h2>Transformatie</h2>
          {([['position', 'Positie (m)'], ['rotation', 'Rotatie (°)'], ['scale', 'Schaal']] as const).map(([field, label]) =>
            <fieldset key={field}><legend>{label}</legend><div className="vector">
              {['X', 'Y', 'Z'].map((axis, index) => <NumberField key={axis} label={axis}
                value={selected[field][index]} min={field === 'scale' ? 0.001 : undefined}
                onChange={value => {
                  const vector: Vector = [...selected[field]]
                  vector[index] = value
                  updateNode(selected.id, { [field]: vector })
                }} />)}
            </div></fieldset>,
          )}
        </section>}
        {selected && selected.kind !== 'group' && <section key={`material-${selected.id}`}>
          <h2>Materiaal</h2>
          <div className="fields">
            <label className="color">Basiskleur<input type="color" value={selected.color}
              onChange={event => updateNode(selected.id, { color: event.target.value })} /></label>
            <NumberField label="Ruwheid" value={selected.roughness} min={0} max={1} onChange={roughness => updateNode(selected.id, { roughness })} />
            <NumberField label="Metaalheid" value={selected.metalness} min={0} max={1} onChange={metalness => updateNode(selected.id, { metalness })} />
            <label>Textuur (PNG / JPEG)<input type="file" accept="image/png,image/jpeg" onChange={event => void loadTexture(event, selected.id)} /></label>
            {selected.texture && <div className="texture">
              <img src={selected.texture} alt="Huidige textuur" />
              <button onClick={() => updateNode(selected.id, { texture: undefined })}>Verwijderen</button>
            </div>}
          </div>
        </section>}
      </aside>
    </main>
    <footer><span role="status">{message || 'Editor gereed'}</span><span>{saved === project ? 'Lokaal bewaard' : 'Browseropslag · handmatig'}</span></footer>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
