/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowLeft, Home, Play, Save, FolderOpen, Settings, RotateCcw, HelpCircle, LogOut, Volume2, VolumeX, Maximize2, Minimize2, Brain, Wrench, X } from 'lucide-react';

/**
 * Shared V14 navigation chrome. Every secondary screen uses ScreenHeader, so Back and Home are always in the same place.
 */

export const ScreenHeader: React.FC<{
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onHome?: () => void;
  right?: React.ReactNode;
}> = ({ title, subtitle, onBack, onHome, right }) => (
  <header className="sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-2 bg-nx-bg/95 py-1.5 backdrop-blur" data-testid="screen-header">
    {onBack ? (
      <button onClick={onBack} className="nx-btn nx-btn-ghost nx-icon-btn shrink-0" aria-label="Back" data-testid="nav-back" title="Back (Esc)">
        <ArrowLeft className="h-5 w-5" />
      </button>
    ) : (
      <span className="w-10 shrink-0" />
    )}
    <div className="min-w-0 flex-1 text-center">
      <h1 className="nx-title truncate">{title}</h1>
      {subtitle && <p className="truncate text-[11px] text-nx-text2">{subtitle}</p>}
    </div>
    {right}
    {onHome ? (
      <button onClick={onHome} className="nx-btn nx-btn-ghost nx-icon-btn shrink-0" aria-label="Main menu" data-testid="nav-home" title="Main menu">
        <Home className="h-5 w-5" />
      </button>
    ) : (
      <span className="w-10 shrink-0" />
    )}
  </header>
);

/** Centered dialog shell for overlays over the game (pause, confirm, help). */
export const OverlayShell: React.FC<{ children: React.ReactNode; onDismiss?: () => void; wide?: boolean; testId?: string }> = ({ children, onDismiss, wide, testId }) => (
  <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 p-3 sm:items-center nx-fade" onClick={onDismiss} data-testid={testId}
    style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
    <div className={`nx-panel nx-rise w-full ${wide ? 'max-w-2xl' : 'max-w-sm'} max-h-full overflow-y-auto p-4 text-nx-text`} onClick={e => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

export interface ConfirmOption { label: string; tone?: 'primary' | 'danger' | 'default'; onSelect: () => void; testId?: string }

export const ConfirmDialog: React.FC<{ title: string; message: string; options: ConfirmOption[]; onCancel: () => void }> = ({ title, message, options, onCancel }) => (
  <OverlayShell onDismiss={onCancel} testId="confirm-dialog">
    <h2 className="nx-title">{title}</h2>
    <p className="mt-1.5 text-[13px] leading-relaxed text-nx-text2">{message}</p>
    <div className="mt-4 flex flex-col gap-2">
      {options.map(o => (
        <button key={o.label} onClick={o.onSelect} data-testid={o.testId}
          className={`nx-btn w-full ${o.tone === 'primary' ? 'nx-btn-primary' : o.tone === 'danger' ? 'nx-btn-danger' : ''}`}>
          {o.label}
        </button>
      ))}
      <button onClick={onCancel} className="nx-btn nx-btn-ghost w-full" data-testid="confirm-cancel">Cancel</button>
    </div>
  </OverlayShell>
);

export const PauseMenu: React.FC<{
  onResume: () => void; onSave: () => void; onLoad: () => void; onSettings: () => void; onRestart: () => void; onMainMenu: () => void;
  onHelp: () => void; gameSpeed: number; onSpeed: (v: number) => void; muted: boolean; onToggleMute: () => void;
  fullscreen: boolean; onToggleFullscreen: () => void; onAdvisor?: () => void; onDevTools?: () => void; canSave: boolean;
}> = p => (
  <OverlayShell onDismiss={p.onResume} testId="pause-menu">
    <div className="mb-3 flex items-center justify-between">
      <h2 className="nx-title">Paused</h2>
      <button onClick={p.onResume} className="nx-btn nx-btn-ghost nx-icon-btn" aria-label="Close menu"><X className="h-5 w-5" /></button>
    </div>
    <button onClick={p.onResume} className="nx-btn nx-btn-primary w-full" data-testid="pause-resume"><Play className="h-4 w-4" /> Resume game</button>
    <div className="mt-2 grid grid-cols-2 gap-2">
      <button onClick={p.onSave} className="nx-btn" disabled={!p.canSave} data-testid="pause-save"><Save className="h-4 w-4" /> Save</button>
      <button onClick={p.onLoad} className="nx-btn" data-testid="pause-load"><FolderOpen className="h-4 w-4" /> Load</button>
      <button onClick={p.onSettings} className="nx-btn" data-testid="pause-settings"><Settings className="h-4 w-4" /> Settings</button>
      <button onClick={p.onHelp} className="nx-btn" data-testid="pause-help"><HelpCircle className="h-4 w-4" /> Controls</button>
    </div>
    <div className="mt-3 flex items-center gap-2">
      <span className="nx-label shrink-0">Speed</span>
      <div className="grid flex-1 grid-cols-4 gap-1">
        {[0.5, 1, 1.5, 2].map(v => (
          <button key={v} onClick={() => p.onSpeed(v)}
            className={`nx-btn !min-h-[34px] !px-0 text-[12px] ${p.gameSpeed === v ? '!border-nx-accent !text-nx-accent' : ''}`}>{v}×</button>
        ))}
      </div>
    </div>
    <div className="mt-2 flex gap-2">
      <button onClick={p.onToggleMute} className="nx-btn flex-1" aria-pressed={p.muted}>{p.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}{p.muted ? 'Sound off' : 'Sound on'}</button>
      <button onClick={p.onToggleFullscreen} className="nx-btn flex-1">{p.fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}{p.fullscreen ? 'Window' : 'Fullscreen'}</button>
    </div>
    {(p.onAdvisor || p.onDevTools) && (
      <div className="mt-2 flex gap-2">
        {p.onAdvisor && <button onClick={p.onAdvisor} className="nx-btn flex-1"><Brain className="h-4 w-4" /> Base advisor</button>}
        {p.onDevTools && <button onClick={p.onDevTools} className="nx-btn flex-1" data-testid="dev-tools"><Wrench className="h-4 w-4" /> Developer tools</button>}
      </div>
    )}
    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-nx-border pt-3">
      <button onClick={p.onRestart} className="nx-btn nx-btn-danger" data-testid="pause-restart"><RotateCcw className="h-4 w-4" /> Restart</button>
      <button onClick={p.onMainMenu} className="nx-btn nx-btn-danger" data-testid="pause-main-menu"><LogOut className="h-4 w-4" /> Main menu</button>
    </div>
  </OverlayShell>
);

const CONTROLS: [string, string][] = [
  ['Select a unit', 'Tap it (click on desktop)'],
  ['Select all troops', 'Tap the troop counter in the top bar'],
  ['Select an area', 'Box tool in the command bar, or drag with the mouse'],
  ['Move / Attack / Defend', 'Tap the command, then tap the destination, enemy or position'],
  ['Quick move', 'With units selected, tap the ground'],
  ['Unit options', 'Long-press a unit'],
  ['Pan / zoom', 'Drag with one finger / pinch (mouse drag, wheel)'],
  ['Jump on the map', 'Tap the radar'],
  ['Back', 'Back button, Esc, or Android back'],
  ['Keyboard', 'M move · A attack · D defend · P patrol · S stop · G hold · H base · 1-5 groups (Ctrl+1-5 assign)'],
];

export const HelpOverlay: React.FC<{ onBack: () => void; onHome?: () => void }> = ({ onBack, onHome }) => (
  <OverlayShell onDismiss={onBack} wide testId="help-overlay">
    <ScreenHeader title="Controls" onBack={onBack} onHome={onHome} />
    <dl className="divide-y divide-nx-border text-[13px]">
      {CONTROLS.map(([k, v]) => (
        <div key={k} className="flex gap-3 py-2">
          <dt className="w-36 shrink-0 font-semibold text-nx-text">{k}</dt>
          <dd className="text-nx-text2">{v}</dd>
        </div>
      ))}
    </dl>
  </OverlayShell>
);
