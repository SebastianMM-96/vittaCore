import { useEffect, useRef, useState } from 'react'
import {
  Apple, ArrowRight, CalendarDays, Check,
  CheckCircle2, ChevronDown, ChevronRight, CircleHelp,
  Clock3, Download, FileText, Flame, FolderOpen, LayoutDashboard, Leaf,
  LockKeyhole, LogOut, Mail, MapPin, Menu, MessageCircle, NotebookTabs, Plus, Printer, Search,
  Pencil, Settings2, ShieldCheck, Sparkles, Target,
  UsersRound, Utensils, Video, X, Scale, Activity, Upload, Trash2, ImagePlus, Save,
} from 'lucide-react'
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { createEmptyPatient, initialData, initialMenuTemplates, mergeFoodCatalog, navItems } from './data'
import { BACKUP_FILE_NAME, loadDirectoryHandle, removeDirectoryHandle, saveDirectoryHandle, supportsDirectoryPicker, writeAutomaticBackup } from './backup'

const iconMap = { LayoutDashboard, UsersRound, NotebookTabs, Apple }
const appStorage = window.vittacoreStorage || window.localStorage
const STORAGE_KEY = 'vittacore-workspace-v1'
const SETUP_KEY = 'vittacore-setup-complete-v1'
const ACCESS_KEY = 'vittacore-local-access-v1'
const PASSWORD_ITERATIONS = 310000
const BETA_PATIENT_LIMIT = 5
const MEAL_TIMES = ['Desayuno', 'Colación', 'Colación 2', 'Comida', 'Cena']
const WEEK_DAYS = [
  { key: 'monday', label: 'Lunes', jsDay: 1 },
  { key: 'tuesday', label: 'Martes', jsDay: 2 },
  { key: 'wednesday', label: 'Miércoles', jsDay: 3 },
  { key: 'thursday', label: 'Jueves', jsDay: 4 },
  { key: 'friday', label: 'Viernes', jsDay: 5 },
  { key: 'saturday', label: 'Sábado', jsDay: 6 },
  { key: 'sunday', label: 'Domingo', jsDay: 0 },
]
const COLOR_PRESETS = [
  { name: 'Esmeralda', value: '#347c62' },
  { name: 'Azul teal', value: '#147d82' },
  { name: 'Slate', value: '#475569' },
]
function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function dayKeyForDate(dateValue) {
  const day = new Date(`${dateValue}T12:00:00`).getDay()
  return WEEK_DAYS.find((item) => item.jsDay === day)?.key || 'monday'
}

function dayLabel(dayKey) {
  return WEEK_DAYS.find((day) => day.key === dayKey)?.label || dayKey
}

function normalizeMeal(meal, id) {
  const calories = Number(meal.calories || 0)
  return {
    ...meal,
    id: meal.id || id,
    time: meal.time || 'Colación',
    hour: meal.hour || '',
    title: meal.title || '',
    department: meal.department || 'Otros',
    items: Array.isArray(meal.items) ? meal.items : [],
    calories,
    protein: meal.protein ?? Math.round(calories * 0.2 / 4),
    carbs: meal.carbs ?? Math.round(calories * 0.5 / 4),
    fat: meal.fat ?? Math.round(calories * 0.3 / 9),
    image: typeof meal.image === 'string' ? meal.image : '',
  }
}

function normalizeWeeklyMenu(patient) {
  const source = patient.weeklyMenu
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    return Object.fromEntries(WEEK_DAYS.map(({ key }) => [
      key,
      Array.isArray(source[key]) ? source[key].map((meal, index) => normalizeMeal(meal, `${key}-${index}`)) : [],
    ]))
  }
  const legacyMenu = Array.isArray(patient.menu) ? patient.menu : []
  return Object.fromEntries(WEEK_DAYS.map(({ key }) => [
    key,
    legacyMenu.map((meal, index) => normalizeMeal(meal, `${meal.id || 'meal'}-${key}-${index}`)),
  ]))
}

function readMealImage(file) {
  if (!file?.type.startsWith('image/')) return Promise.reject(new Error('Selecciona un archivo de imagen válido.'))
  if (file.size > 2_000_000) return Promise.reject(new Error('La imagen debe pesar menos de 2 MB.'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer la imagen. Intenta con otro archivo.'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('No se pudo procesar la imagen seleccionada.'))
      image.onload = () => {
        const canvas = document.createElement('canvas')
        let scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight))
        let quality = 0.78
        let dataUrl = ''
        for (let attempt = 0; attempt < 8; attempt += 1) {
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
          const context = canvas.getContext('2d')
          if (!context) {
            reject(new Error('No fue posible preparar la imagen para guardarla.'))
            return
          }
          context.fillStyle = '#fff'
          context.fillRect(0, 0, canvas.width, canvas.height)
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          dataUrl = canvas.toDataURL('image/jpeg', quality)
          if (dataUrl.length <= 250_000) {
            resolve(dataUrl)
            return
          }
          if (quality > 0.55) quality -= 0.08
          else scale *= 0.8
        }
        reject(new Error('La imagen quedó demasiado grande al comprimirla. Elige una foto más pequeña.'))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function formatAppointmentDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
}

function getPasswordCredential() {
  const stored = appStorage.getItem(ACCESS_KEY)
  if (!stored) return null
  const credential = JSON.parse(stored)
  if (credential.version !== 1 || !credential.salt || !credential.hash || !credential.iterations) {
    throw new Error('La configuración de acceso local está dañada. No se pudo validar la contraseña.')
  }
  return credential
}

async function derivePasswordHash(password, salt, iterations = PASSWORD_ITERATIONS) {
  if (!globalThis.crypto?.subtle) throw new Error('El navegador no ofrece Web Crypto. Abre VittaCore en localhost o mediante HTTPS.')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256)
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error('La configuración de acceso local está dañada.')
  return new Uint8Array(hex.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)))
}

function passwordsMatch(left, right) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

async function createPasswordCredential(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iterations = PASSWORD_ITERATIONS
  const hash = await derivePasswordHash(password, salt, iterations)
  return { version: 1, salt: bytesToHex(salt), hash, iterations }
}

async function verifyLocalPassword(password) {
  const credential = getPasswordCredential()
  if (!credential) return false
  const hash = await derivePasswordHash(password, hexToBytes(credential.salt), credential.iterations)
  return passwordsMatch(hash, credential.hash)
}

function readWorkspace() {
  try {
    const stored = appStorage.getItem(STORAGE_KEY)
    const legacy = !stored
    const serialized = stored || appStorage.getItem('nutrivida-workspace-v1')
    if (!serialized) return initialData
    const parsed = JSON.parse(serialized)
    const professional = { ...initialData.professional, ...parsed.professional }
    if (legacy && professional.name === 'Dra. Mariana López' && professional.license === 'Cédula profesional 8452193') {
      Object.assign(professional, { name: '', license: '', officeName: '', tagline: '', phone: '', email: '', social: '', address: '', logo: '' })
    }
    const patients = Array.isArray(parsed.patients) ? parsed.patients.map((patient) => {
      const defaults = initialData.patients.find((item) => item.id === patient.id) || createEmptyPatient(patient.id)
      const measurements = Array.isArray(patient.measurements) ? patient.measurements : []
      return {
        ...defaults,
        ...patient,
        height: measurements.length ? patient.height ?? '' : '',
        weight: measurements.length ? patient.weight ?? '' : '',
        targets: { ...defaults.targets, ...patient.targets },
        measurements,
        weeklyMenu: normalizeWeeklyMenu(patient),
        menu: undefined,
        recommendations: Array.isArray(patient.recommendations) ? patient.recommendations : [],
        notes: Array.isArray(patient.notes) ? patient.notes : [],
        checklist: patient.checklist || {},
        shoppingChecked: patient.shoppingChecked || {},
      }
    }) : initialData.patients
    return {
      ...initialData,
      ...parsed,
      patients,
      betaPatientRegistrations: Math.max(patients.length, Number(parsed.betaPatientRegistrations) || 0),
      appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
      foods: mergeFoodCatalog(parsed.foods),
      professional,
    }
  } catch (error) {
    console.error('No se pudo cargar el espacio guardado.', error)
    return initialData
  }
}

function readTemplates() {
  try {
    const stored = JSON.parse(appStorage.getItem('vittacore-templates') || appStorage.getItem('nutrivida-templates') || '[]')
    return mergeMenuTemplates(stored)
  } catch (error) {
    console.error('No se pudieron cargar las plantillas guardadas.', error)
    return []
  }
}

function mergeMenuTemplates(savedTemplates = []) {
  const templatesById = new Map(initialMenuTemplates.map((template) => [template.id, template]))
  if (Array.isArray(savedTemplates)) {
    savedTemplates.filter((template) => template && Array.isArray(template.menu)).forEach((template, index) => {
      templatesById.set(template.id || `saved-${template.name}-${index}`, template)
    })
  }
  return [...templatesById.values()]
}

function Avatar({ name, size = 'normal' }) {
  const initials = name.split(' ').slice(0, 2).map((part) => part[0]).join('')
  return <div className={`avatar ${size === 'small' ? 'avatar-small' : ''}`}>{initials}</div>
}

function Pill({ children, tone = 'green' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}

function Modal({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
        </div>
        {children}
      </section>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, rows, onBlur }) {
  return (
    <label className="field">
      <span>{label}</span>
      {rows
        ? <textarea rows={rows} value={value ?? ''} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} placeholder={placeholder} />
        : <input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} placeholder={placeholder} />}
    </label>
  )
}

function Onboarding({ draft, setDraft, onSaveIdentity, onChooseFolder, onContinueWithoutFolder, folderSupported, folderStatus }) {
  const [step, setStep] = useState('identity')
  const [error, setError] = useState('')

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const saveIdentity = (event) => {
    event.preventDefault()
    if (!draft.name.trim() || !draft.license.trim() || !draft.officeName.trim()) {
      setError('Completa tu nombre, cédula y nombre del consultorio para continuar.')
      return
    }
    if (draft.logo && !draft.logo.startsWith('data:image/')) {
      try {
        const logoUrl = new URL(draft.logo)
        if (logoUrl.protocol !== 'https:') throw new Error('URL no segura')
      } catch {
        setError('El logotipo debe ser una imagen cargada o una URL HTTPS válida.')
        return
      }
    }
    onSaveIdentity()
    setError('')
    setStep('backup')
  }
  const uploadLogo = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 1_000_000) {
      setError('El logotipo debe pesar menos de 1 MB.')
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => update('logo', reader.result)
    reader.onerror = () => setError('No se pudo leer el logotipo. Intenta con otra imagen.')
    reader.readAsDataURL(file)
  }

  return (
    <div className="onboarding-backdrop">
      <section className="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div className="onboarding-brand"><span className="brand-mark"><Leaf size={21} /></span><span>Vitta<span>Core</span></span></div>
        {step === 'identity' ? <>
          <div className="onboarding-progress"><i className="active" /><i /></div>
          <p className="eyebrow">CONFIGURACIÓN INICIAL · 1 DE 2</p>
          <h1 id="onboarding-title">Tu consultorio, en tu espacio.</h1>
          <p className="onboarding-intro">Configura tu identidad profesional. Se guardará localmente y aparecerá en tus expedientes y reportes.</p>
          <form onSubmit={saveIdentity}>
            <div className="onboarding-form-grid">
              <Field label="Nombre completo del nutriólogo *" value={draft.name} onChange={(value) => update('name', value)} placeholder="Nombre y apellidos" />
              <Field label="Cédula profesional *" value={draft.license} onChange={(value) => update('license', value)} placeholder="Número de cédula" />
              <Field label="Consultorio / clínica *" value={draft.officeName} onChange={(value) => update('officeName', value)} placeholder="Nombre de tu consultorio" />
              <Field label="Teléfono" value={draft.phone} onChange={(value) => update('phone', value)} placeholder="+52 ..." />
              <Field label="Correo electrónico" type="email" value={draft.email} onChange={(value) => update('email', value)} placeholder="hola@tudominio.mx" />
              <Field label="Redes sociales" value={draft.social} onChange={(value) => update('social', value)} placeholder="@usuario o enlace" />
              <Field label="Enlace / dirección de consulta" value={draft.address} onChange={(value) => update('address', value)} placeholder="URL o dirección del consultorio" />
              <Field label="Eslogan (opcional)" value={draft.tagline} onChange={(value) => update('tagline', value)} placeholder="Tu salud, a tu manera" />
            </div>
            <div className="onboarding-branding">
              <div className="onboarding-colors"><span>Color principal de reportes</span><div>{COLOR_PRESETS.map((color) => <button key={color.value} type="button" className={`color-swatch ${draft.color === color.value ? 'color-swatch-selected' : ''}`} style={{ '--swatch': color.value }} onClick={() => update('color', color.value)} aria-label={color.name} title={color.name} />)}<input type="color" aria-label="Color personalizado" value={draft.color} onChange={(event) => update('color', event.target.value)} /></div></div>
              <div className="onboarding-logo"><span>Logotipo (opcional)</span><div className="logo-inputs"><Field label="URL https://..." value={draft.logo?.startsWith('data:') ? '' : draft.logo} onChange={(value) => update('logo', value)} placeholder="https://..." /><label className="logo-pick-button"><ImagePlus size={15} /> Subir imagen<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={uploadLogo} /></label>{draft.logo && <img src={draft.logo} alt="Vista previa del logotipo" />}</div></div>
            </div>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="button button-primary onboarding-next">Guardar identidad y continuar <ArrowRight size={15} /></button>
          </form>
        </> : <>
          <div className="onboarding-progress"><i className="active" /><i className="active" /></div>
          <p className="eyebrow">CONFIGURACIÓN INICIAL · 2 DE 2</p>
          <h1 id="onboarding-title">Una copia local, en tu carpeta.</h1>
          <p className="onboarding-intro">Elige una carpeta en este dispositivo. VittaCore actualizará allí <b>{BACKUP_FILE_NAME}</b> en segundo plano cada vez que cambies tus datos.</p>
          <div className={`folder-capability ${folderSupported ? '' : 'folder-unavailable'}`}>
            <div className="backup-icon"><ShieldCheck size={18} /></div>
            <div><strong>{folderSupported ? 'Respaldo automático local' : 'Selector de carpetas no disponible'}</strong><p>{folderSupported ? folderStatus : 'Este navegador no permite acceso directo a carpetas. Puedes continuar y descargar respaldos manuales desde Configuración.'}</p></div>
          </div>
          {error && <p className="form-error">{error}</p>}
          {folderSupported && <button className="button button-primary onboarding-next" onClick={async () => { setError(''); try { await onChooseFolder() } catch (reason) { setError(reason.message || 'No se pudo conectar la carpeta. Intenta de nuevo o continúa sin respaldo automático.') } }}><FolderOpen size={16} /> Elegir carpeta de respaldo</button>}
          <button className="button button-quiet onboarding-next" onClick={onContinueWithoutFolder}>Continuar {folderSupported ? 'sin respaldo automático' : 'a VittaCore'} <ArrowRight size={15} /></button>
          <button className="onboarding-back" onClick={() => setStep('identity')}><ChevronRight size={14} /> Volver a identidad profesional</button>
        </>}
        <div className="onboarding-privacy"><ShieldCheck size={14} /><span>Tus datos permanecen en tu dispositivo. No necesitas una cuenta ni un servidor.</span></div>
      </section>
    </div>
  )
}

function NutritionPlan({ patient, professional, onClose, onPrint, onEmail, onWhatsApp }) {
  const weeklyMenu = patient.weeklyMenu || normalizeWeeklyMenu(patient)
  const totalCalories = Object.values(weeklyMenu).flat().reduce((sum, meal) => sum + Number(meal.calories || 0), 0)
  return (
    <div className="plan-paper" id="print-plan">
      <header className="plan-brand">
        <div className="brand-lockup">
          {professional.logo
            ? <img className="brand-logo-img" src={professional.logo} alt="Logotipo" />
            : <span className="brand-mark"><Leaf size={19} /></span>}
          <div><strong>{professional.officeName || professional.name}</strong><small>{professional.name} · {professional.license}</small></div>
        </div>
        <span className="plan-tag">{professional.officeName || 'PLAN NUTRICIONAL'}</span>
      </header>
      <div className="plan-title">
        <span>PLAN PERSONALIZADO</span>
        <h1>Plan de alimentación semanal</h1>
        <p>Calendario de comidas diario, personalizado por tu especialista.</p>
      </div>
      <div className="plan-patient-line">
        <div><small>PREPARADO PARA</small><strong>{patient.name}</strong></div>
        <div><small>FECHA DE EMISIÓN</small><strong>{new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></div>
      </div>
      <div className="plan-targets">
        <div><span>Meta diaria</span><strong>{patient.targets.calories.toLocaleString()} <small>kcal</small></strong><em>{totalCalories ? `${totalCalories.toLocaleString()} kcal asignadas en la semana` : 'Energía estimada'}</em></div>
        <div><span>Proteína</span><strong>{patient.targets.protein}<small> g</small></strong><em>Objetivo diario</em></div>
        <div><span>Carbohidratos</span><strong>{patient.targets.carbs}<small> g</small></strong><em>Objetivo diario</em></div>
        <div><span>Grasas</span><strong>{patient.targets.fat}<small> g</small></strong><em>Objetivo diario</em></div>
      </div>
      <h3 className="plan-section-title">Calendario alimenticio semanal <span>· {totalCalories.toLocaleString()} kcal asignadas</span></h3>
      <div className="plan-week">
        {WEEK_DAYS.map((day) => {
          const meals = weeklyMenu[day.key] || []
          const dayCalories = meals.reduce((sum, meal) => sum + Number(meal.calories || 0), 0)
          return <section className="plan-day" key={day.key}>
            <div className="plan-day-heading"><h4>{day.label}</h4><span>{meals.length} {meals.length === 1 ? 'tiempo' : 'tiempos'} · {dayCalories.toLocaleString()} kcal</span></div>
            {meals.map((meal) => <article className="plan-meal" key={meal.id}>
              <div className="plan-meal-time"><strong>{meal.time}</strong><span>{meal.hour}</span></div>
              <div className="plan-meal-content"><b>{meal.title}</b><p>{meal.items.join(' · ')}</p>{meal.image && <img className="plan-meal-image" src={meal.image} alt={`Platillo: ${meal.title}`} />}</div>
              <span className="plan-kcal">{meal.calories} kcal</span>
            </article>)}
            {!meals.length && <p className="empty-copy plan-day-empty">Sin tiempos de comida asignados.</p>}
          </section>
        })}
      </div>
      {patient.recommendations.length > 0 && <div className="plan-recommendations"><h3>Recomendaciones generales y personalizadas</h3><ul>{patient.recommendations.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
      <footer className="plan-footer">
        <div><strong>{professional.name} · {professional.license}</strong><span>{professional.officeName}</span><span>{professional.tagline}</span><span>{[professional.phone, professional.email, professional.social, professional.address].filter(Boolean).join(' · ')}</span></div>
        <div className="signature"><span>Firma profesional</span><b>{professional.name}</b></div>
      </footer>
      <div className="plan-actions no-print">
        <button className="button button-quiet" onClick={onClose}>Cerrar vista previa</button>
        <button className="button button-quiet" onClick={onEmail}><Mail size={16} /> Enviar por correo</button>
        <button className="button button-quiet" onClick={onWhatsApp}><MessageCircle size={16} /> Enviar por WhatsApp</button>
        <button className="button button-primary" onClick={onPrint}><Printer size={16} /> Imprimir / Descargar PDF</button>
      </div>
      <p className="plan-delivery-note no-print">El correo y WhatsApp se abrirán con un mensaje listo para enviar. Adjunta el PDF semanal manualmente desde la opción de impresión/descarga.</p>
    </div>
  )
}

function MenuTemplateForm({ template, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => ({
    ...template,
    menu: template.menu.map((meal) => ({ ...meal, items: [...meal.items] })),
  }))
  const [error, setError] = useState('')
  const updateMeal = (index, patch) => setDraft((current) => ({
    ...current,
    menu: current.menu.map((meal, mealIndex) => mealIndex === index ? { ...meal, ...patch } : meal),
  }))
  const submit = (event) => {
    event.preventDefault()
    const name = draft.name.trim()
    if (!name) {
      setError('Escribe un nombre para el menú.')
      return
    }
    if (!draft.menu.length || draft.menu.some((meal) => !meal.title.trim())) {
      setError('Agrega al menos un tiempo de comida y escribe el nombre de cada platillo.')
      return
    }
    onSave({
      ...draft,
      name,
      description: draft.description.trim(),
      menu: draft.menu.map((meal) => ({
        ...meal,
        time: meal.time || 'Desayuno',
        title: meal.title.trim(),
        hour: meal.hour || '',
        items: Array.isArray(meal.items) ? meal.items : [],
        calories: Number(meal.calories) || 0,
        protein: Number(meal.protein) || 0,
        carbs: Number(meal.carbs) || 0,
        fat: Number(meal.fat) || 0,
        department: meal.department || 'Otros',
      })),
    })
  }
  const addMeal = () => setDraft((current) => ({
    ...current,
    menu: [...current.menu, {
      id: `meal-${Date.now()}`,
      time: 'Desayuno',
      hour: '',
      title: '',
      items: [],
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      department: 'Otros',
    }],
  }))

  return <form className="menu-template-form" onSubmit={submit}>
    <div className="menu-template-details">
      <Field label="Nombre del menú *" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} placeholder="Ej. Menú semanal equilibrado" />
      <Field label="Descripción (opcional)" value={draft.description} onChange={(description) => setDraft((current) => ({ ...current, description }))} placeholder="Notas o características del menú" />
    </div>
    <div className="menu-template-meals-heading"><div><h3>Tiempos de comida</h3><span>{draft.menu.length} tiempos</span></div><button type="button" className="button button-quiet button-small" onClick={addMeal}><Plus size={14} /> Agregar tiempo</button></div>
    <div className="menu-template-meals">
      {draft.menu.map((meal, index) => <article className="menu-template-meal-editor" key={meal.id || index}>
        <div className="menu-template-meal-heading"><strong>Tiempo {index + 1}</strong><button type="button" className="icon-button danger-hover" onClick={() => setDraft((current) => ({ ...current, menu: current.menu.filter((_, mealIndex) => mealIndex !== index) }))} aria-label={`Eliminar tiempo ${index + 1}`}><Trash2 size={15} /></button></div>
        <div className="menu-template-meal-fields">
          <label className="field"><span>Tiempo de comida</span><select value={meal.time} onChange={(event) => updateMeal(index, { time: event.target.value })}>{!MEAL_TIMES.includes(meal.time) && <option value={meal.time}>{meal.time}</option>}{MEAL_TIMES.map((time) => <option key={time}>{time}</option>)}</select></label>
          <Field label="Hora" value={meal.hour} onChange={(hour) => updateMeal(index, { hour })} placeholder="8:00 am" />
          <Field label="Nombre del platillo *" value={meal.title} onChange={(title) => updateMeal(index, { title })} placeholder="Nombre del platillo" />
          <Field label="Ingredientes (uno por línea)" value={meal.items.join('\n')} onChange={(value) => updateMeal(index, { items: value.split('\n').filter((item) => item.trim()) })} rows={3} placeholder="Ingrediente o porción" />
          <Field label="Energía (kcal)" value={meal.calories} type="number" onChange={(value) => updateMeal(index, { calories: value })} />
          <Field label="Proteína (g)" value={meal.protein} type="number" onChange={(value) => updateMeal(index, { protein: value })} />
          <Field label="Carbohidratos (g)" value={meal.carbs} type="number" onChange={(value) => updateMeal(index, { carbs: value })} />
          <Field label="Grasas (g)" value={meal.fat} type="number" onChange={(value) => updateMeal(index, { fat: value })} />
          <label className="field"><span>Departamento de compra</span><select value={meal.department} onChange={(event) => updateMeal(index, { department: event.target.value })}><option>Frutas y verduras</option><option>Lácteos</option><option>Carnes y proteínas</option><option>Cereales</option><option>Otros</option></select></label>
        </div>
      </article>)}
      {!draft.menu.length && <p className="empty-copy">Agrega un tiempo de comida para comenzar a crear el menú.</p>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onCancel}>Cancelar</button><button type="submit" className="button button-primary"><Check size={15} /> Guardar menú</button></div>
  </form>
}

function PatientForm({ patient, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...patient }))
  const [error, setError] = useState('')
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const submit = (event) => {
    event.preventDefault()
    const name = draft.name.trim()
    const age = Number(draft.age)
    if (!name) {
      setError('El nombre del paciente es obligatorio.')
      return
    }
    if (!Number.isInteger(age) || age < 1 || age > 120) {
      setError('Ingresa una edad válida entre 1 y 120 años.')
      return
    }
    onSave({ ...draft, name, age })
  }

  return <form onSubmit={submit}>
    <div className="patient-edit-form">
      <Field label="Nombre completo *" value={draft.name} onChange={(value) => update('name', value)} placeholder="Nombre y apellidos" />
      <Field label="Edad *" value={draft.age} type="number" onChange={(value) => update('age', value)} />
      <label className="field"><span>Sexo</span><select value={draft.sex} onChange={(event) => update('sex', event.target.value)}><option>Mujer</option><option>Hombre</option><option>Otro</option></select></label>
      <label className="field"><span>Estado</span><select value={draft.status} onChange={(event) => update('status', event.target.value)}><option>Activo</option><option>Inactivo</option></select></label>
      <Field label="Correo electrónico" value={draft.email} type="email" onChange={(value) => update('email', value)} />
      <Field label="Teléfono" value={draft.phone} onChange={(value) => update('phone', value)} />
      <Field label="Motivo de consulta" value={draft.reason} rows={2} onChange={(value) => update('reason', value)} />
      <Field label="Antecedentes médicos" value={draft.history} rows={2} onChange={(value) => update('history', value)} />
      <Field label="Alergias" value={draft.allergies} onChange={(value) => update('allergies', value)} />
      <Field label="Aversiones alimentarias" value={draft.dislikes} onChange={(value) => update('dislikes', value)} />
      <Field label="Objetivo" value={draft.goal} onChange={(value) => update('goal', value)} />
      <Field label="Recomendaciones personalizadas (una por línea)" value={(draft.recommendations || []).join('\n')} rows={3} onChange={(value) => update('recommendations', value.split('\n').map((item) => item.trim()).filter(Boolean))} />
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary"><Check size={15} /> Guardar ficha</button></div>
  </form>
}

function AppointmentForm({ appointment, patients, onSave, onClose }) {
  const [draft, setDraft] = useState(appointment)
  const [error, setError] = useState('')
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const submit = (event) => {
    event.preventDefault()
    if (!patients.some((item) => String(item.id) === draft.patientId)) {
      setError('Selecciona un paciente válido.')
      return
    }
    if (!draft.date || !draft.time || draft.date < localDateValue()) {
      setError('Selecciona una fecha de hoy o posterior y una hora.')
      return
    }
    if (!draft.visit.trim()) {
      setError('Indica el tipo de consulta.')
      return
    }
    onSave({ ...draft, visit: draft.visit.trim() })
  }

  return <form className="appointment-form" onSubmit={submit}>
    <label className="field"><span>Paciente *</span><select value={draft.patientId} onChange={(event) => update('patientId', event.target.value)} required>{patients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <div className="appointment-form-grid">
      <Field label="Fecha *" value={draft.date} type="date" onChange={(value) => update('date', value)} />
      <Field label="Hora *" value={draft.time} type="time" onChange={(value) => update('time', value)} />
    </div>
    <Field label="Tipo de consulta *" value={draft.visit} onChange={(value) => update('visit', value)} placeholder="Consulta inicial, seguimiento..." />
    <label className="field"><span>Modalidad</span><select value={draft.modality} onChange={(event) => update('modality', event.target.value)}><option>Presencial</option><option>Online</option></select></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary"><CalendarDays size={15} /> Guardar cita</button></div>
  </form>
}

function LocalAccessGate({ mode, onAuthenticated }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isSetup = mode === 'setup'

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (isSetup && password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (isSetup && password !== confirmation) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setBusy(true)
    try {
      if (isSetup) {
        appStorage.setItem(ACCESS_KEY, JSON.stringify(await createPasswordCredential(password)))
      } else if (!await verifyLocalPassword(password)) {
        setError('La contraseña no es correcta.')
        return
      }
      onAuthenticated()
    } catch (reason) {
      console.error('No se pudo validar el acceso local.', reason)
      setError(reason.message || 'No se pudo validar el acceso local.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="access-screen">
    <section className="access-card">
      <div className="onboarding-brand"><span className="brand-mark"><Leaf size={21} /></span><span>Vitta<span>Core</span></span></div>
      <div className="access-icon"><ShieldCheck size={22} /></div>
      <p className="eyebrow">{isSetup ? 'PROTEGE TU ESPACIO' : 'ACCESO PROFESIONAL'}</p>
      <h1>{isSetup ? 'Crea tu contraseña de acceso.' : 'Inicia sesión en tu consultorio.'}</h1>
      <p className="access-intro">{isSetup ? 'Configúrala para bloquear el acceso a VittaCore en este navegador.' : 'Ingresa tu contraseña para acceder a los expedientes guardados en este dispositivo.'}</p>
      <form onSubmit={submit}>
        <label className="field"><span>{isSetup ? 'Nueva contraseña' : 'Contraseña'}</span><input type="password" autoComplete={isSetup ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required /></label>
        {isSetup && <label className="field"><span>Confirma tu contraseña</span><input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary access-submit" type="submit" disabled={busy}>{busy ? 'Validando…' : isSetup ? 'Crear contraseña y continuar' : 'Iniciar sesión'} <ArrowRight size={15} /></button>
      </form>
      <div className="access-privacy"><ShieldCheck size={14} /><span>El acceso es local: la contraseña no cifra los expedientes y no se puede recuperar desde VittaCore. Conserva una copia de respaldo.</span></div>
    </section>
  </div>
}

function ChangePasswordForm({ onClose, onChanged }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (newPassword !== confirmation) {
      setError('Las contraseñas nuevas no coinciden.')
      return
    }
    setBusy(true)
    try {
      if (!await verifyLocalPassword(currentPassword)) {
        setError('La contraseña actual no es correcta.')
        return
      }
      appStorage.setItem(ACCESS_KEY, JSON.stringify(await createPasswordCredential(newPassword)))
      onChanged()
    } catch (reason) {
      console.error('No se pudo cambiar la contraseña local.', reason)
      setError(reason.message || 'No se pudo cambiar la contraseña.')
    } finally {
      setBusy(false)
    }
  }

  return <form className="change-password-form" onSubmit={submit}>
    <label className="field"><span>Contraseña actual</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
    <label className="field"><span>Nueva contraseña</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
    <label className="field"><span>Confirma la nueva contraseña</span><input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</button></div>
  </form>
}

function App() {
  const [workspace, setWorkspace] = useState(readWorkspace)
  const [setupComplete, setSetupComplete] = useState(() => appStorage.getItem(SETUP_KEY) === 'true')
  const [accessStatus, setAccessStatus] = useState(() => appStorage.getItem(ACCESS_KEY) ? 'locked' : 'setup')
  const [setupDraft, setSetupDraft] = useState(() => ({ ...workspace.professional }))
  const [directoryHandle, setDirectoryHandle] = useState(null)
  const [backupState, setBackupState] = useState(() => {
    if (!supportsDirectoryPicker()) return 'unsupported'
    return appStorage.getItem(SETUP_KEY) === 'true' ? 'loading' : 'not-configured'
  })
  const [backupError, setBackupError] = useState('')
  const [backupGeneration, setBackupGeneration] = useState(0)
  const [page, setPage] = useState('overview')
  const [search, setSearch] = useState('')
  const [patientStatusFilter, setPatientStatusFilter] = useState('Todos')
  const [modal, setModal] = useState(null)
  const [patientDraft, setPatientDraft] = useState(null)
  const [isCreatingPatient, setIsCreatingPatient] = useState(false)
  const [appointmentDraft, setAppointmentDraft] = useState(null)
  const [toast, setToast] = useState('')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [selectedPlanDay, setSelectedPlanDay] = useState(() => dayKeyForDate(localDateValue()))
  const importRef = useRef(null)
  const [calculator, setCalculator] = useState({ formula: 'mifflin', activity: 1.4 })
  const [macroMode, setMacroMode] = useState('grams')
  const [templates, setTemplates] = useState(readTemplates)
  const [templatePreview, setTemplatePreview] = useState(null)
  const [templateDraft, setTemplateDraft] = useState(null)
  const [foodDraft, setFoodDraft] = useState(null)
  const [foodIndex, setFoodIndex] = useState(null)
  const [printAfterPreview, setPrintAfterPreview] = useState(false)
  const [logoUrlDraft, setLogoUrlDraft] = useState(() => workspace.professional.logo?.startsWith('data:') ? '' : workspace.professional.logo || '')

  useEffect(() => {
    try { appStorage.setItem(STORAGE_KEY, JSON.stringify(workspace)) } catch (error) {
      console.error('No se pudo guardar el espacio de trabajo.', error)
      setToast('No se pudieron guardar los cambios en este dispositivo.')
    }
  }, [workspace])

  useEffect(() => {
    if (!setupComplete) return undefined
    let active = true
    if (!supportsDirectoryPicker()) {
      setBackupState('unsupported')
      return undefined
    }
    setBackupState('loading')
    loadDirectoryHandle().then(async (handle) => {
      if (!active) return
      if (!handle) {
        setBackupState('not-configured')
        return
      }
      setDirectoryHandle(handle)
      try {
        const permission = await handle.queryPermission({ mode: 'readwrite' })
        if (active) setBackupState(permission === 'granted' ? 'ready' : 'permission-required')
      } catch (error) {
        console.error('No se pudo verificar el permiso de la carpeta de respaldo.', error)
        if (active) {
          setBackupError(error.message)
          setBackupState('error')
        }
      }
    }).catch((error) => {
      console.error('No se pudo restaurar la carpeta de respaldo.', error)
      if (active) {
        setBackupError(error.message)
        setBackupState('error')
      }
    })
    return () => { active = false }
  }, [setupComplete])

  useEffect(() => {
    if (!setupComplete || !directoryHandle) return undefined
    let cancelled = false
    const timeout = window.setTimeout(async () => {
      setBackupState('saving')
      setBackupError('')
      try {
        const result = await writeAutomaticBackup(directoryHandle, {
          ...workspace,
          templates,
          exportedAt: new Date().toISOString(),
          format: 'vittacore-backup-v1',
        })
        if (cancelled) return
        setBackupState(result === 'saved' ? 'saved' : 'permission-required')
      } catch (error) {
        console.error('No se pudo actualizar el respaldo automático.', error)
        if (!cancelled) {
          setBackupError(error.message)
          setBackupState('error')
        }
      }
    }, 500)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [setupComplete, directoryHandle, workspace, templates, backupGeneration])

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(''), 3500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    setLogoUrlDraft(workspace.professional.logo?.startsWith('data:') ? '' : workspace.professional.logo || '')
  }, [workspace.professional.logo])

  useEffect(() => {
    if (modal !== 'plan' || !printAfterPreview) return undefined
    const timeout = window.setTimeout(() => {
      window.print()
      setPrintAfterPreview(false)
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [modal, printAfterPreview])

  const patient = workspace.patients.find((item) => item.id === workspace.activePatientId) || workspace.patients[0] || createEmptyPatient()
  const patientWeeklyMenu = patient.weeklyMenu || normalizeWeeklyMenu(patient)
  const planDayMenu = patientWeeklyMenu[selectedPlanDay] || []
  const estimatedCalories = calculation(patient, calculator)
  const today = localDateValue()
  const dailyMacros = planDayMenu.reduce((total, meal) => ({
    protein: total.protein + Number(meal.protein || 0),
    carbs: total.carbs + Number(meal.carbs || 0),
    fat: total.fat + Number(meal.fat || 0),
  }), { protein: 0, carbs: 0, fat: 0 })
  const weekEnd = new Date()
  weekEnd.setDate(weekEnd.getDate() + (7 - (weekEnd.getDay() || 7)))
  const weekEndDate = localDateValue(weekEnd)
  const weekAppointments = workspace.appointments
    .map((appointment) => ({ ...appointment, patient: workspace.patients.find((item) => item.id === appointment.patientId) }))
    .filter((appointment) => appointment.patient && appointment.date >= today && appointment.date <= weekEndDate)
    .sort((left, right) => left.date.localeCompare(right.date) || left.time.localeCompare(right.time))
  const todaysAppointments = weekAppointments.filter((appointment) => appointment.date === today)
  const welcomeName = workspace.professional.name.replace(/^(Dra?\.?|Lic\.?|Mtra?\.?)\s+/i, '').split(' ')[0] || 'especialista'
  const updatePatient = (patch, patientId = patient?.id) => {
    setWorkspace((current) => ({ ...current, patients: current.patients.map((item) => item.id === patientId ? { ...item, ...patch } : item) }))
  }
  const updateProfessional = (patch) => {
    setWorkspace((current) => ({ ...current, professional: { ...current.professional, ...patch } }))
  }
  const updateMeal = (mealId, patch) => updatePatient({
    weeklyMenu: {
      ...patientWeeklyMenu,
      [selectedPlanDay]: planDayMenu.map((meal) => meal.id === mealId ? { ...meal, ...patch } : meal),
    },
  })
  const macroFactors = { protein: 4, carbs: 4, fat: 9 }
  const macroUnit = macroMode === 'percent' ? '%' : macroMode === 'gkg' ? 'g/kg' : 'g'
  const macroDisplayValue = (key) => {
    if (macroMode === 'percent') return Math.round(patient.targets[key] * macroFactors[key] / Math.max(1, patient.targets.calories) * 100)
    if (macroMode === 'gkg') return Number(patient.weight) > 0 ? Number((patient.targets[key] / patient.weight).toFixed(2)) : ''
    return patient.targets[key]
  }
  const updateMacro = (key, value) => {
    if (macroMode === 'gkg' && Number(patient.weight) <= 0) return
    const grams = macroMode === 'percent'
      ? Number(value) / 100 * patient.targets.calories / macroFactors[key]
      : macroMode === 'gkg' ? Number(value) * patient.weight : Number(value)
    updatePatient({ targets: { ...patient.targets, [key]: Math.round(grams) } })
  }
  const addMeal = () => {
    const menu = [...planDayMenu, { id: `m-${Date.now()}`, time: 'Nuevo tiempo', hour: '6:00 pm', title: 'Nueva preparación', items: [], calories: 0, protein: 0, carbs: 0, fat: 0, checked: false, department: 'Otros', image: '' }]
    updatePatient({ weeklyMenu: { ...patientWeeklyMenu, [selectedPlanDay]: menu } })
    setToast('Tiempo de comida agregado al plan.')
  }
  const filteredPatients = workspace.patients.filter((item) => (patientStatusFilter === 'Todos' || item.status === patientStatusFilter) && `${item.name} ${item.email} ${item.goal}`.toLowerCase().includes(search.toLowerCase()))
  const dailyCalories = planDayMenu.reduce((sum, meal) => sum + Number(meal.calories || 0), 0)
  const selectPatient = (id) => {
    setWorkspace((current) => ({ ...current, activePatientId: id }))
    setPage('patients')
  }
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ ...workspace, templates, exportedAt: new Date().toISOString(), format: 'vittacore-backup-v1' }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `vittacore-respaldo-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setToast('Respaldo de VittaCore descargado.')
  }
  const importBackup = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const imported = JSON.parse(await file.text())
      if (!Array.isArray(imported.patients) || !imported.professional || !Array.isArray(imported.foods)) throw new Error('El archivo no contiene un respaldo válido de VittaCore.')
      if (imported.patients.length > BETA_PATIENT_LIMIT) throw new Error(`La beta admite respaldos de hasta ${BETA_PATIENT_LIMIT} pacientes.`)
      setWorkspace({
        ...initialData,
        ...imported,
        patients: imported.patients.map((patient) => ({ ...patient, weeklyMenu: normalizeWeeklyMenu(patient), menu: undefined })),
        betaPatientRegistrations: Math.max(workspace.betaPatientRegistrations, imported.patients.length, Number(imported.betaPatientRegistrations) || 0),
        foods: mergeFoodCatalog(imported.foods),
        professional: { ...initialData.professional, ...imported.professional },
      })
      const restoredTemplates = Array.isArray(imported.templates) ? imported.templates.filter((template) => template && Array.isArray(template.menu)) : []
      const mergedTemplates = mergeMenuTemplates(restoredTemplates)
      setTemplates(mergedTemplates)
      appStorage.setItem('vittacore-templates', JSON.stringify(mergedTemplates))
      appStorage.setItem(SETUP_KEY, 'true')
      setSetupComplete(true)
      setToast('Respaldo restaurado correctamente.')
    } catch (error) {
      console.error('No se pudo importar el respaldo.', error)
      setToast(error instanceof SyntaxError ? 'El archivo no es un JSON válido.' : error.message)
    } finally { event.target.value = '' }
  }
  const printPlan = () => window.print()
  const emailPlan = () => {
    const email = String(patient.email || '').trim()
    if (!email) {
      setToast('Agrega el correo del paciente en su ficha para compartir el plan.')
      return
    }
    const subject = `Tu plan nutricional · ${workspace.professional.officeName || workspace.professional.name}`
    const body = [
      `Hola ${patient.name},`,
      '',
      'Te comparto tu plan nutricional personalizado con el calendario de alimentación completo de la semana. Puedes revisar las indicaciones y los menús de cada día en el documento PDF que adjunto a este correo.',
      '',
      'Si tienes alguna duda, responde a este mensaje y con gusto te apoyo.',
      '',
      `Saludos,\n${workspace.professional.name}\n${workspace.professional.officeName}`,
    ].join('\n')
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }
  const whatsAppPlan = () => {
    const rawPhone = String(patient.phone || '').trim()
    if (!rawPhone) {
      setToast('Agrega el teléfono del paciente en su ficha para compartir el plan.')
      return
    }
    const digits = (rawPhone.startsWith('00') ? rawPhone.slice(2) : rawPhone).replace(/\D/g, '')
    const phone = digits.length === 10 ? `52${digits}` : digits
    if (phone.length < 10 || phone.length > 15) {
      setToast('Revisa el teléfono: usa 10 dígitos de México o incluye el código de país.')
      return
    }
    const message = [
      `Hola ${patient.name}, soy ${workspace.professional.name} de ${workspace.professional.officeName}.`,
      '',
      'Tu plan nutricional personalizado de toda la semana está listo, con los tiempos de comida de cada día. Te lo comparto en PDF por este medio; si tienes alguna duda, escríbeme con confianza.',
    ].join('\n')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }
  const finishOnboarding = () => {
    try {
      appStorage.setItem(SETUP_KEY, 'true')
      setSetupComplete(true)
      setToast('VittaCore está listo. Tus datos se guardan en este dispositivo.')
    } catch (error) {
      console.error('No se pudo completar la configuración local.', error)
      setToast('No se pudo guardar la configuración en este navegador.')
    }
  }
  const saveOnboardingIdentity = () => {
    setWorkspace((current) => ({ ...current, professional: { ...current.professional, ...setupDraft } }))
  }
  const chooseBackupFolder = async () => {
    if (!supportsDirectoryPicker()) throw new Error('Este navegador no permite acceso automático a carpetas locales.')
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      await saveDirectoryHandle(handle)
      setDirectoryHandle(handle)
      setBackupState('ready')
      setBackupError('')
      finishOnboarding()
    } catch (error) {
      if (error.name === 'AbortError') return
      throw new Error(`No se pudo seleccionar la carpeta: ${error.message}`)
    }
  }
  const connectBackupFolder = async () => {
    if (!supportsDirectoryPicker()) {
      setToast('Este navegador no admite respaldos automáticos en carpetas.')
      return
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      await saveDirectoryHandle(handle)
      setDirectoryHandle(handle)
      setBackupState('ready')
      setBackupError('')
      setToast(`Respaldo automático conectado a “${handle.name}”.`)
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('No se pudo conectar la carpeta de respaldo.', error)
        setBackupError(error.message)
        setBackupState('error')
        setToast(`No se pudo conectar la carpeta: ${error.message}`)
      }
    }
  }
  const requestBackupPermission = async () => {
    if (!directoryHandle) return
    try {
      const permission = await directoryHandle.requestPermission({ mode: 'readwrite' })
      if (permission === 'granted') {
        setBackupState('ready')
        setBackupError('')
        setBackupGeneration((generation) => generation + 1)
        setToast('Acceso a la carpeta restablecido.')
      } else {
        setBackupState('permission-required')
        setToast('El navegador no concedió acceso a la carpeta.')
      }
    } catch (error) {
      console.error('No se pudo solicitar acceso a la carpeta de respaldo.', error)
      setBackupError(error.message)
      setBackupState('error')
      setToast(`No se pudo restablecer el acceso: ${error.message}`)
    }
  }
  const disconnectBackupFolder = async () => {
    try {
      await removeDirectoryHandle()
      setDirectoryHandle(null)
      setBackupState(supportsDirectoryPicker() ? 'not-configured' : 'unsupported')
      setBackupError('')
      setToast('Respaldo automático desconectado. Puedes descargar una copia manual cuando quieras.')
    } catch (error) {
      console.error('No se pudo quitar la carpeta guardada.', error)
      setToast(`No se pudo desconectar la carpeta: ${error.message}`)
    }
  }
  const backupStatusText = {
    loading: 'Comprobando carpeta de respaldo…',
    'not-configured': 'No has conectado una carpeta para el respaldo automático.',
    unsupported: 'Este navegador no permite escribir directamente en una carpeta.',
    ready: directoryHandle ? `Carpeta conectada: ${directoryHandle.name}` : 'Carpeta de respaldo conectada.',
    saving: `Actualizando ${BACKUP_FILE_NAME}…`,
    saved: `${BACKUP_FILE_NAME} actualizado en ${directoryHandle?.name || 'tu carpeta'}.`,
    'permission-required': 'El navegador requiere que vuelvas a conceder acceso a la carpeta.',
    error: backupError || 'No se pudo actualizar el respaldo automático.',
  }[backupState]
  const backupConnectionStatus = backupState === 'loading'
    ? 'Comprobando carpeta…'
    : directoryHandle
      ? backupState === 'permission-required'
        ? 'Carpeta conectada · acceso pendiente'
        : backupState === 'error'
          ? 'Carpeta conectada · revisar respaldo'
          : 'Carpeta conectada'
      : 'Sin carpeta conectada'
  const backupIndicatorTone = ['ready', 'saving', 'saved'].includes(backupState)
    ? 'connected'
    : ['loading', 'permission-required', 'error'].includes(backupState)
      ? 'pending'
      : 'disconnected'
  const previewAndPrint = () => {
    setPrintAfterPreview(true)
    setModal('plan')
  }
  const addPatient = () => {
    if (workspace.betaPatientRegistrations >= BETA_PATIENT_LIMIT) {
      setModal('beta-limit')
      return
    }
    setPatientDraft(createEmptyPatient(Date.now()))
    setIsCreatingPatient(true)
    setPage('patients')
    setModal('patient')
  }
  const scheduleAppointment = () => {
    if (!workspace.patients.length) {
      setToast('Agrega primero un paciente para poder agendar una cita.')
      return
    }
    setAppointmentDraft({
      patientId: String(patient.id),
      date: today,
      time: '09:00',
      visit: 'Consulta de seguimiento',
      modality: 'Presencial',
    })
    setModal('appointment')
  }
  const saveAppointment = (appointment) => {
    setWorkspace((current) => ({
      ...current,
      appointments: [...current.appointments, { ...appointment, id: Date.now(), patientId: Number(appointment.patientId) }],
    }))
    setModal(null)
    setAppointmentDraft(null)
    setToast('Cita agendada correctamente.')
  }
  const editPatient = () => {
    setPatientDraft({ ...patient, recommendations: [...(patient.recommendations || [])] })
    setIsCreatingPatient(false)
    setModal('patient')
  }
  const closePatientForm = () => {
    setModal(null)
    setPatientDraft(null)
    setIsCreatingPatient(false)
  }
  const savePatientForm = (savedPatient) => {
    if (isCreatingPatient) {
      if (workspace.betaPatientRegistrations >= BETA_PATIENT_LIMIT) {
        closePatientForm()
        setModal('beta-limit')
        return
      }
      const registrationCount = workspace.betaPatientRegistrations + 1
      setWorkspace((current) => ({
        ...current,
        patients: [savedPatient, ...current.patients],
        activePatientId: savedPatient.id,
        betaPatientRegistrations: current.betaPatientRegistrations + 1,
      }))
      closePatientForm()
      if (registrationCount >= BETA_PATIENT_LIMIT) setModal('beta-limit')
      else setToast('Paciente agregado correctamente.')
      return
    } else {
      setWorkspace((current) => ({
        ...current,
        patients: current.patients.map((item) => item.id === savedPatient.id ? savedPatient : item),
      }))
    }
    closePatientForm()
    setToast('Ficha del paciente actualizada.')
  }
  const addFood = () => {
    setFoodIndex(null)
    setFoodDraft({ name: '', portion: '100 g', calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, calcium: 0, iron: 0, category: 'Otros', source: 'Dato ingresado manualmente' })
    setModal('food')
  }
  const editFood = (index) => {
    setFoodIndex(index)
    setFoodDraft({ ...workspace.foods[index] })
    setModal('food')
  }
  const saveFood = () => {
    if (!foodDraft.name.trim() || !foodDraft.portion.trim()) {
      setToast('Completa el nombre y la porción del alimento.')
      return
    }
    setWorkspace((current) => ({
      ...current,
      foods: foodIndex === null
        ? [foodDraft, ...current.foods]
        : current.foods.map((food, index) => index === foodIndex ? foodDraft : food),
    }))
    setModal(null)
    setToast(foodIndex === null ? 'Alimento agregado a tu biblioteca.' : 'Alimento actualizado.')
  }
  const openMenuTemplateEditor = (template = null) => {
    const id = template?.id || `menu-${Date.now()}`
    const menu = template?.menu?.map((meal, index) => ({
      ...meal,
      id: meal.id || `meal-${id}-${index}`,
      items: Array.isArray(meal.items) ? [...meal.items] : [],
    })) || [{
      id: `meal-${id}-0`,
      time: 'Desayuno',
      hour: '',
      title: '',
      items: [],
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      department: 'Otros',
    }]
    setTemplateDraft({
      ...(template || {}),
      id,
      name: template?.name || '',
      description: template?.description || '',
      menu,
    })
    setModal('menu-template-editor')
  }
  const saveMenuTemplate = (savedTemplate) => {
    const next = templates.some((template) => template.id === savedTemplate.id)
      ? templates.map((template) => template.id === savedTemplate.id ? savedTemplate : template)
      : [savedTemplate, ...templates]
    try {
      appStorage.setItem('vittacore-templates', JSON.stringify(next))
      setTemplates(next)
      setTemplateDraft(null)
      setModal(null)
      setToast('Menú guardado en tu biblioteca.')
    } catch (error) {
      console.error('No se pudo guardar el menú.', error)
      setToast('No se pudo guardar el menú en este dispositivo.')
    }
  }
  const applyMenuTemplate = () => {
    if (!templatePreview) return
    const menu = templatePreview.menu.map((meal, index) => ({
      ...meal,
      id: `m-${Date.now()}-${index}`,
      items: [...meal.items],
      checked: false,
    }))
    updatePatient({
      weeklyMenu: { ...patientWeeklyMenu, [selectedPlanDay]: menu },
      checklist: {},
      shoppingChecked: {},
    })
    setModal(null)
    setTemplatePreview(null)
    setToast(`Menú "${templatePreview.name}" aplicado al ${dayLabel(selectedPlanDay)} de ${patient.name}.`)
  }
  const signOut = () => {
    setProfileMenuOpen(false)
    setModal(null)
    setAccessStatus('locked')
  }
  const onPasswordChanged = () => {
    setModal(null)
    setToast('Contraseña de acceso actualizada.')
  }

  if (setupComplete && accessStatus !== 'authenticated') {
    return <LocalAccessGate mode={accessStatus} onAuthenticated={() => setAccessStatus('authenticated')} />
  }

  return (
    <div className="app-shell" style={{ '--brand': workspace.professional.color || '#347c62' }}>
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand"><span className="brand-mark"><Leaf size={20} /></span><span>Vitta<span>Core</span><small>ESPACIO PROFESIONAL</small></span><button className="icon-button mobile-close" onClick={() => setMobileNav(false)}><X size={17} /></button></div>
        <div className="profile-switch"><Avatar name={workspace.professional.name || 'Nutriólogo'} size="small" /><div><strong>{workspace.professional.name || 'Identidad profesional'}</strong><span>{workspace.professional.officeName || 'Consultorio independiente'}</span></div><ChevronDown size={15} /></div>
        <div className="side-label">CONSULTORIO</div>
        <nav className="side-nav">{navItems.map((item) => {
          const Icon = iconMap[item.icon]
          return <button key={item.id} className={`nav-link ${page === item.id || (item.id === 'patients' && page === 'patients') ? 'nav-active' : ''}`} onClick={() => { setPage(item.id); setMobileNav(false) }}><Icon size={18} /><span>{item.label}</span>{item.id === 'patients' && <span className="nav-count">{workspace.patients.filter((p) => p.status === 'Activo').length}</span>}</button>
        })}</nav>
        <div className="sidebar-spacer" />
        <div className="backup-card"><div className="backup-icon"><ShieldCheck size={16} /></div><strong>Respaldo local</strong><div className={`backup-semaphore backup-semaphore-${backupIndicatorTone}`} role="status"><i />{backupConnectionStatus}</div><p>{backupStatusText}</p><button onClick={() => setPage('settings')}>Administrar respaldo <ArrowRight size={13} /></button></div>
        <button className={`nav-link settings-link ${page === 'settings' ? 'nav-active' : ''}`} onClick={() => setPage('settings')}><Settings2 size={18} /><span>Configuración</span></button>
        <div className="sidebar-foot"><span className={`online-dot backup-dot-${backupIndicatorTone}`} /> {backupState === 'saved' ? 'Copia local actualizada' : backupConnectionStatus}</div>
      </aside>
      {mobileNav && <button className="sidebar-scrim" onClick={() => setMobileNav(false)} aria-label="Cerrar navegación" />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Abrir navegación"><Menu size={20} /></button>
          <div className="breadcrumb"><span>Consultorio</span><ChevronRight size={14} /> <strong>{page === 'overview' ? 'Resumen' : page === 'patients' ? 'Pacientes' : page === 'plans' ? 'Planes nutricionales' : page === 'foods' ? 'Alimentos' : 'Configuración'}</strong></div>
          <div className="topbar-actions"><span className="single-user-label"><ShieldCheck size={14} /> Datos locales</span><span className="beta-badge">BETA · 1.0.1</span><div className="profile-menu-wrap"><button className="profile-mini" aria-label="Abrir menú de cuenta" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}><Avatar name={workspace.professional.name || 'Nutriólogo'} size="small" /><ChevronDown size={14} /></button>{profileMenuOpen && <div className="profile-menu"><strong>{workspace.professional.name}</strong><button onClick={() => { setProfileMenuOpen(false); setPage('settings') }}><Settings2 size={15} /> Configuración</button><button onClick={signOut}><LogOut size={15} /> Cerrar sesión</button></div>}</div></div>
        </header>

        <div className="professional-content">
          {page === 'overview' && <div className="dashboard-page">
            <div className="welcome-row"><div><p className="eyebrow">{new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toLocaleUpperCase('es-MX')}</p><h1>Buenos días, {welcomeName} <span className="wave">✳</span></h1><p>{workspace.professional.officeName || 'Tu consultorio'} · Tu información clínica permanece local.</p></div><div className="welcome-actions"><button className="button button-quiet" onClick={scheduleAppointment} disabled={!workspace.patients.length}><CalendarDays size={16} /> Agendar cita</button><button className="button button-primary" onClick={addPatient}><Plus size={17} /> Nuevo paciente</button></div></div>
            <div className="stat-grid dashboard-kpis">
              <div className="stat-card"><div className="stat-top"><div className="metric-icon green"><UsersRound size={17} /></div><span className="stat-period">Expedientes</span></div><span className="stat-label">Pacientes activos</span><strong>{workspace.patients.filter((p) => p.status === 'Activo').length}<small> pacientes</small></strong><span className="stat-sub">De {workspace.patients.length} expedientes registrados</span></div>
              <div className="stat-card"><div className="stat-top"><div className="metric-icon peach"><CalendarDays size={17} /></div><span className="stat-period">Esta semana</span></div><span className="stat-label">Consultas de la semana / hoy</span><strong>{weekAppointments.length}<small> esta semana</small></strong><span className="stat-sub">{todaysAppointments.length} {todaysAppointments.length === 1 ? 'consulta hoy' : 'consultas hoy'}</span></div>
            </div>
            <section className="surface-card appointments-card dashboard-agenda">
              <div className="agenda-heading"><div><p className="eyebrow">AGENDA DE LA SEMANA</p><h2>Próximas consultas</h2><p>Agenda tus citas y organiza la atención de tus pacientes.</p></div><div className="agenda-header-actions"><span className="agenda-count"><CalendarDays size={15} /> {weekAppointments.length} {weekAppointments.length === 1 ? 'cita' : 'citas'}</span><button className="button button-primary button-small" onClick={scheduleAppointment} disabled={!workspace.patients.length}><Plus size={14} /> Agendar cita</button></div></div>
              <div className="agenda-list">
                {weekAppointments.map((appointment) => {
                  const AppointmentIcon = appointment.modality === 'Online' ? Video : MapPin
                  const [hour, minute] = appointment.time.split(':').map(Number)
                  return <button className="agenda-row" key={appointment.id} onClick={() => selectPatient(appointment.patient.id)}>
                    <span className="agenda-time"><time dateTime={appointment.time}>{`${hour % 12 || 12}:${String(minute).padStart(2, '0')}`}</time><small>{hour >= 12 ? 'PM' : 'AM'}</small></span>
                    <span className="agenda-avatar"><Avatar name={appointment.patient.name} size="small" /></span>
                    <span className="agenda-patient"><strong>{appointment.patient.name}</strong><small>{appointment.visit} · {appointment.date === today ? 'Hoy' : formatAppointmentDate(appointment.date)}</small></span>
                    <span className={`appointment-mode ${appointment.modality === 'Online' ? 'mode-online' : ''}`}><AppointmentIcon size={14} />{appointment.modality}</span>
                    <ChevronRight className="agenda-chevron" size={16} />
                  </button>
                })}
                {!weekAppointments.length && <div className="agenda-empty"><CalendarDays size={20} /><span>No hay consultas programadas esta semana. Agenda la primera para verla aquí.</span></div>}
              </div>
              <button className="text-button appointments-all" onClick={() => setPage('patients')}>Ver todos los pacientes <ArrowRight size={13} /></button>
            </section>
            <section className="surface-card recent-patients dashboard-recent">
              <div className="card-heading card-heading-between"><div><h3>Pacientes recientes</h3><p>Acceso rápido a los expedientes de tu consultorio</p></div><button className="text-button" onClick={() => setPage('patients')}>Ver todos <ArrowRight size={14} /></button></div>
              <div className="patient-table-wrap"><table className="patient-table"><thead><tr><th>PACIENTE</th><th>OBJETIVO</th><th>ÚLTIMO PESO</th><th>ESTADO</th><th /></tr></thead><tbody>{workspace.patients.slice(0, 4).map((p) => <tr key={p.id} onClick={() => selectPatient(p.id)}><td><div className="table-patient"><Avatar name={p.name} size="small" /><div><strong>{p.name}</strong><span>{p.age} años · {p.sex}</span></div></div></td><td>{p.goal}</td><td><b>{Number(p.weight) > 0 ? `${p.weight} kg` : '—'}</b></td><td><Pill tone={p.status === 'Activo' ? 'green' : 'neutral'}>{p.status}</Pill></td><td><ChevronRight size={15} /></td></tr>)}</tbody></table></div>
              {workspace.patients.length === 0 && <p className="empty-copy dashboard-empty-copy">Los pacientes que registres aparecerán aquí.</p>}
              </section>
            <div className="dashboard-footnote"><ShieldCheck size={14} /> Tu información clínica se almacena únicamente en este dispositivo.</div>
          </div>}

          {page === 'patients' && <div className="inner-page">
            <div className="page-title-row"><div><p className="eyebrow">TU CONSULTORIO</p><h1>Pacientes</h1><p>Gestiona expedientes y acompaña cada proceso. Prueba beta: {workspace.betaPatientRegistrations}/{BETA_PATIENT_LIMIT} registros utilizados.</p></div><button className="button button-primary" onClick={addPatient}><Plus size={17} /> Nuevo paciente</button></div>
            <div className="patient-workspace">
              <section className="surface-card patient-list-card"><div className="list-toolbar"><div><h3>Todos tus pacientes</h3><p>{workspace.patients.length} expedientes</p></div><div className="patient-list-filters"><label className="status-filter"><span className="visually-hidden">Filtrar por estado</span><select value={patientStatusFilter} onChange={(event) => setPatientStatusFilter(event.target.value)}><option>Todos</option><option>Activo</option><option>Inactivo</option></select></label><div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar paciente..." /></div></div></div>
                <div className="patient-list">{filteredPatients.map((p) => <button key={p.id} onClick={() => setWorkspace((current) => ({ ...current, activePatientId: p.id }))} className={`patient-list-row ${patient.id === p.id ? 'selected-patient' : ''}`}><Avatar name={p.name} size="small" /><div><strong>{p.name}</strong><span>{p.goal}</span></div><i className={`status-dot ${p.status === 'Activo' ? '' : 'status-inactive'}`} /></button>)}{!filteredPatients.length && <div className="empty-patients-state"><UsersRound size={20} /><strong>{workspace.patients.length ? 'Sin resultados' : 'Aún no tienes pacientes'}</strong><span>{workspace.patients.length ? 'Ajusta el filtro o la búsqueda.' : 'Crea el primer expediente para comenzar.'}</span>{!workspace.patients.length && <button className="button button-primary button-small" onClick={addPatient}><Plus size={14} /> Nuevo paciente</button>}</div>}</div>
              </section>
              {workspace.patients.length > 0 && <section className="patient-record"><div className="surface-card record-heading"><div className="record-person"><Avatar name={patient.name} /><div><h2>{patient.name}</h2><p>{patient.age} años · {patient.sex} · {patient.email || 'Sin correo registrado'}</p><div className="record-tags"><Pill>{patient.status}</Pill><Pill tone="neutral">{patient.goal}</Pill></div></div></div><button className="button button-quiet button-small" onClick={editPatient}><Settings2 size={15} /> Editar ficha</button></div>
                <div className="record-metrics"><div className="surface-card record-metric"><Scale size={16} /><span>Peso actual</span><strong>{Number(patient.weight) > 0 ? patient.weight : '—'} <small>{Number(patient.weight) > 0 ? 'kg' : ''}</small></strong></div><div className="surface-card record-metric"><Activity size={16} /><span>Estatura</span><strong>{Number(patient.height) > 0 ? patient.height : '—'} <small>{Number(patient.height) > 0 ? 'cm' : ''}</small></strong></div><div className="surface-card record-metric"><Target size={16} /><span>IMC estimado</span><strong>{Number(patient.weight) > 0 && Number(patient.height) > 0 ? (patient.weight / ((patient.height / 100) ** 2)).toFixed(1) : '—'} <small>{Number(patient.weight) > 0 && Number(patient.height) > 0 ? 'kg/m²' : ''}</small></strong></div><div className="surface-card record-metric"><Activity size={16} /><span>Grasa corporal</span><strong>{patient.measurements.at(-1)?.bodyFat ?? '—'} <small>%</small></strong></div><div className="surface-card record-metric"><Activity size={16} /><span>Masa muscular</span><strong>{patient.measurements.at(-1)?.muscle ?? '—'} <small>kg</small></strong></div></div>
                <div className="surface-card record-section"><div className="card-heading card-heading-between"><div><h3>Información clínica</h3><p>Datos relevantes para su acompañamiento</p></div><button className="text-button" onClick={editPatient}>Editar <ArrowRight size={13} /></button></div><div className="clinical-grid"><div><span>Motivo de consulta</span><p>{patient.reason || 'Sin información registrada'}</p></div><div><span>Antecedentes</span><p>{patient.history || 'Sin información registrada'}</p></div><div><span>Alergias</span><p>{patient.allergies || 'Sin información registrada'}</p></div><div><span>Aversiones alimentarias</span><p>{patient.dislikes || 'Sin información registrada'}</p></div></div></div>
                <div className="surface-card record-section"><div className="card-heading card-heading-between"><div><h3>Evolución antropométrica</h3><p>Seguimiento de peso y grasa corporal</p></div><button className="button button-quiet button-small" onClick={() => setModal('measurement')}><Plus size={14} /> Registrar medición</button></div>{patient.measurements.length ? <div className="chart-container record-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={patient.measurements} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}><defs><linearGradient id="recordFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={workspace.professional.color} stopOpacity={0.14} /><stop offset="100%" stopColor={workspace.professional.color} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#edf0ed" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#99a39e', fontSize: 11 }} /><YAxis yAxisId="weight" type="number" domain={['dataMin - 2', 'dataMax + 2']} axisLine={false} tickLine={false} tick={{ fill: '#99a39e', fontSize: 11 }} /><YAxis yAxisId="fat" type="number" orientation="right" domain={[0, 60]} axisLine={false} tickLine={false} tick={{ fill: '#99a39e', fontSize: 10 }} width={30} /><Tooltip formatter={(value, name) => [`${value}${name === 'bodyFat' ? '%' : ' kg'}`, name === 'bodyFat' ? 'Grasa corporal' : 'Peso']} /><Area yAxisId="weight" type="monotone" dataKey="weight" stroke={workspace.professional.color} strokeWidth={2} fill="url(#recordFill)" /><Line type="monotone" dataKey="bodyFat" yAxisId="fat" connectNulls stroke="#d4a579" strokeWidth={2} dot={{ r: 2 }} /></ComposedChart></ResponsiveContainer></div> : <p className="empty-copy">Registra la medición inicial para comenzar el seguimiento antropométrico.</p>}<div className="folds-summary"><span>Pliegues · circunferencias (último registro)</span><strong>{[patient.measurements.at(-1)?.folds, patient.measurements.at(-1)?.circumferences].filter(Boolean).join(' · ') || 'Sin registro'}</strong></div></div>
                <div className="record-actions"><button className="button button-quiet" onClick={() => setModal('plan')}><FileText size={15} /> Previsualizar receta</button><button className="button button-primary" onClick={previewAndPrint}><Printer size={15} /> Imprimir / Descargar PDF</button></div>
              </section>}
            </div>
          </div>}

          {page === 'plans' && <div className="inner-page">
            <div className="page-title-row"><div><p className="eyebrow">DISEÑO Y SEGUIMIENTO</p><h1>Planes nutricionales</h1><p>Diseña menús personalizados y revisa sus objetivos.</p></div><button className="button button-quiet" onClick={() => setModal('plan')}><FileText size={16} /> Previsualizar receta</button></div>
            {workspace.patients.length === 0 && <div className="surface-card empty-patients-state plans-empty-state"><UsersRound size={20} /><strong>Agrega un paciente para diseñar su plan</strong><span>El editor de menús se habilitará cuando crees el primer expediente.</span><button className="button button-primary button-small" onClick={addPatient}><Plus size={14} /> Nuevo paciente</button></div>}
            <div className={`plan-editor-grid ${workspace.patients.length === 0 ? "plan-editor-hidden" : ""}`}><section className="surface-card editor-main"><div className="list-toolbar"><div><h3>Plan semanal de {patient.name}</h3><p>{planDayMenu.length} tiempos de comida · {dayLabel(selectedPlanDay)}</p></div><select className="select-field" value={patient.id ?? ''} onChange={(event) => setWorkspace((current) => ({ ...current, activePatientId: Number(event.target.value) }))}>{workspace.patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div className="plan-day-tabs" role="tablist" aria-label="Días del plan semanal">{WEEK_DAYS.map((day) => <button key={day.key} type="button" role="tab" aria-selected={selectedPlanDay === day.key} className={selectedPlanDay === day.key ? 'plan-day-tab plan-day-tab-selected' : 'plan-day-tab'} onClick={() => setSelectedPlanDay(day.key)}><span>{day.label}</span><small>{patientWeeklyMenu[day.key]?.length || 0}</small></button>)}</div>
              <div className="selected-plan-day-heading"><div><span className="eyebrow">MENÚ DEL DÍA</span><h3>{dayLabel(selectedPlanDay)}</h3></div><span>{planDayMenu.length} {planDayMenu.length === 1 ? 'tiempo' : 'tiempos'} · {dailyCalories.toLocaleString()} kcal</span></div>
              <div className="menu-editor-list">{planDayMenu.map((meal, index) => <article className="editor-meal" key={meal.id}><div className="editor-meal-number">{String(index + 1).padStart(2, '0')}</div><div className="editor-meal-fields"><div className="editor-meal-top"><select className="meal-time-select" value={meal.time} onChange={(event) => updateMeal(meal.id, { time: event.target.value })} aria-label="Tiempo de comida">{!MEAL_TIMES.includes(meal.time) && <option value={meal.time}>{meal.time}</option>}{MEAL_TIMES.map((time) => <option key={time} value={time}>{time}</option>)}</select><span className="meal-calorie-input"><Flame size={13} /><input type="number" value={meal.calories} onChange={(event) => updateMeal(meal.id, { calories: Number(event.target.value) })} /> kcal</span><button type="button" className="icon-button danger-hover" onClick={() => updatePatient({ weeklyMenu: { ...patientWeeklyMenu, [selectedPlanDay]: planDayMenu.filter((item) => item.id !== meal.id) } })} aria-label="Eliminar tiempo"><Trash2 size={15} /></button></div><input className="meal-title-input" value={meal.title} onChange={(event) => updateMeal(meal.id, { title: event.target.value })} aria-label="Platillo" /><textarea value={meal.items.join('\n')} onChange={(event) => updateMeal(meal.id, { items: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} aria-label="Ingredientes, uno por línea" rows={Math.min(4, Math.max(2, meal.items.length))} /><div className="meal-macros">{[['Proteína (g)', 'protein'], ['Carbohidratos (g)', 'carbs'], ['Grasas (g)', 'fat']].map(([label, key]) => <label key={key}>{label}<input type="number" value={meal[key] ?? 0} onChange={(event) => updateMeal(meal.id, { [key]: Number(event.target.value) })} /></label>)}</div><div className="editor-meal-meta"><Clock3 size={13} /><input value={meal.hour} onChange={(event) => updateMeal(meal.id, { hour: event.target.value })} aria-label="Hora" /><span>·</span><select value={meal.department} onChange={(event) => updateMeal(meal.id, { department: event.target.value })} aria-label="Departamento de compra"><option>Frutas y verduras</option><option>Lácteos</option><option>Carnes y proteínas</option><option>Cereales</option><option>Otros</option></select></div><div className="meal-image-editor">{meal.image && <div className="meal-image-preview"><img src={meal.image} alt={`Vista previa de ${meal.title || 'platillo'}`} /><button type="button" className="icon-button danger-hover" aria-label="Quitar imagen" onClick={() => updateMeal(meal.id, { image: '' })}><X size={14} /></button></div>}<label className="meal-image-upload"><ImagePlus size={14} />{meal.image ? 'Cambiar imagen' : 'Agregar imagen (opcional)'}<input type="file" accept="image/*" onChange={async (event) => { const input = event.currentTarget; const file = input.files?.[0]; if (!file) return; try { updateMeal(meal.id, { image: await readMealImage(file) }) } catch (error) { setToast(error.message) } finally { input.value = '' } }} /></label><small>La imagen se guarda localmente y se incluye en el PDF. Máximo 2 MB por archivo.</small></div></div></article>)}{!planDayMenu.length && <div className="empty-plan-day"><Utensils size={18} /><span>Agrega los tiempos de comida de {dayLabel(selectedPlanDay).toLowerCase()}.</span></div>}<button className="add-meal-button" onClick={addMeal}><Plus size={16} /> Agregar tiempo de comida</button></div>
              <div className="editor-footer"><div><span>Estimado de {dayLabel(selectedPlanDay)}</span><strong>{dailyCalories.toLocaleString()} <small>/ {patient.targets.calories.toLocaleString()} kcal</small></strong><div className="macro-totals">{[['Prot.', dailyMacros.protein, patient.targets.protein], ['Carb.', dailyMacros.carbs, patient.targets.carbs], ['Grasas', dailyMacros.fat, patient.targets.fat]].map(([label, total, target]) => <span key={label}>{label} <b>{total}/{target} g</b></span>)}</div></div><button className="button button-primary" onClick={() => setModal('plan')}><FileText size={15} /> Previsualizar plan semanal</button><button className="button button-quiet" onClick={previewAndPrint}><Printer size={15} /> Imprimir / Descargar PDF</button></div>
            </section><aside className="plan-sidebar"><section className="surface-card target-card"><div className="card-heading"><div className="card-title-icon"><Target size={16} /></div><div><h3>Objetivos diarios</h3><p>Personaliza metas calóricas</p></div></div><label className="field macro-mode-select"><span>Distribución de macros</span><select value={macroMode} onChange={(event) => setMacroMode(event.target.value)}><option value="grams">Gramos</option><option value="percent">% de energía</option><option value="gkg">g/kg de peso</option></select></label><label className="field"><span>Paciente</span><select value={patient.id ?? ''} onChange={(event) => setWorkspace((current) => ({ ...current, activePatientId: Number(event.target.value) }))}>{workspace.patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div className="target-calories"><Field label="Energía (kcal)" value={patient.targets.calories} type="number" onChange={(value) => updatePatient({ targets: { ...patient.targets, calories: Number(value) } })} /><button className="text-button" onClick={() => setModal('calculator')}><Sparkles size={13} /> Calcular requerimiento</button></div><div className="macro-fields">{[['Proteína', 'protein'], ['Carbohidratos', 'carbs'], ['Grasas', 'fat']].map(([label, key]) => <Field key={key} label={`${label} (${macroUnit})`} value={macroDisplayValue(key)} type="number" onChange={(value) => updateMacro(key, value)} />)}</div><div className="macro-summary">{[['Proteína', 'protein', '#347c62'], ['Carbohidratos', 'carbs', '#e1a56f'], ['Grasas', 'fat', '#a98dc7']].map(([label, key, color]) => <div key={label}><span><i style={{ background: color }} />{label}</span><b>{macroDisplayValue(key) || '—'} {macroUnit}</b></div>)}</div><p className="muted-note">{macroMode === 'gkg' && Number(patient.weight) <= 0 ? 'Registra primero la medición inicial para distribuir macros por kg de peso.' : 'Estimaciones orientativas. Ajusta las metas según tu criterio profesional.'}</p></section></aside></div>
            <section className="surface-card menu-library-section">
              <div className="menu-library-heading"><div><div className="card-title-icon mint"><NotebookTabs size={16} /></div><div><h2>Biblioteca y creación de menús</h2><p>Crea menús independientes, ajusta los guardados o aplícalos después a un día del plan.</p></div></div><div className="menu-library-actions"><button className="button button-quiet button-small" onClick={() => openMenuTemplateEditor()}><Plus size={14} /> Crear menú</button><button className="button button-primary button-small" disabled={!workspace.patients.length || !planDayMenu.length} onClick={() => openMenuTemplateEditor({ id: `menu-${Date.now()}`, name: `Menú de ${patient.name} · ${dayLabel(selectedPlanDay)}`, description: `Guardado desde el plan del ${dayLabel(selectedPlanDay)}.`, menu: planDayMenu })}><Save size={14} /> Guardar este día</button></div></div>
              <div className="menu-template-grid">{templates.map((template) => {
                const calories = template.menu.reduce((total, meal) => total + Number(meal.calories || 0), 0)
                return <article className="template-card" key={template.id || template.name}><div><strong>{template.name}</strong><span>{template.description || `${template.menu.length} tiempos de comida`} · {calories.toLocaleString()} kcal</span></div><div className="template-card-actions"><button className="text-button" onClick={() => openMenuTemplateEditor(template)}><Pencil size={13} /> Editar</button><button className="text-button" onClick={() => { setTemplatePreview(template); setModal('menu-template') }}>Ver menú <ChevronRight size={13} /></button></div></article>
              })}</div>
            </section>
          </div>}

          {page === 'foods' && <div className="inner-page"><div className="page-title-row"><div><p className="eyebrow">BASE DE DATOS LOCAL</p><h1>Alimentos</h1><p>Catálogo de referencia por cada 100 g, guardado en este dispositivo.</p></div><button className="button button-primary" onClick={addFood}><Plus size={16} /> Agregar alimento</button></div><section className="surface-card food-library"><div className="list-toolbar"><div><h3>Biblioteca de alimentos</h3><p>{workspace.foods.length} alimentos · base USDA y alimentos propios</p></div><div className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar alimento..." /></div></div><div className="food-table-wrap"><table className="patient-table food-table"><thead><tr><th>ALIMENTO</th><th>PORCIÓN</th><th>ENERGÍA</th><th>PROTEÍNA</th><th>CARBOHIDRATOS</th><th>LÍPIDOS</th><th>SODIO</th><th>CALCIO</th><th>HIERRO</th><th /></tr></thead><tbody>{workspace.foods.map((food, index) => ({ food, index })).filter(({ food }) => food.name.toLowerCase().includes(search.toLowerCase())).map(({ food, index }) => <tr key={`${food.name}-${index}`}><td><div className="food-name"><span className="food-icon"><Apple size={15} /></span><div><b>{food.name}</b><span>{food.category} · {food.source || 'Dato ingresado manualmente'}</span></div></div></td><td>{food.portion}</td><td><b>{food.calories}</b> kcal</td><td>{food.protein} g</td><td>{food.carbs} g</td><td>{food.fat} g</td><td>{food.sodium} mg</td><td>{food.calcium} mg</td><td>{food.iron} mg</td><td><button className="icon-button" onClick={() => editFood(index)} aria-label={`Editar ${food.name}`}><Settings2 size={14} /></button></td></tr>)}</tbody></table></div></section><p className="food-disclaimer"><CircleHelp size={14} /> Referencias de USDA FoodData Central, conjunto SR Legacy. Son valores genéricos, no sustituyen etiquetas comerciales ni valoración profesional. <a href="https://fdc.nal.usda.gov/download-datasets/" target="_blank" rel="noreferrer">Consultar fuente USDA</a></p></div>}

          {page === 'settings' && <div className="inner-page settings-page">
            <div className="page-title-row"><div><p className="eyebrow">VITTACORE EN TU DISPOSITIVO</p><h1>Configuración</h1><p>Tu identidad profesional y tu estrategia de respaldo local.</p></div></div>
            <div className="settings-layout">
              <section className="surface-card settings-card">
                <div className="card-heading"><div className="card-title-icon"><Settings2 size={16} /></div><div><h3>Identidad profesional</h3><p>Esta información se aplica a expedientes y reportes.</p></div></div>
                <div className="settings-form">
                  <Field label="Nombre completo del nutriólogo" value={workspace.professional.name} onChange={(value) => updateProfessional({ name: value })} />
                  <Field label="Cédula profesional" value={workspace.professional.license} onChange={(value) => updateProfessional({ license: value })} />
                  <Field label="Consultorio / clínica" value={workspace.professional.officeName} onChange={(value) => updateProfessional({ officeName: value })} />
                  <Field label="Eslogan" value={workspace.professional.tagline} onChange={(value) => updateProfessional({ tagline: value })} />
                  <Field label="Teléfono" value={workspace.professional.phone} onChange={(value) => updateProfessional({ phone: value })} />
                  <Field label="Correo electrónico" type="email" value={workspace.professional.email} onChange={(value) => updateProfessional({ email: value })} />
                  <Field label="Redes sociales" value={workspace.professional.social} onChange={(value) => updateProfessional({ social: value })} />
                  <Field label="Dirección / enlace de consulta" value={workspace.professional.address} onChange={(value) => updateProfessional({ address: value })} />
                </div>
                <div className="branding-options">
                  <label className="field"><span>Color principal de reportes</span><div className="color-control"><input type="color" value={workspace.professional.color} onChange={(event) => updateProfessional({ color: event.target.value })} /><span>{workspace.professional.color}</span></div></label>
                  <label className="field"><span>Logotipo (URL segura o imagen)</span><div className="logo-upload"><ImagePlus size={17} /><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) { setToast('El logotipo debe pesar menos de 1 MB.'); return } const reader = new FileReader(); reader.onload = () => updateProfessional({ logo: reader.result }); reader.onerror = () => setToast('No se pudo leer el logotipo.'); reader.readAsDataURL(file) }} />{workspace.professional.logo && <img src={workspace.professional.logo} alt="Vista previa del logotipo" />}</div></label>
                </div>
                <Field label="URL del logotipo (https)" value={logoUrlDraft} onChange={setLogoUrlDraft} onBlur={() => { if (!logoUrlDraft) { updateProfessional({ logo: '' }); return } try { const url = new URL(logoUrlDraft); if (url.protocol !== 'https:') throw new Error(''); updateProfessional({ logo: logoUrlDraft }) } catch { setToast('Usa un enlace HTTPS válido para el logotipo.'); setLogoUrlDraft(workspace.professional.logo?.startsWith('data:') ? '' : workspace.professional.logo || '') } }} placeholder="https://..." />
                <div className="settings-save"><span><CheckCircle2 size={14} /> Los cambios se guardan automáticamente.</span></div>
              </section>
              <aside className="settings-preview">
                <div className="surface-card preview-card"><p className="eyebrow">VISTA PREVIA DE MARCA</p><div className="preview-logo">{workspace.professional.logo ? <img src={workspace.professional.logo} alt="" /> : <span className="brand-mark"><Leaf size={19} /></span>}<div><strong>{workspace.professional.officeName || 'Nombre del consultorio'}</strong><small>{workspace.professional.name} · {workspace.professional.license}</small></div></div><div className="preview-divider" /><p className="preview-tagline">{workspace.professional.tagline}</p><span className="preview-color" style={{ background: workspace.professional.color }} /><div className="preview-contact"><span>{workspace.professional.phone}</span><span>{workspace.professional.email}</span><span>{workspace.professional.social}</span><span>{workspace.professional.address}</span></div><button className="text-button" onClick={() => setModal('plan')}>Previsualizar receta <ArrowRight size={13} /></button></div>
                <section className="surface-card access-settings-card"><div className="card-heading"><div className="card-title-icon"><LockKeyhole size={16} /></div><div><h3>Acceso local</h3><p>Contraseña para abrir tu consultorio</p></div></div><p>La contraseña bloquea la interfaz de VittaCore en este navegador. No cifra la información guardada en el dispositivo.</p><button className="button button-quiet button-small" onClick={() => setModal('change-password')}>Cambiar contraseña</button></section>
                <section className="surface-card backup-settings-card">
                  <div className="card-heading"><div className="card-title-icon"><ShieldCheck size={16} /></div><div><h3>Respaldo automático</h3><p>Archivo local actualizado en segundo plano</p></div></div>
                  <div className={`backup-status backup-status-${backupState}`} role="status"><i /><span><strong>{backupConnectionStatus}</strong><small>{backupStatusText}</small></span></div>
                  {backupState === 'error' && <p className="form-error">{backupError}</p>}
                  {!supportsDirectoryPicker() && <p className="backup-browser-note">El respaldo manual sigue disponible. El acceso a carpetas locales requiere un navegador compatible y un origen seguro (localhost o HTTPS).</p>}
                  <div className="backup-settings-actions">
                    {supportsDirectoryPicker() && <button className="button button-quiet button-small" onClick={connectBackupFolder}><FolderOpen size={14} />{directoryHandle ? 'Cambiar carpeta' : 'Elegir carpeta'}</button>}
                    {backupState === 'permission-required' && <button className="button button-quiet button-small" onClick={requestBackupPermission}><ShieldCheck size={14} />Restablecer acceso</button>}
                    {directoryHandle && <button className="button button-quiet button-small" onClick={disconnectBackupFolder}>Desconectar</button>}
                  </div>
                  <div className="backup-settings-actions"><button className="button button-primary button-small" onClick={exportBackup}><Download size={14} /> Descargar respaldo JSON</button><button className="button button-quiet button-small" onClick={() => importRef.current?.click()}><Upload size={14} /> Importar respaldo</button></div>
                  <input ref={importRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={importBackup} />
                  <p className="backup-browser-note">Los datos locales y archivos JSON no están cifrados. Resguarda el dispositivo y la carpeta de respaldo.</p>
                </section>
              </aside>
            </div>
          </div>}
        </div>
      </main>

      {modal === 'plan' && <Modal title="Vista previa del plan" subtitle="Así se verá el documento para tu paciente." onClose={() => setModal(null)} wide><NutritionPlan patient={patient} professional={workspace.professional} onClose={() => setModal(null)} onPrint={printPlan} onEmail={emailPlan} onWhatsApp={whatsAppPlan} /></Modal>}
      {modal === 'backup' && <Modal title="Copia de seguridad" subtitle="Tus datos viven en este dispositivo. Exporta una copia para conservarlos." onClose={() => setModal(null)}><div className="backup-modal-content"><div className="backup-explainer"><div className="backup-icon"><ShieldCheck size={19} /></div><div><strong>Almacenamiento local</strong><p>Pacientes, planes, alimentos e identidad profesional se guardan en este navegador y no se envían a un servidor. El navegador y los archivos JSON no cifran estos datos; protege el acceso al dispositivo y a las copias.</p></div></div><button className="backup-action" onClick={exportBackup}><span className="backup-action-icon"><Download size={18} /></span><span><b>Exportar respaldo JSON</b><small>Descarga una copia completa de tus datos</small></span><ArrowRight size={16} /></button><button className="backup-action" onClick={() => importRef.current?.click()}><span className="backup-action-icon"><Upload size={18} /></span><span><b>Importar respaldo JSON</b><small>Restaura datos desde un respaldo existente</small></span><ArrowRight size={16} /></button><input ref={importRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={importBackup} /><div className="backup-warning"><CircleHelp size={14} /><span>Al importar se reemplazarán los datos guardados actualmente.</span></div></div></Modal>}
      {modal === 'beta-limit' && <Modal title="Periodo de prueba terminado" subtitle={`La beta de VittaCore permite registrar hasta ${BETA_PATIENT_LIMIT} pacientes.`} onClose={() => setModal(null)}><div className="beta-limit-content"><p>Ya utilizaste los {BETA_PATIENT_LIMIT} registros incluidos en esta versión de prueba. Puedes seguir consultando y editando los expedientes existentes.</p><div className="beta-limit-count">{workspace.betaPatientRegistrations} de {BETA_PATIENT_LIMIT} registros utilizados</div><div className="modal-actions"><button className="button button-primary" onClick={() => setModal(null)}>Entendido</button></div></div></Modal>}
      {modal === 'patient' && patientDraft && <Modal title={isCreatingPatient ? 'Nuevo paciente' : 'Editar ficha del paciente'} subtitle={isCreatingPatient ? 'Completa los datos básicos para crear el expediente.' : 'Actualiza la información clínica y de contacto.'} onClose={closePatientForm} wide><PatientForm key={patientDraft.id} patient={patientDraft} onSave={savePatientForm} onClose={closePatientForm} /></Modal>}
      {modal === 'appointment' && appointmentDraft && <Modal title="Agendar una cita" subtitle="Registra la fecha, hora y modalidad de la consulta." onClose={() => { setModal(null); setAppointmentDraft(null) }}><AppointmentForm appointment={appointmentDraft} patients={workspace.patients} onSave={saveAppointment} onClose={() => { setModal(null); setAppointmentDraft(null) }} /></Modal>}
      {modal === 'change-password' && <Modal title="Cambiar contraseña" subtitle="Confirma tu contraseña actual y crea una nueva de al menos 8 caracteres." onClose={() => setModal(null)}><ChangePasswordForm onClose={() => setModal(null)} onChanged={onPasswordChanged} /></Modal>}
      {modal === 'measurement' && <Modal title="Registrar medición" subtitle={`Nueva medición para ${patient.name}.`} onClose={() => setModal(null)}><MeasurementForm patient={patient} onSave={(measurement) => { updatePatient({ weight: measurement.weight, height: measurement.height, measurements: [...patient.measurements, measurement] }); setModal(null); setToast('Medición antropométrica registrada.') }} /></Modal>}
      {modal === 'calculator' && <Modal title="Requerimiento calórico" subtitle="Estimación orientativa para apoyar tu criterio profesional." onClose={() => setModal(null)}><div className="calculator-form"><label className="field"><span>Fórmula</span><select value={calculator.formula} onChange={(event) => setCalculator({ ...calculator, formula: event.target.value })}><option value="mifflin">Mifflin–St Jeor</option><option value="harris">Harris–Benedict</option></select></label><label className="field"><span>Actividad</span><select value={calculator.activity} onChange={(event) => setCalculator({ ...calculator, activity: Number(event.target.value) })}><option value="1.2">Sedentaria · 1.2</option><option value="1.375">Ligera · 1.375</option><option value="1.55">Moderada · 1.55</option><option value="1.725">Alta · 1.725</option><option value="1.9">Muy alta · 1.9</option></select></label><div className="calculator-result"><span>Requerimiento estimado</span><strong>{estimatedCalories === null ? '—' : Math.round(estimatedCalories * calculator.activity).toLocaleString()} <small>{estimatedCalories === null ? '' : 'kcal / día'}</small></strong><p>{estimatedCalories === null ? 'Registra la edad y la medición inicial de peso y estatura para calcular el requerimiento.' : 'Estimación basada en edad, peso, estatura y sexo registrados. Corrobora y ajusta según el contexto clínico.'}</p></div></div><div className="modal-actions"><button className="button button-quiet" onClick={() => setModal(null)}>Cancelar</button><button className="button button-primary" disabled={estimatedCalories === null} onClick={() => { const calories = Math.round(estimatedCalories * calculator.activity); updatePatient({ targets: { ...patient.targets, calories } }); setModal(null); setToast(`Meta calórica actualizada a ${calories} kcal.`) }}>Aplicar al plan <ArrowRight size={14} /></button></div></Modal>}
      {modal === 'menu-template-editor' && templateDraft && <Modal title={templates.some((template) => template.id === templateDraft.id) ? 'Editar menú' : 'Crear menú'} subtitle="Guarda y modifica una plantilla independiente del plan del paciente." onClose={() => { setModal(null); setTemplateDraft(null) }} wide><MenuTemplateForm key={templateDraft.id} template={templateDraft} onCancel={() => { setModal(null); setTemplateDraft(null) }} onSave={saveMenuTemplate} /></Modal>}
      {modal === 'menu-template' && templatePreview && <Modal title={templatePreview.name} subtitle={templatePreview.description || 'Plantilla de menú'} onClose={() => { setModal(null); setTemplatePreview(null) }} wide><div className="menu-template-preview"><div className="template-summary"><strong>{templatePreview.menu.reduce((total, meal) => total + Number(meal.calories || 0), 0).toLocaleString()} kcal</strong><span>estimadas · {templatePreview.menu.length} tiempos</span></div>{templatePreview.menu.map((meal, index) => <article key={`${meal.id || templatePreview.id}-${index}`}><div><span>{meal.time} · {meal.hour}</span><strong>{meal.title}</strong><p>{meal.items.join(' · ')}</p></div><b>{meal.calories} kcal</b></article>)}</div><p className="template-disclaimer">Menú de ejemplo: las porciones y valores son orientativos. Revisa alergias, preferencias y necesidades clínicas antes de asignarlo.</p><div className="modal-actions"><button className="button button-quiet" onClick={() => { setModal(null); setTemplatePreview(null) }}>Cerrar</button><button className="button button-primary" onClick={applyMenuTemplate}><Check size={15} /> Aplicar al plan de {patient.name}</button></div></Modal>}
      {modal === 'food' && foodDraft && <Modal title={foodIndex === null ? 'Agregar alimento' : 'Editar alimento'} subtitle="Los valores se guardan en la base de datos de este dispositivo." onClose={() => setModal(null)} wide><div className="patient-edit-form"><Field label="Nombre" value={foodDraft.name} onChange={(value) => setFoodDraft({ ...foodDraft, name: value })} /><Field label="Porción de referencia" value={foodDraft.portion} onChange={(value) => setFoodDraft({ ...foodDraft, portion: value })} /><label className="field"><span>Categoría</span><select value={foodDraft.category} onChange={(event) => setFoodDraft({ ...foodDraft, category: event.target.value })}><option>Proteínas</option><option>Cereales</option><option>Frutas y verduras</option><option>Lácteos</option><option>Grasas</option><option>Otros</option></select></label>{[['Energía (kcal)', 'calories'], ['Proteína (g)', 'protein'], ['Carbohidratos (g)', 'carbs'], ['Lípidos (g)', 'fat'], ['Sodio (mg)', 'sodium'], ['Calcio (mg)', 'calcium'], ['Hierro (mg)', 'iron']].map(([label, key]) => <Field key={key} label={label} type="number" value={foodDraft[key]} onChange={(value) => setFoodDraft({ ...foodDraft, [key]: Number(value) })} />)}</div><div className="modal-actions"><button className="button button-quiet" onClick={() => setModal(null)}>Cancelar</button><button className="button button-primary" onClick={saveFood}><Check size={15} /> Guardar alimento</button></div></Modal>}
      {!setupComplete && <Onboarding
        draft={setupDraft}
        setDraft={setSetupDraft}
        onSaveIdentity={saveOnboardingIdentity}
        onChooseFolder={chooseBackupFolder}
        onContinueWithoutFolder={finishOnboarding}
        folderSupported={supportsDirectoryPicker()}
        folderStatus={backupStatusText}
      />}
      {toast && <div className="toast"><CheckCircle2 size={16} />{toast}<button onClick={() => setToast('')} aria-label="Cerrar aviso"><X size={14} /></button></div>}
    </div>
  )
}

function calculation(patient, calculator) {
  const weight = Number(patient.weight)
  const height = Number(patient.height)
  const age = Number(patient.age)
  if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(height) || height <= 0 || !Number.isInteger(age) || age < 1 || age > 120) return null
  const isMale = patient.sex === 'Hombre'
  if (calculator.formula === 'mifflin') return 10 * weight + 6.25 * height - 5 * age + (isMale ? 5 : -161)
  return isMale
    ? 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age
    : 447.593 + 9.247 * weight + 3.098 * height - 4.33 * age
}

function MeasurementForm({ patient, onSave }) {
  const lastMeasurement = patient.measurements.at(-1)
  const [weight, setWeight] = useState(lastMeasurement?.weight ?? '')
  const [bodyFat, setBodyFat] = useState(patient.measurements.at(-1)?.bodyFat ?? '')
  const [muscle, setMuscle] = useState('')
  const [folds, setFolds] = useState('')
  const [circumferences, setCircumferences] = useState('')
  const [height, setHeight] = useState(lastMeasurement?.height ?? '')
  const [error, setError] = useState('')
  const submit = (event) => {
    event.preventDefault()
    if (!Number.isFinite(Number(weight)) || Number(weight) <= 0 || !Number.isFinite(Number(height)) || Number(height) <= 0) { setError('Ingresa un peso y una estatura válidos.'); return }
    onSave({ date: new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }), weight: Number(weight), height: Number(height), bodyFat: bodyFat === '' ? null : Number(bodyFat), muscle: muscle === '' ? null : Number(muscle), folds: folds.trim(), circumferences: circumferences.trim() })
  }
  return <form className="measurement-form" onSubmit={submit}><div className="patient-edit-form"><Field label="Peso (kg)" value={weight} type="number" onChange={setWeight} /><Field label="Estatura (cm)" value={height} type="number" onChange={setHeight} /><Field label="Grasa corporal (%)" value={bodyFat} type="number" onChange={setBodyFat} /><Field label="Masa muscular (kg)" value={muscle} type="number" onChange={setMuscle} /><Field label="Pliegues cutáneos (mm)" value={folds} onChange={setFolds} placeholder="Tricipital, subescapular..." /><Field label="Circunferencias (cm)" value={circumferences} onChange={setCircumferences} placeholder="Cintura 78, cadera 96..." /></div>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setError('')}>Limpiar error</button><button type="submit" className="button button-primary"><Check size={15} /> Guardar medición</button></div></form>
}

export default App
