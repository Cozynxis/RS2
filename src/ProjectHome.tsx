import { lazy, Suspense, useState, type FormEvent } from 'react'
import { newProject, projectTypes, type Project, type ProjectType } from './model'

const AnimationCreator = lazy(() => import('./AnimationCreator'))

function ProjectIcon({ type }: { type: ProjectType }) {
  const paths: Record<ProjectType, string> = {
    model: 'M12 2 3 7v10l9 5 9-5V7L12 2ZM3 7l9 5 9-5m-9 5v10',
    animation: 'M3 8h18v13H3V8Zm0 0 17-5-1-3L2 5l1 3Zm5-5 3 3m4-5 3 3m-8 7v7l6-3.5-6-3.5Z',
    gfx: 'm13 2 1 7 7-3-4 6 5 4-7-1-2 7-3-7-7 3 4-6-4-5 7 2 3-7Z',
    level: 'M2 17h6v-5h6V7h8v14H2v-4Z',
    prefab: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[type]} fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" /></svg>
}

export function ProjectHome({ current, onOpen, onCreate }: {
  current: Project; onOpen: () => void; onCreate: (project: Project) => void;
}) {
  const [type, choose] = useState<ProjectType>()
  if (type === 'animation') return <Suspense fallback={<main className="home" role="status">Animation Creator laden…</main>}>
    <AnimationCreator onExit={() => choose(undefined)} />
  </Suspense>
  const category = type && projectTypes[type]
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!type) return
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name')).trim()
    if (!name) return
    onCreate(newProject({
      type, name, author: String(form.get('author')).trim(), notes: String(form.get('notes')).trim(),
      template: Number(form.get('template')), duration: Number(form.get('duration') ?? 2),
      fps: Number(form.get('fps') ?? 30),
    }))
  }
  return <main className="home launchpad">
    <div className="launchbar"><strong><span>RS</span> RS2 Studio</strong><span>MODEL · ANIMATIE · GFX</span></div>
    <header className="home-hero launch-hero">
      <div><span className="eyebrow">ROLLING SKY 2 · WERKPLAATS</span>
        <h1>Bouw je<br /><em>eigen wereld.</em></h1>
        <p>Maak een model, breng het in beweging en bouw er je volgende level mee.</p>
        {!type && <div className="launch-actions">
          <button className="primary" onClick={() => choose('model')}>Nieuw model <span aria-hidden="true">↗</span></button>
          <button onClick={() => choose('animation')}>Animation Creator <span aria-hidden="true">▶</span></button>
        </div>}
      </div>
      <div className="launch-art" aria-hidden="true">
        <div className="launch-orbit orbit-outer" /><div className="launch-orbit orbit-inner" />
        <div className="launch-cube"><i /><i /><i /><i /><i /><i /></div>
        <div className="launch-floor" />
        <span>RS2 / WERKPLAATS</span>
      </div>
    </header>
    {category && type ? <form className="project-setup fields" key={type} onSubmit={submit}>
      <button type="button" className="back-button" onClick={() => choose(undefined)}>← Projecttypes</button>
      <h2>Nieuw project · {category.label}</h2>
      <div className="form-grid">
        <label>Projectnaam <input name="name" required maxLength={80} autoFocus placeholder={`Mijn ${category.label.toLowerCase()}`} /></label>
        <label>Auteur <input name="author" maxLength={80} placeholder="Optioneel" /></label>
        <label>Startsjabloon <select name="template" defaultValue="1">{category.templates.map((template, index) =>
          <option key={template} value={index}>{template}</option>)}</select></label>
        {type === 'gfx' && <>
          <label>Duur in seconden <input name="duration" type="number" min={0.25} max={60} step={0.25} defaultValue={2} required /></label>
          <label>Frames per seconde <select name="fps" defaultValue="30">{[12, 24, 30, 60].map(fps => <option key={fps}>{fps}</option>)}</select></label>
        </>}
      </div>
      <label>Notities <textarea name="notes" rows={3} maxLength={500} placeholder="Wat wil je maken?" /></label>
      <button className="primary" type="submit">Project maken</button>
    </form> : <section className="home-projects launch-projects">
      <div className="launch-section-heading"><h2>Nieuw project</h2><span>KIES EEN WERKRUIMTE</span></div>
      <div className="project-cards">{(Object.keys(projectTypes) as ProjectType[]).map(key => {
        const item = projectTypes[key]
        return <button className={`project-card card-${key}`} key={key} onClick={() => choose(key)}>
          <ProjectIcon type={key} /><strong>{item.label}</strong><span>{item.description}</span><span className="card-arrow" aria-hidden="true">↗</span>
        </button>
      })}</div>
      <h2>Verder werken</h2>
      <button className="resume-project" onClick={onOpen}>
        <ProjectIcon type={current.info?.type ?? 'model'} />
        <span><strong>{current.name}</strong><small>{current.nodes.length} {current.nodes.length === 1 ? 'object' : 'objecten'} · {projectTypes[current.info?.type ?? 'model'].label}</small></span>
        <span aria-hidden="true">→</span>
      </button>
    </section>}
  </main>
}
