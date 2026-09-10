import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
export default function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement
    const first = ref.current?.querySelector<HTMLElement>('button, input, select, textarea')
    first?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') {
        const elements = ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex="0"]')
        if (!elements?.length) return
        if (e.shiftKey && document.activeElement === elements[0]) { e.preventDefault(); elements[elements.length - 1].focus() }
        else if (!e.shiftKey && document.activeElement === elements[elements.length - 1]) { e.preventDefault(); elements[0].focus() }
      }
    }
    document.addEventListener('keydown', key)
    const old = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = old; previous?.focus() }
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`modal ${wide ? 'modal-wide' : ''}`}><header className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></header>{children}</div></div>
}
