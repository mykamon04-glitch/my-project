/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Play, Map as MapIcon, FolderOpen, Settings, HelpCircle, Zap, Award, ChevronRight, Shuffle, RotateCcw, Check } from 'lucide-react';
import { CAMPAIGN_MISSIONS } from '../../data/gameData';
import { MAP_CATALOG, buildMap, mapEntry } from '../../game/maps/catalog';
import type { AIDifficulty, GameMode, MapSize, MatchSetupConfig, SaveSlotData } from '../../types/game';
import { getAchievements, getCareerStats } from '../../data/careerStats';
import { MapPreview } from './MapPreview';
import { OverlayShell, ScreenHeader } from '../nav/NavUI';

/* ───────────────────────── shared setup state ───────────────────────── */

export interface SetupState {
  mode: GameMode;
  difficulty: AIDifficulty;
  mapId: string;
  campaignId: number;
  size: MapSize;
  seed: number | null;           // null = the map's official seed
  resourceDensity: 'low' | 'normal' | 'high';
  forestDensity: 'low' | 'normal' | 'high';
  obstacleDensity: 'low' | 'normal' | 'high';
  roads: boolean;
  layout: 'diagonal' | 'horizontal';
  startingCredits: number;
  startingArmy: 'minimal' | 'standard' | 'strike_force';
  startingTech: 'basic' | 'advanced' | 'all';
  fogOfWar: boolean;
  victoryCondition: 'annihilation' | 'destroy_hq' | 'domination';
  gameSpeed: number;
}

export const DEFAULT_SETUP: SetupState = {
  mode: 'skirmish', difficulty: 'normal', mapId: 'temperate_warzone', campaignId: 1, size: 'medium', seed: null,
  resourceDensity: 'normal', forestDensity: 'normal', obstacleDensity: 'normal', roads: true, layout: 'diagonal',
  startingCredits: 3000, startingArmy: 'standard', startingTech: 'basic', fogOfWar: true, victoryCondition: 'destroy_hq', gameSpeed: 1,
};

export const setupOptions = (s: SetupState) => ({
  size: s.size, seed: s.seed ?? undefined, resourceDensity: s.resourceDensity, forestDensity: s.forestDensity,
  obstacleDensity: s.obstacleDensity, roads: s.roads, layout: s.layout,
});

export function setupToConfig(s: SetupState): Partial<MatchSetupConfig> {
  return {
    mapId: s.mapId, mapSize: s.size, difficulty: s.difficulty, startingCredits: s.startingCredits, startingArmy: s.startingArmy,
    startingTech: s.startingTech, fogOfWar: s.fogOfWar, victoryCondition: s.victoryCondition, gameSpeed: s.gameSpeed,
    seed: s.seed ?? mapEntry(s.mapId).defaultSeed, resourceDensity: s.resourceDensity, forestDensity: s.forestDensity,
    obstacleDensity: s.obstacleDensity, roads: s.roads, layout: s.layout,
  };
}

const ENV_LABEL: Record<string, string> = { temperate: 'Temperate', desert: 'Desert', urban: 'Urban', mountain: 'Mountain', coastal: 'Coastal' };
const SIZE_LABEL: Record<MapSize, string> = { small: 'Small 48×48', medium: 'Medium 64×64', large: 'Large 80×80', extra_large: 'Huge 96×96' };

/* ───────────────────────── main menu ───────────────────────── */

export const MainMenuScreen: React.FC<{
  latestSave: SaveSlotData | null;
  onContinue: () => void; onNewGame: () => void; onMapSelect: () => void; onLoad: () => void;
  onSettings: () => void; onHelp: () => void; onQuickDeploy: () => void; onCareer: () => void;
}> = p => (
  <div className="nx-screen flex flex-col" data-testid="main-menu">
    {/* battlefield backdrop: a real generated map, dimmed */}
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <MapPreview mapId="mountain_stronghold" px={360} className="absolute left-1/2 top-1/2 h-[140vmax] w-[140vmax] -translate-x-1/2 -translate-y-1/2 scale-110 opacity-40 blur-[2px]" label="Battlefield backdrop" />
      <div className="absolute inset-0 bg-gradient-to-b from-nx-bg/60 via-nx-bg/75 to-nx-bg" />
    </div>
    <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-6">
      <div className="text-center">
        <div className="text-[11px] font-semibold tracking-[0.35em] text-nx-accent">REAL-TIME STRATEGY</div>
        <h1 className="mt-1 text-[34px] font-extrabold tracking-[0.08em] text-nx-text">IRON DOMINION</h1>
        <p className="mt-1 text-[13px] text-nx-text2">Command the battlefield. Destroy the enemy headquarters.</p>
      </div>
      <nav className="flex flex-col gap-2" aria-label="Main menu">
        {p.latestSave && (
          <button onClick={p.onContinue} className="nx-btn nx-btn-primary h-12 w-full justify-between !px-4" data-testid="menu-continue">
            <span className="flex items-center gap-2"><Play className="h-4 w-4" /> Continue</span>
            <span className="truncate text-[11px] font-medium opacity-80">{p.latestSave.summary}</span>
          </button>
        )}
        <button onClick={p.onNewGame} className={`nx-btn h-12 w-full justify-start !px-4 ${p.latestSave ? '' : 'nx-btn-primary'}`} data-testid="menu-new-game"><Play className="h-4 w-4" /> New game</button>
        <button onClick={p.onMapSelect} className="nx-btn h-12 w-full justify-start !px-4" data-testid="menu-maps"><MapIcon className="h-4 w-4" /> Map selection</button>
        <button onClick={p.onLoad} className="nx-btn h-12 w-full justify-start !px-4" data-testid="menu-load"><FolderOpen className="h-4 w-4" /> Load game</button>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={p.onSettings} className="nx-btn h-11" data-testid="menu-settings"><Settings className="h-4 w-4" /> Settings</button>
          <button onClick={p.onHelp} className="nx-btn h-11" data-testid="menu-help"><HelpCircle className="h-4 w-4" /> Controls</button>
          <button onClick={p.onCareer} className="nx-btn h-11" data-testid="menu-career"><Award className="h-4 w-4" /> Career</button>
        </div>
        <button onClick={p.onQuickDeploy} className="nx-btn nx-btn-ghost h-10 w-full" data-testid="quick-deploy" title="Instant sandbox match on the last map">
          <Zap className="h-4 w-4" /> Quick Deploy (sandbox)
        </button>
      </nav>
    </div>
    <p className="relative pb-1 text-center text-[11px] text-nx-text2">V14 · five seeded battlefields</p>
  </div>
);

/* ───────────────────────── map selection ───────────────────────── */

export const MapSelectScreen: React.FC<{ setup: SetupState; onChange: (s: SetupState) => void; onBack: () => void; onHome: () => void; onContinue: () => void }> = ({ setup, onChange, onBack, onHome, onContinue }) => (
  <div className="nx-screen" data-testid="map-select">
    <div className="mx-auto max-w-5xl">
      <ScreenHeader title="Map selection" subtitle="Seeded battlefields — previews are generated from the real maps" onBack={onBack} onHome={onHome} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MAP_CATALOG.map(m => {
          const sel = setup.mapId === m.id;
          return (
            <button key={m.id} onClick={() => onChange({ ...setup, mapId: m.id, seed: null })} data-testid={`map-card-${m.id}`} aria-pressed={sel}
              className={`nx-solid overflow-hidden text-left transition-colors ${sel ? '!border-nx-accent' : 'hover:bg-nx-surface2'}`}>
              <MapPreview mapId={m.id} options={{ size: setup.size }} px={180} className="aspect-square w-full" label={`${m.name} preview`} />
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-bold">{m.name}</span>
                  {sel && <Check className="h-4 w-4 text-nx-accent" />}
                </div>
                <div className="mt-0.5 text-[11px] text-nx-text2">{ENV_LABEL[m.environment]} · {SIZE_LABEL[setup.size]} · seed {m.defaultSeed}</div>
                <p className="mt-1.5 line-clamp-3 text-[12px] leading-snug text-nx-text2">{m.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.features.map(f => <span key={f} className="rounded border border-nx-border px-1.5 py-0.5 text-[10.5px] text-nx-text2">{f}</span>)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="sticky bottom-0 mt-3 flex justify-end bg-nx-bg/95 py-2 backdrop-blur" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        <button onClick={onContinue} className="nx-btn nx-btn-primary h-11 !px-5" data-testid="map-continue">Set up match <ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  </div>
);

/* ───────────────────────── match setup ───────────────────────── */

function Seg<T extends string | number | boolean>({ label, value, options, onChange, testId }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; testId?: string }) {
  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      <span className="nx-label">{label}</span>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map(([v, t]) => (
          <button key={String(v)} onClick={() => onChange(v)} aria-pressed={value === v}
            className={`nx-btn !min-h-[36px] !px-1 text-[12px] ${value === v ? '!border-nx-accent !text-nx-accent' : ''}`}>{t}</button>
        ))}
      </div>
    </div>
  );
}

export const MatchSetupScreen: React.FC<{ setup: SetupState; onChange: (s: SetupState) => void; onBack: () => void; onHome: () => void; onChangeMap: () => void; onStart: () => void }> = ({ setup, onChange, onBack, onHome, onChangeMap, onStart }) => {
  const set = <K extends keyof SetupState>(k: K, v: SetupState[K]) => onChange({ ...setup, [k]: v });
  const entry = mapEntry(setup.mapId);
  const opts = setupOptions(setup);
  const report = useMemo(() => buildMap(setup.mapId, opts).validation, [JSON.stringify([setup.mapId, opts])]); // eslint-disable-line react-hooks/exhaustive-deps
  const [seedText, setSeedText] = useState('');
  const seed = setup.seed ?? entry.defaultSeed;
  const campaign = setup.mode === 'campaign';
  return (
    <div className="nx-screen" data-testid="match-setup">
      <div className="mx-auto max-w-5xl">
        <ScreenHeader title="Match setup" subtitle={campaign ? 'Campaign' : `${entry.name} · ${ENV_LABEL[entry.environment]}`} onBack={onBack} onHome={onHome} />
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <section className="flex flex-col gap-2">
            {!campaign && (
              <>
                <div className="nx-solid overflow-hidden">
                  <MapPreview mapId={setup.mapId} options={opts} px={300} className="aspect-square w-full" label={`${entry.name} preview`} />
                </div>
                <div className="flex items-center justify-between gap-2 text-[12px] text-nx-text2" data-testid="map-validation">
                  <span>{report.ok ? '✓ Validated' : '⚠ Repaired'} · route {report.routeLength} tiles · {report.resourcesReachable}/{report.resourceCount} deposits</span>
                  <button onClick={onChangeMap} className="nx-btn !min-h-[32px] !px-2.5 text-[12px]" data-testid="setup-change-map">Change map</button>
                </div>
              </>
            )}
          </section>
          <section className="flex flex-col gap-4">
            <Seg label="Mode" value={setup.mode} onChange={v => set('mode', v)} testId="setup-mode"
              options={[['skirmish', 'Skirmish'], ['defense', 'Defense'], ['campaign', 'Campaign'], ['sandbox', 'Sandbox']]} />
            {campaign ? (
              <div className="flex flex-col gap-1.5">
                <span className="nx-label">Mission</span>
                {CAMPAIGN_MISSIONS.map(m => (
                  <button key={m.id} onClick={() => set('campaignId', m.id)} aria-pressed={setup.campaignId === m.id}
                    className={`nx-solid p-3 text-left ${setup.campaignId === m.id ? '!border-nx-accent' : ''}`}>
                    <div className="text-[14px] font-semibold">{m.id}. {m.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-[12px] text-nx-text2">{m.briefing}</div>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <Seg label="Difficulty" value={setup.difficulty} onChange={v => set('difficulty', v)} testId="setup-difficulty"
                  options={[['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['expert', 'Expert']]} />
                <Seg label="Map size" value={setup.size} onChange={v => set('size', v)} testId="setup-size"
                  options={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['extra_large', 'Huge']]} />
                <div className="flex flex-col gap-1.5">
                  <span className="nx-label">Map seed</span>
                  <div className="flex gap-1.5">
                    <input inputMode="numeric" value={seedText || String(seed)} onChange={e => setSeedText(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))}
                      onBlur={() => { if (seedText) set('seed', Math.max(1, parseInt(seedText, 10) || 1)); setSeedText(''); }}
                      className="nx-solid h-9 min-w-0 flex-1 px-3 text-[13px] nx-num text-nx-text outline-none focus:!border-nx-accent" aria-label="Map seed" data-testid="setup-seed" />
                    <button onClick={() => { setSeedText(''); set('seed', 1 + Math.floor(Math.random() * 999999)); }} className="nx-btn !min-h-[36px] !px-2.5" title="Random seed" data-testid="setup-seed-random"><Shuffle className="h-4 w-4" /></button>
                    <button onClick={() => { setSeedText(''); set('seed', null); }} className="nx-btn !min-h-[36px] !px-2.5" title="Official seed"><RotateCcw className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Seg label="Resources" value={setup.resourceDensity} onChange={v => set('resourceDensity', v)} options={[['low', 'Low'], ['normal', 'Normal'], ['high', 'High']]} />
                  <Seg label="Obstacles" value={setup.obstacleDensity} onChange={v => set('obstacleDensity', v)} options={[['low', 'Low'], ['normal', 'Normal'], ['high', 'High']]} />
                  <Seg label="Vegetation" value={setup.forestDensity} onChange={v => set('forestDensity', v)} options={[['low', 'Low'], ['normal', 'Normal'], ['high', 'High']]} />
                  <Seg label="Starting positions" value={setup.layout} onChange={v => set('layout', v)} options={[['diagonal', 'Corners'], ['horizontal', 'West / East']]} />
                  <Seg label="Roads" value={setup.roads} onChange={v => set('roads', v)} options={[[true, 'Road network'], [false, 'No roads']]} />
                  <Seg label="Fog of war" value={setup.fogOfWar} onChange={v => set('fogOfWar', v)} options={[[true, 'On'], [false, 'Off']]} />
                  <Seg label="Victory" value={setup.victoryCondition} onChange={v => set('victoryCondition', v)} options={[['destroy_hq', 'Destroy HQ'], ['annihilation', 'Annihilation']]} />
                  <Seg label="Starting credits" value={setup.startingCredits} onChange={v => set('startingCredits', v)} options={[[1500, '1.5k'], [3000, '3k'], [6000, '6k'], [12000, '12k']]} />
                  <Seg label="Starting army" value={setup.startingArmy} onChange={v => set('startingArmy', v)} options={[['minimal', 'Minimal'], ['standard', 'Standard'], ['strike_force', 'Strike force']]} />
                  <Seg label="Game speed" value={setup.gameSpeed} onChange={v => set('gameSpeed', v)} options={[[0.75, '0.75×'], [1, '1×'], [1.5, '1.5×'], [2, '2×']]} />
                </div>
              </>
            )}
          </section>
        </div>
        <div className="sticky bottom-0 mt-4 flex justify-end gap-2 bg-nx-bg/95 py-2 backdrop-blur" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
          <button onClick={onBack} className="nx-btn h-11">Back</button>
          <button onClick={onStart} className="nx-btn nx-btn-primary h-11 !px-6" data-testid="setup-start"><Play className="h-4 w-4" /> Start match</button>
        </div>
      </div>
    </div>
  );
};

/* ───────────────────────── career ───────────────────────── */

export const CareerOverlay: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const st = getCareerStats(), ach = getAchievements();
  const rows: [string, number][] = [
    ['Matches played', st.matchesPlayed], ['Victories', st.matchesWon], ['Defeats', st.matchesLost], ['Enemies neutralised', st.enemiesNeutralized],
    ['Units built', st.unitsBuilt], ['Campaign missions cleared', st.campaignMissionsCleared], ['Highest defence wave', st.highestDefenseWave],
  ];
  return (
    <OverlayShell onDismiss={onBack} wide testId="career-overlay">
      <ScreenHeader title="Career" onBack={onBack} />
      <dl className="grid grid-cols-2 gap-2 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="nx-solid px-3 py-2"><dt className="text-[11px] text-nx-text2">{k}</dt><dd className="nx-num text-[16px] font-bold">{Math.round(v)}</dd></div>
        ))}
      </dl>
      <h3 className="nx-label mt-4 mb-1.5">Achievements · {ach.filter(a => a.unlocked).length}/{ach.length}</h3>
      <ul className="divide-y divide-nx-border text-[13px]">
        {ach.map(a => (
          <li key={a.id} className={`flex items-center justify-between gap-2 py-1.5 ${a.unlocked ? '' : 'opacity-50'}`}>
            <span>{a.title}</span><span className="text-[11px] text-nx-text2">{a.unlocked ? 'Unlocked' : 'Locked'}</span>
          </li>
        ))}
      </ul>
    </OverlayShell>
  );
};
