/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Save, Upload, Trash2, X, Check, Clock, Calendar } from 'lucide-react';
import { GameEngine } from '../game/engine';
import { SaveSlotData } from '../types/game';

interface SaveLoadModalProps {
  engine: GameEngine;
  isOpen: boolean;
  onClose: () => void;
  onLoadSuccess: () => void;
}

const STORAGE_KEY = 'iron_dominion_save_slots';

export const SaveLoadModal: React.FC<SaveLoadModalProps> = ({
  engine,
  isOpen,
  onClose,
  onLoadSuccess,
}) => {
  const [slots, setSlots] = useState<Record<string, SaveSlotData>>({});
  const [activeTab, setActiveTab] = useState<'save' | 'load'>('save');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Load slots from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSlots(JSON.parse(stored));
      }
    } catch {
      // Storage unavailable
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveToSlot = (slotKey: string, slotTitle: string) => {
    const saveData = engine.exportSaveData(slotKey, slotTitle);
    const updated = { ...slots, [slotKey]: saveData };
    setSlots(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setStatusMsg(`Successfully saved to ${slotTitle}!`);
      setTimeout(() => setStatusMsg(null), 2500);
    } catch {
      setStatusMsg('Failed to save state to localStorage.');
    }
  };

  const handleLoadFromSlot = (slotKey: string) => {
    const slotData = slots[slotKey];
    if (!slotData) return;
    const ok = engine.importSaveData(slotData);
    if (ok) {
      onLoadSuccess();
      onClose();
    } else {
      setStatusMsg('Corrupted save data or version mismatch.');
    }
  };

  const handleDeleteSlot = (slotKey: string) => {
    const updated = { ...slots };
    delete updated[slotKey];
    setSlots(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      //
    }
  };

  const slotKeys = [
    { key: 'slot_1', name: 'Field Sector Alpha (Slot 1)' },
    { key: 'slot_2', name: 'Field Sector Bravo (Slot 2)' },
    { key: 'slot_3', name: 'Field Sector Charlie (Slot 3)' },
    { key: 'autosave', name: 'Automatic Checkpoint (Autosave)' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 select-none">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Tabs */}
        <div className="flex items-center gap-3 border-b border-slate-800 pb-3 mb-4">
          <button
            onClick={() => setActiveTab('save')}
            className={`flex items-center gap-1.5 text-xs font-display font-bold px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'save'
                ? 'bg-emerald-600 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            SAVE MATCH
          </button>
          <button
            onClick={() => setActiveTab('load')}
            className={`flex items-center gap-1.5 text-xs font-display font-bold px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'load'
                ? 'bg-emerald-600 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            LOAD MATCH
          </button>
        </div>

        {statusMsg && (
          <div className="mb-3 p-2 bg-emerald-950/40 border border-emerald-500/60 rounded text-xs text-emerald-300 font-mono flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> {statusMsg}
          </div>
        )}

        {/* Slots List */}
        <div className="space-y-2.5">
          {slotKeys.map(s => {
            const data = slots[s.key];
            const hasData = !!data;

            return (
              <div
                key={s.key}
                className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-display font-bold text-slate-200 flex items-center gap-2">
                    <span>{s.name}</span>
                    {s.key === 'autosave' && (
                      <span className="text-[9px] font-mono bg-sky-950 text-sky-400 border border-sky-800 px-1 rounded">
                        AUTO
                      </span>
                    )}
                  </div>
                  {hasData ? (
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {data.summary} · {new Date(data.timestamp).toLocaleTimeString()}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      Empty Slot — No Deployment Data
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {activeTab === 'save' ? (
                    <button
                      onClick={() => handleSaveToSlot(s.key, s.name)}
                      className="px-3 py-1 rounded bg-slate-800 hover:bg-emerald-600 hover:text-slate-950 text-xs font-mono font-bold text-slate-300 transition-colors flex items-center gap-1"
                    >
                      <Save className="w-3 h-3" />
                      SAVE
                    </button>
                  ) : (
                    <button
                      onClick={() => handleLoadFromSlot(s.key)}
                      disabled={!hasData}
                      className={`px-3 py-1 rounded text-xs font-mono font-bold transition-colors flex items-center gap-1 ${
                        hasData
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 shadow-sm'
                          : 'bg-slate-800/40 text-slate-600 cursor-not-allowed'
                      }`}
                    >
                      <Upload className="w-3 h-3" />
                      LOAD
                    </button>
                  )}

                  {hasData && (
                    <button
                      onClick={() => handleDeleteSlot(s.key)}
                      title="Clear Save"
                      className="p-1 rounded bg-slate-900 hover:bg-rose-900 text-slate-400 hover:text-rose-200 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
