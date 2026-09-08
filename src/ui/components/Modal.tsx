import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): React.ReactElement {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="row between"><h3 className="title">{title}</h3><button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
