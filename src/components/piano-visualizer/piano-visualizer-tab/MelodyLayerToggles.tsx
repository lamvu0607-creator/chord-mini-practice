'use client';

import React, { useMemo } from 'react';
import { useAnalysisStore, useEnabledInstrumentGroups } from '@/stores/analysisStore';
import type { InstrumentNoteEvent } from '@/types/sheetSage';
import {
  INSTRUMENT_GROUP_COLORS,
  INSTRUMENT_GROUP_LABELS,
  INSTRUMENT_GROUP_ORDER,
} from '@/utils/instrumentGroups';

interface MelodyLayerTogglesProps {
  instrumentNotes: InstrumentNoteEvent[];
}

/** On/off chips for the MuScriptor instrument layers present in this song (the vocal line is always on). */
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
      {groups.map((group) => {
        const isOn = enabledGroups.includes(group);
        return (
          <button
            key={group}
            type="button"
            aria-pressed={isOn}
            onClick={() => toggleInstrumentGroup(group)}
            title={`${counts.get(group)} notes (MuScriptor)`}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              isOn
                ? 'border-gray-500 bg-gray-800 text-gray-100'
                : 'border-gray-700 bg-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: INSTRUMENT_GROUP_COLORS[group], opacity: isOn ? 1 : 0.35 }}
            />
            {INSTRUMENT_GROUP_LABELS[group]}
          </button>
        );
      })}
    </div>
  );
};

export default MelodyLayerToggles;
