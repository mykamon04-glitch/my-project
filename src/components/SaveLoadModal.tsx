/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Save, Upload, Trash2, Check } from 'lucide-react';
import { GameEngine } from '../game/engine';
import { SaveSlotData } from '../types/game';
import { OverlayShell, ScreenHeader } from './nav/NavUI';

interface SaveLoadModalProps {
  /** The running match (null on the main menu: loading only). */
  engine: GameEngine | null;
  isOpen: boolean;
  mode?: 'save' | 'load';
  onClose: () => void;
  onHome?: () => void;
  /** Load a slot: App rebuilds the match from it (map identity included). */
  onLoadData: (data: SaveSlotData) => void;
  canSave?: boolean;
}

const STORAGE_KEY = 'iron_dominion_save_slots';
const SLOTS = [
  { key: 'slot_1', name: 'Slot 1' },
  { key: 'slot_2', name: 'Slot 2' },
  { key: 'slot_3', name: 'Slot 3' },
  { key: 'quicksave', name: 'Quick save (Save & Exit)' },
  { key: 'autosave', name: 'Autosave' },
];

export function readSaveSlots(): Record<string, SaveSlotData> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
export function writeSaveSlot(key: string, data: SaveSlotData): boolean {
  try {
    const all = readSaveSlots();
    all[key] = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch { return false; }
}
export function latestSaveSlot(): SaveSlotData | null {
  const all = Object.values(readSaveSlots()).filter(s => s && s.stateJson);
  return all.sort((a, b) => b.timestamp - a.timestamp)[0] ?? null;
}

export const SaveLoadModal: React.FC<SaveLoadModalProps> = ({ engine, isOpen, mode = 'load', onClose, onHome, onLoadData, canSave = true }) => {
  const [slots, setSlots] = useState<Record<string, SaveSlotData>>({});
  const saving = !!engine && canSave;
  const [tab, setTab] = useState<'save' | 'load'>(mode);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => { if (isOpen) { setSlots(readSaveSlots()); setTab(saving ? mode : 'load'); } }, [isOpen, mode, saving]);
  if (!isOpen) return null;

  const flash = (m: string) => { setStatus(m); window.setTimeout(() => setStatus(null), 2200); };
  const save = (key: string, name: string) => {
    if (!engine) return;
    const ok = writeSaveSlot(key, engine.exportSaveData(key, name));
    setSlots(readSaveSlots());
    flash(ok ? `Saved to ${name}` : 'Saving failed (storage unavailable)');
  };
  const remove = (key: string) => {
    const all = readSaveSlots(); delete all[key];
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch { /* ignore */ }
    setSlots(all); setConfirmDelete(null);
  };

  return (
    <OverlayShell onDismiss={onClose} testId="save-load">
      <ScreenHeader title={tab === 'save' ? 'Save game' : 'Load game'} onBack={onClose} onHome={onHome} />
      {saving && (
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-nx-border p-1" role="tablist">
          {(['save', 'load'] as const).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`h-9 rounded-md text-[13px] font-semibold ${tab === t ? 'bg-nx-surface2 text-nx-text' : 'text-nx-text2'}`}>
              {t === 'save' ? 'Save' : 'Load'}
            </button>
          ))}
        </div>
      )}
      {status && <div className="mb-2 flex items-center gap-1.5 text-[12px] text-nx-accent" role="status"><Check className="h-3.5 w-3.5" /> {status}</div>}
      <ul className="flex flex-col gap-2">
        {SLOTS.filter(s => tab === 'load' || s.key !== 'autosave').map(s => {
          const d = slots[s.key];
          return (
            <li key={s.key} className="nx-solid flex items-center justify-between gap-2 px-3 py-2.5" data-testid={`slot-${s.key}`}>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">{s.name}</div>
                <div className="truncate text-[11px] text-nx-text2">{d ? `${d.summary} · ${new Date(d.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` : 'Empty'}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {tab === 'save' ? (
                  <button onClick={() => save(s.key, s.name)} className="nx-btn !min-h-[34px] !px-3 text-[12px]" data-testid={`save-${s.key}`}><Save className="h-3.5 w-3.5" /> Save</button>
                ) : (
                  <button onClick={() => d && onLoadData(d)} disabled={!d} className="nx-btn nx-btn-primary !min-h-[34px] !px-3 text-[12px]" data-testid={`load-${s.key}`}><Upload className="h-3.5 w-3.5" /> Load</button>
                )}
                {d && (confirmDelete === s.key ? (
                  <button onClick={() => remove(s.key)} className="nx-btn nx-btn-danger !min-h-[34px] !px-2 text-[12px]">Delete?</button>
                ) : (
                  <button onClick={() => setConfirmDelete(s.key)} className="nx-btn nx-btn-ghost nx-icon-btn !min-h-[34px]" aria-label={`Delete ${s.name}`}><Trash2 className="h-4 w-4" /></button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </OverlayShell>
  );
};
