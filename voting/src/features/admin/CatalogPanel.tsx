import { useState } from 'react'
import { he } from '../../i18n/he'
import { money } from '../../lib/format'
import type { LegacyProduct } from '../../data/legacy'
import { Card, Field, SectionHeader } from '../../ui/components'
import { useAdmin } from './context'

type NewProduct = Pick<LegacyProduct, 'name' | 'emoji' | 'cat' | 'price' | 'max'>

export function CatalogPanel() {
  const { config, store } = useAdmin()
  const [products, setProducts] = useState<LegacyProduct[]>(() => config.products.map((p) => ({ ...p })))
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const update = <K extends keyof LegacyProduct>(id: string, field: K, val: LegacyProduct[K]) => {
    setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, [field]: val } : p)))
    setDirty(true)
  }
  const remove = (id: string) => {
    if (!confirm(he.confirmRemoveProduct)) return
    setProducts((ps) => ps.filter((p) => p.id !== id))
    setDirty(true)
  }
  const add = (p: NewProduct) => {
    setProducts((ps) => [...ps, { ...p, id: `p-${Date.now()}` }])
    setAdding(false)
    setDirty(true)
  }
  const save = async () => {
    setSaving(true)
    try {
      await store.updateConfigField('products', products)
      setDirty(false)
      alert(he.catalogSaved)
    } catch (e) {
      alert(he.errorPrefix + (e instanceof Error ? e.message : String(e)))
    } finally { setSaving(false) }
  }

  return (
    <div>
      <SectionHeader title={he.catalogTitle} subtitle={he.catalogSubtitle(products.length)} />
      <div className="toolbar">
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>{he.addProduct}</button>
        {dirty && <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? he.saving : `💾 ${he.saveChanges}`}</button>}
        {dirty && <span className="txt-over small" role="status">• {he.unsaved}</span>}
      </div>
      {adding && <NewProductForm onSave={add} onCancel={() => setAdding(false)} />}
      <Card>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>{he.colIcon}</th><th>{he.colName}</th><th>{he.colCategory}</th><th>{he.priceShekel}</th><th>{he.colMax}</th><th>{he.catalogOffered}</th><th /></tr></thead>
            <tbody>
              {products.map((p) => {
                const ed = editing === p.id
                return (
                  <tr key={p.id}>
                    <td>{ed ? <input aria-label={he.colIcon} className="input input-emoji" value={p.emoji} onChange={(e) => update(p.id, 'emoji', e.target.value)} /> : <span style={{ fontSize: 22 }} aria-hidden>{p.emoji}</span>}</td>
                    <td className="cell-strong">{ed ? <input aria-label={he.colName} className="input" value={p.name} onChange={(e) => update(p.id, 'name', e.target.value)} /> : p.name}</td>
                    <td>
                      {ed
                        ? <select aria-label={he.colCategory} className="input" value={p.cat} onChange={(e) => update(p.id, 'cat', e.target.value)}><option value="dry">{he.catDry}</option><option value="fresh">{he.catFresh}</option></select>
                        : <span className={`cat-badge${p.cat === 'fresh' ? ' fresh' : ''}`}>{p.cat === 'fresh' ? he.catFresh : he.catDry}</span>}
                    </td>
                    <td>{ed ? <input aria-label={he.priceShekel} type="number" step="0.01" min="0" className="input input-num" value={p.price} onChange={(e) => update(p.id, 'price', parseFloat(e.target.value) || 0)} /> : money(p.price)}</td>
                    <td>{ed ? <input aria-label={he.colMax} type="number" min="1" className="input input-num" value={p.max} onChange={(e) => update(p.id, 'max', parseInt(e.target.value, 10) || 1)} /> : p.max}</td>
                    <td>
                      <label className="offered-toggle">
                        <input type="checkbox" checked={p.active !== false} onChange={(e) => update(p.id, 'active', e.target.checked)} aria-label={`${he.catalogOffered}: ${p.name}`} />
                        <span className={p.active !== false ? 'txt-ok' : 'muted'}>{p.active !== false ? he.catalogOffered : he.catalogHidden}</span>
                      </label>
                    </td>
                    <td>
                      <div className="row-actions">
                        {ed
                          ? <button type="button" className="btn btn-small" onClick={() => setEditing(null)}>{he.saveDone}</button>
                          : <>
                              <button type="button" className="btn btn-small" onClick={() => setEditing(p.id)}>{he.edit}</button>
                              <button type="button" className="btn btn-small btn-danger" onClick={() => remove(p.id)}>{he.remove}</button>
                            </>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function NewProductForm({ onSave, onCancel }: { onSave: (p: NewProduct) => void; onCancel: () => void }) {
  const [p, setP] = useState<NewProduct>({ name: '', emoji: '🍽️', cat: 'dry', price: 5, max: 10 })
  return (
    <div className="form-row">
      <Field label={he.colIcon}><input className="input input-emoji" value={p.emoji} onChange={(e) => setP({ ...p, emoji: e.target.value })} /></Field>
      <Field label={he.productName} grow><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
      <Field label={he.colCategory}><select className="input" value={p.cat} onChange={(e) => setP({ ...p, cat: e.target.value })}><option value="dry">{he.catDry}</option><option value="fresh">{he.catFresh}</option></select></Field>
      <Field label={he.colPrice}><input type="number" step="0.01" min="0" className="input input-num" value={p.price} onChange={(e) => setP({ ...p, price: parseFloat(e.target.value) || 0 })} /></Field>
      <Field label={he.colMax}><input type="number" min="1" className="input input-num" value={p.max} onChange={(e) => setP({ ...p, max: parseInt(e.target.value, 10) || 1 })} /></Field>
      <button type="button" className="btn btn-primary" onClick={() => p.name.trim() && onSave({ ...p, name: p.name.trim() })}>{he.add}</button>
      <button type="button" className="btn btn-small" onClick={onCancel}>{he.cancel}</button>
    </div>
  )
}
