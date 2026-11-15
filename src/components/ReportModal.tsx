import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ReportModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function ReportModal({ title, subtitle, onClose, children, footer, wide = false }: ReportModalProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return createPortal(
    <div className="report-modal-overlay" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`report-modal-panel${wide ? ' report-modal-panel-wide' : ''}`}
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="report-modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="report-modal-close" aria-label="Fechar" onClick={onClose}><X size={22} /></button>
        </header>
        <div className="report-modal-body">{children}</div>
        <footer className="report-modal-footer">
          {footer}
          <button type="button" className="report-modal-action" onClick={onClose}>Fechar</button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
