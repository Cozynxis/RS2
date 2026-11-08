import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { cloneObject, copyObject, createNode, descendants, isVisible, kinds, loadProject, projectTypes, storageKey } from './model'
import type { Kind, Mode, ModelNode, ObjectClip, Project, Vector } from './model'
import { Viewport, type ViewOptions } from './Viewport'
import { ProjectHome } from './ProjectHome'
import { ExportDialog } from './ExportDialog'
import { Timeline } from './Timeline'
import './style.css'
import './studio.css'

const modes = { translate: 'Verplaatsen', rotate: 'Roteren', scale: 'Schalen' } as const
const symbols = { box: '◇', sphere: '○', cylinder: '▤', cone: '△', plane: '▱', torus: '◎', capsule: '◉', wedge: '◢', group: '▰' }
const viewLabels = { grid: 'Raster', snap: 'Snapping', local: 'Lokale assen', wireframe: 'Draadmodel' }
type History = { past: Project[]; current: Project; future: Project[] }

function Menu({ label, children }: { label: string; children: ReactNode }) {
  return <details name="studio-menu" className="studio-menu" onClick={event => {
    if ((event.target as HTMLElement).closest('button')) event.currentTarget.open = false
  }}>
    <summary>{label}</summary><div className="menu-items">{children}</div>
  </details>
}

function ObjectTree({ nodes, parent, selected, onSelect, onVisibility }: {
  nodes: ModelNode[]
  parent: string | null
  selected: string | null
  onSelect: (id: string) => void
  onVisibility: (node: ModelNode) => void
}) {
  return <ul className="tree">
    {nodes.filter(node => node.parent === parent).map(node => <li key={node.id}>
      <div className={`tree-row${isVisible(nodes, node) ? '' : ' hidden-node'}`}>
        <button aria-pressed={selected === node.id} onClick={() => onSelect(node.id)}>
          <span aria-hidden="true">{symbols[node.kind]}</span> {node.name}
        </button>
        <button className="visibility" title={node.hidden ? 'Tonen' : 'Verbergen'}
          aria-label={`${node.name} ${node.hidden ? 'tonen' : 'verbergen'}`}
          onClick={() => onVisibility(node)}>{node.hidden ? '◌' : '◉'}</button>
      </div>
      {node.kind === 'group' && <ObjectTree {...{ nodes, parent: node.id, selected, onSelect, onVisibility }} />}
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
  const [clipboard, setClipboard] = useState<ObjectClip>()
  const [options, setOptions] = useState<ViewOptions>({ grid: true, snap: false, local: false, wireframe: false })
  const [saved, setSaved] = useState<Project>()
  const [saveRequested, requestSave] = useState(false)
  const [message, setMessage] = useState('')
  const [exporting, setExporting] = useState(false)
  const [home, setHome] = useState(true)
  const [animate, setAnimate] = useState(false)
  const [previewTime, setPreviewTime] = useState<number | null>(null)
  const [search, setSearch] = useState('')
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
  function copy(cut = false) {
    if (!selected) return
    setClipboard(copyObject(project, selected))
    if (cut) remove()
    setMessage(cut ? 'Object geknipt.' : 'Object gekopieerd.')
  }
  function insert(clip: ObjectClip, parent: string | null, offset: number) {
    const clone = cloneObject(clip, parent, offset)
    edit(current => ({ ...current, nodes: [...current.nodes, ...clone.nodes] }))
    select(clone.id)
  }
  function paste() {
    if (clipboard) insert(clipboard, selected?.kind === 'group' ? selected.id : selected?.parent ?? null, 0)
  }
  function duplicate() {
    if (selected) insert(copyObject(project, selected), selected.parent, 0.25)
  }
  function toggleVisibility(node: ModelNode) {
    updateNode(node.id, { hidden: !node.hidden })
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
  useEffect(() => {
    if (saveRequested) {
      save()
      requestSave(false)
    }
  })
  function openProject(next: Project, fresh: boolean) {
    if (fresh) {
      edit(() => next)
      select(next.nodes[0]?.id ?? null)
      setSearch('')
      setMessage('')
    }
    setAnimate(next.info?.type === 'animation' || next.info?.type === 'gfx')
    setHome(false)
  }
  function toggleView(option: keyof ViewOptions) {
    setOptions(current => ({ ...current, [option]: !current[option] }))
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
      if (home || exporting) return
      const editing = event.target instanceof HTMLElement &&
        event.target.closest('input, select, textarea, [contenteditable]')
      const key = event.key.toLowerCase()
      if (event.defaultPrevented || event.isComposing || event.getModifierState('AltGraph')) return
      if (event.ctrlKey || event.metaKey) {
        if (key === 's') {
          event.preventDefault()
          if (event.repeat) return
          if (editing && document.activeElement instanceof HTMLElement) document.activeElement.blur()
          requestSave(true)
          return
        }
        if (editing) return
        const commands: Record<string, () => void> = {
          z: () => stepHistory(event.shiftKey),
          y: () => stepHistory(true),
          c: () => copy(),
          x: () => copy(true),
          v: paste,
          d: duplicate,
        }
        if (Object.hasOwn(commands, key)) {
          event.preventDefault()
          if (!event.repeat) commands[key]()
        } else if (['f', 'g', 'r', 'p', 'u', 'a', '+', '-', '=', '0'].includes(key)) {
          event.preventDefault()
        }
        return
      }
      if (editing || event.altKey || event.repeat) return
      if (key === 'delete') remove()
      else if (key === 'escape') select(null)
      else if (key === 'h' && selected) toggleVisibility(selected)
      else if (key === 'g') setMode('translate')
      else if (key === 'r') setMode('rotate')
      else if (key === 's') setMode('scale')
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  })

  if (home) return <ProjectHome current={project}
    onOpen={() => openProject(project, false)} onCreate={next => openProject(next, true)} />

  const query = search.trim().toLowerCase()
  const matched = new Set<string>()
  if (query) {
    for (const node of project.nodes.filter(item => item.name.toLowerCase().includes(query))) {
      let item: ModelNode | undefined = node
      while (item && !matched.has(item.id)) {
        matched.add(item.id)
        item = project.nodes.find(candidate => candidate.id === item?.parent)
      }
    }
  }
  const tree = query ? project.nodes.filter(node => matched.has(node.id)) : project.nodes
  return <div className="studio-shell">
    <header className="top">
      <div className="brand"><div aria-hidden="true">RS</div><span>RS2 <strong>Studio</strong></span></div>
      <nav className="menu-bar" aria-label="Hoofdmenu">
        <Menu label="Bestand">
          <button onClick={() => setHome(true)}>Startscherm</button>
          <button onClick={save}>Lokaal bewaren <kbd>Ctrl+S</kbd></button>
          <button onClick={() => setExporting(true)}>Exporteren…</button>
        </Menu>
        <Menu label="Bewerken">
          <button disabled={!history.past.length} onClick={() => stepHistory(false)}>Ongedaan maken <kbd>Ctrl+Z</kbd></button>
          <button disabled={!history.future.length} onClick={() => stepHistory(true)}>Opnieuw uitvoeren <kbd>Ctrl+Y</kbd></button>
          <button disabled={!selected} onClick={duplicate}>Dupliceren <kbd>Ctrl+D</kbd></button>
          <button disabled={!selected} onClick={() => copy()}>Kopiëren <kbd>Ctrl+C</kbd></button>
          <button disabled={!selected} onClick={() => copy(true)}>Knippen <kbd>Ctrl+X</kbd></button>
          <button disabled={!clipboard} onClick={paste}>Plakken <kbd>Ctrl+V</kbd></button>
          <button disabled={!selected} onClick={remove}>Verwijderen <kbd>Del</kbd></button>
        </Menu>
        <Menu label="Toevoegen">
          {(Object.keys(kinds) as Kind[]).map(kind => <button key={kind} onClick={() => add(kind)}>{kinds[kind]}</button>)}
        </Menu>
        <Menu label="Weergave">
          {(Object.keys(viewLabels) as (keyof ViewOptions)[]).map(option =>
            <button key={option} aria-pressed={options[option]} onClick={() => toggleView(option)}>{viewLabels[option]}</button>,
          )}
          <button aria-pressed={animate} onClick={() => setAnimate(!animate)}>Animatietijdlijn</button>
        </Menu>
      </nav>
      <div className="actions"><button className="primary" onClick={() => setExporting(true)}>Exporteren…</button></div>
    </header>
    <div className="project-strip">
      <button aria-label="Startscherm" title="Startscherm" onClick={() => setHome(true)}>⌂</button>
      <input aria-label="Projectnaam" className="project-name" key={project.name} defaultValue={project.name}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
        onBlur={event => {
          const name = event.currentTarget.value.trim() || project.name
          event.currentTarget.value = name
          if (name !== project.name) edit(current => ({ ...current, name }))
        }} />
      <span className="project-badge">{projectTypes[project.info?.type ?? 'model'].label}</span>
      <div className="workspace-tabs" role="group" aria-label="Werkmodus">
        <button aria-pressed={!animate} onClick={() => setAnimate(false)}>Bewerken</button>
        <button aria-pressed={animate} onClick={() => setAnimate(true)}>Animeren</button>
      </div>
    </div>
    <main className="workspace">
      <aside className="sidebar outliner">
        <section>
          <h2>Objectboom <span className="count">{project.nodes.length}</span></h2>
          <label className="outliner-search">Zoeken<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Objectnaam…" /></label>
          {tree.length ? <ObjectTree nodes={tree} parent={null}
            selected={selected?.id ?? null} onSelect={select} onVisibility={toggleVisibility} /> : <p>{query ? 'Geen resultaten.' : 'Voeg een vorm of groep toe.'}</p>}
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
        <div className="primitive-bar" role="group" aria-label="Toevoegen">{(Object.keys(kinds) as Kind[]).map(kind =>
          <button key={kind} onClick={() => add(kind)}><span aria-hidden="true">{symbols[kind]}</span>{kinds[kind]}</button>,
        )}</div>
        <Viewport project={project} selected={selected?.id ?? null} mode={mode} options={options} previewTime={animate ? previewTime : null}
          onSelect={select} onTransform={updateNode} />
        <div className="view-bar" role="group" aria-label="Weergaveopties">
          {(Object.keys(viewLabels) as (keyof ViewOptions)[]).map(option =>
            <button key={option} aria-pressed={options[option]} onClick={() => toggleView(option)}>{viewLabels[option]}</button>,
          )}
        </div>
        {animate && <Timeline project={project} selected={selected} onPreview={setPreviewTime}
          onPose={updateNode} onKeys={(id, keys) => updateNode(id, { keys })}
          onInterpolation={interpolation => edit(current => ({ ...current, interpolation }))} />}
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
          <button onClick={() => {
            const { position, rotation, scale } = createNode(selected.kind, selected.parent)
            updateNode(selected.id, { position, rotation, scale })
          }}>Transformatie herstellen</button>
        </section>}
        {selected && selected.kind !== 'group' && <section key={`material-${selected.id}`}>
          <h2>Materiaal</h2>
          <div className="fields">
            <label className="color">Basiskleur<input type="color" value={selected.color}
              onChange={event => updateNode(selected.id, { color: event.target.value })} /></label>
            <NumberField label="Ruwheid" value={selected.roughness} min={0} max={1} onChange={roughness => updateNode(selected.id, { roughness })} />
            <NumberField label="Metaalheid" value={selected.metalness} min={0} max={1} onChange={metalness => updateNode(selected.id, { metalness })} />
            <NumberField label="Dekking" value={selected.opacity ?? 1} min={0} max={1} onChange={opacity => updateNode(selected.id, { opacity })} />
            <NumberField label="Lichtsterkte" value={selected.emission ?? 0} min={0} max={10} onChange={emission => updateNode(selected.id, { emission })} />
            <div className="check-grid">
              <label><input type="checkbox" checked={selected.flat ?? false} onChange={event =>
                updateNode(selected.id, { flat: event.target.checked })} /> Vlakke normals</label>
              <label><input type="checkbox" checked={selected.doubleSided ?? selected.kind === 'plane'} onChange={event =>
                updateNode(selected.id, { doubleSided: event.target.checked })} /> Dubbelzijdig</label>
            </div>
            <label>Textuur (PNG / JPEG)<input type="file" accept="image/png,image/jpeg" onChange={event => void loadTexture(event, selected.id)} /></label>
            {selected.texture && <div className="texture">
              <img src={selected.texture} alt="Huidige textuur" />
              <button onClick={() => updateNode(selected.id, { texture: undefined })}>Verwijderen</button>
            </div>}
          </div>
        </section>}
      </aside>
    </main>
    {exporting && <ExportDialog project={project} selected={selected} onClose={() => setExporting(false)} onExport={setMessage} />}
    <footer><span role="status">{message || 'Editor gereed'}</span><span>{saved === project ? 'Lokaal bewaard' : 'Browseropslag · handmatig'}</span></footer>
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
