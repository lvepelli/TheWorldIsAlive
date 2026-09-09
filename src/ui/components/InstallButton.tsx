import React, { useState } from 'react';
import { useInstallState, install } from '../install';

/** Shows an install button (Android/desktop) or an iOS hint; renders nothing when installed/unsupported. */
export function InstallButton({ compact = false }: { compact?: boolean }): React.ReactElement | null {
  const state = useInstallState();
  const [hint, setHint] = useState(false);
  if (state === 'installed' || state === 'none') return null;
  if (state === 'prompt') return <button className={`btn ${compact ? 'sm' : ''}`} onClick={() => void install()}>📲 Install app</button>;
  return (
    <span className="col" style={{ gap: 4, alignItems: compact ? 'flex-start' : 'center' }}>
      <button className={`btn ${compact ? 'sm' : ''}`} onClick={() => setHint(!hint)}>📲 Add to Home Screen</button>
      {hint && <span className="dim" style={{ fontSize: 12 }}>In Safari: tap Share ⎙, then “Add to Home Screen”. The game then opens full-screen and works offline.</span>}
    </span>
  );
}
