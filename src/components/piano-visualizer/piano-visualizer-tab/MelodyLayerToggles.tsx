'use client';

import React, { useMemo } from 'react';
import { useAnalysisStore, useEnabledInstrumentGroups, useFocusedMelodyLayer } from '@/stores/analysisStore';
import type { InstrumentNoteEvent, MelodyLayer } from '@/types/sheetSage';
import {
  INSTRUMENT_GROUP_COLORS,
  INSTRUMENT_GROUP_LABELS,
  INSTRUMENT_GROUP_ORDER,
} from '@/utils/instrumentGroups';
import { MELODIC_TRANSCRIPTION_COLOR } from './constants';

interface MelodyLayerTogglesProps {
  instrumentNotes: InstrumentNoteEvent[];
}

const FocusButton: React.FC<{ layer: MelodyLayer; label: string }> = ({ layer, label }) => {
  const isFocused = useFocusedMelodyLayer() === layer;
  const toggleFocus = useAnalysisStore((state) => state.toggleMelodyLayerFocus);

  return (
    <button
      type="button"
      aria-label={`Focus ${label}`}
      aria-pressed={isFocused}
      title={isFocused ? 'Clear focus' : `Focus ${label} and dim the other layers`}
      onClick={() => toggleFocus(layer)}
      className={`flex h-6 w-6 items-center justify-center rounded-r-full transition-colors ${
        isFocused ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-100'
      }`}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" />
        <circle cx="8" cy="8" r="1.75" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
};

/** Chips for the layers in this song: on/off for instruments (the vocal line is always on), plus focus. */
const MelodyLayerToggles: React.FC<MelodyLayerTogglesProps> = ({ instrumentNotes }) => {
  const enabledGroups = useEnabledInstrumentGroups();
  const toggleInstrumentGroup = useAnalysisStore((state) => state.toggleInstrumentGroup);

  const counts = useMemo(() => {
    const byGroup = new Map<string, number>();
    for (const note of instrumentNotes) byGroup.set(note.group, (byGroup.get(note.group) ?? 0) + 1);
    return byGroup;
  }, [instrumentNotes]);

  const groups = INSTRUMENT_GROUP_ORDER.filter((group) => (counts.get(group) ?? 0) > 0);
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-900/60 px-3 py-1.5">
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500">Instrument layers:</span>
      <div className="flex items-center rounded-full border border-gray-500 bg-gray-800">
        <span className="flex items-center gap-1.5 pl-2.5 pr-1.5 text-xs font-medium text-gray-100">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: MELODIC_TRANSCRIPTION_COLOR }} />
          Vocal
        </span>
        <FocusButton layer="vocal" label="Vocal" />
      </div>
      {groups.map((group) => {
        const isOn = enabledGroups.includes(group);
        const label = INSTRUMENT_GROUP_LABELS[group];
        return (
          <div
            key={group}
            className={`flex items-center rounded-full border transition-colors ${
              isOn ? 'border-gray-500 bg-gray-800' : 'border-gray-700 bg-transparent'
            }`}
          >
            <button
              type="button"
              aria-pressed={isOn}
              onClick={() => toggleInstrumentGroup(group)}
              title={`${counts.get(group)} notes (MuScriptor)`}
              className={`flex items-center gap-1.5 pl-2.5 pr-1.5 text-xs font-medium transition-colors ${
                isOn ? 'text-gray-100' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: INSTRUMENT_GROUP_COLORS[group], opacity: isOn ? 1 : 0.35 }}
              />
              {label}
            </button>
            <FocusButton layer={group} label={label} />
          </div>
        );
      })}
    </div>
  );
};

export default MelodyLayerToggles;
