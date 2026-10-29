"""
Melody Transcription Level 2 Refinement Module
Implements Energy-Weighted Skyline Algorithm and Legato Smoothing for Monophonic Lead Sheet extraction.
"""

from typing import Any, Dict, List, Optional, Tuple


def filter_vocal_range(
    notes: List[Dict[str, Any]],
    min_pitch: int = 45,  # A2 (~110 Hz)
    max_pitch: int = 85,  # C#6 (~1108 Hz)
) -> List[Dict[str, Any]]:
    """Filters out any notes falling outside the standard vocal pitch range."""
    return [n for n in notes if min_pitch <= int(n["pitch"]) <= max_pitch]


def apply_energy_weighted_skyline(
    notes: List[Dict[str, Any]],
    velocity_tolerance_ratio: float = 0.70,
    min_overlap_seconds: float = 0.03,
) -> List[Dict[str, Any]]:
    """
    Enforces monophonic lead melody using the Skyline principle:
    - In contemporary music lead sheets, the lead vocal is almost always the highest
      pitch in the frequency spectrum (highest note among simultaneous accompaniments).
    - If two notes overlap in time, we choose the higher pitch unless the lower note has
      overwhelmingly higher velocity (> 1 / velocity_tolerance_ratio).
    - Truncates overlapping notes to ensure a strictly monophonic stream (max 1 note active at any time).
    """
    if not notes:
        return []

    # Sort primarily by onset time, then by pitch descending (higher pitch first)
    sorted_notes = sorted(
        notes,
        key=lambda n: (float(n["onset"]), -int(n["pitch"]), -int(n["velocity"]))
    )

    monophonic_notes: List[Dict[str, Any]] = []

    for note in sorted_notes:
        onset = float(note["onset"])
        offset = float(note["offset"])
        pitch = int(note["pitch"])
        velocity = int(note["velocity"])

        if offset <= onset:
            continue

        if not monophonic_notes:
            monophonic_notes.append({
                "onset": onset,
                "offset": offset,
                "pitch": pitch,
                "velocity": velocity,
            })
            continue

        prev = monophonic_notes[-1]

        # Case 1: Sequential note (no overlap or negligible overlap)
        if onset >= prev["offset"] - min_overlap_seconds:
            # Clean up tiny negative gaps
            clean_onset = max(onset, prev["offset"])
            if offset > clean_onset + 0.03:
                monophonic_notes.append({
                    "onset": round(clean_onset, 3),
                    "offset": round(offset, 3),
                    "pitch": pitch,
                    "velocity": velocity,
                })
            continue

        # Case 2: Notes overlap significantly in time (Polyphonic collision)
        # Apply Skyline decision:
        prev_pitch = int(prev["pitch"])
        prev_vel = int(prev["velocity"])

        # Is current note higher than previous note?
        if pitch > prev_pitch:
            # Candidate lead note: Check if its velocity is confident enough
            if velocity >= prev_vel * velocity_tolerance_ratio:
                # The higher note takes over! Truncate the previous lower accompaniment note
                prev["offset"] = round(onset, 3)
                # If previous note becomes too short after truncation, drop it
                if prev["offset"] - prev["onset"] < 0.05:
                    monophonic_notes.pop()

                monophonic_notes.append({
                    "onset": round(onset, 3),
                    "offset": round(offset, 3),
                    "pitch": pitch,
                    "velocity": velocity,
                })
            else:
                # Higher note is too quiet/ghost note, ignore it
                pass
        elif pitch < prev_pitch:
            # Current note is lower in pitch (likely guitar/piano chord accompaniment)
            # Only consider it if previous note ends and current note extends beyond it
            if offset > prev["offset"] + 0.05:
                # Append the remainder of the lower note only after previous lead note finishes
                remainder_onset = prev["offset"]
                if offset - remainder_onset >= 0.05:
                    monophonic_notes.append({
                        "onset": round(remainder_onset, 3),
                        "offset": round(offset, 3),
                        "pitch": pitch,
                        "velocity": velocity,
                    })
        else:
            # Same pitch collision: Extend duration if needed
            prev["offset"] = max(prev["offset"], round(offset, 3))
            prev["velocity"] = max(prev["velocity"], velocity)

    return monophonic_notes


def apply_legato_smoothing(
    notes: List[Dict[str, Any]],
    max_gap_seconds: float = 0.12,  # 120ms threshold for legato/vibrato
) -> List[Dict[str, Any]]:
    """
    Merges fragmented notes of the same pitch caused by vocal vibrato or slight envelope dip.
    If note[i+1].pitch == note[i].pitch and (note[i+1].onset - note[i].offset) <= max_gap_seconds:
    Merge them into a single sustained note.
    """
    if not notes:
        return []

    merged: List[Dict[str, Any]] = []

    for note in notes:
        if not merged:
            merged.append(dict(note))
            continue

        prev = merged[-1]
        gap = float(note["onset"]) - float(prev["offset"])

        # Check same pitch and small gap
        if int(note["pitch"]) == int(prev["pitch"]) and 0.0 <= gap <= max_gap_seconds:
            # Extend duration of previous note
            prev["offset"] = max(float(prev["offset"]), float(note["offset"]))
            prev["velocity"] = max(int(prev["velocity"]), int(note["velocity"]))
        else:
            merged.append(dict(note))

    return merged


def prune_orphan_notes(
    notes: List[Dict[str, Any]],
    min_orphan_duration_seconds: float = 0.10,  # 100ms
    isolation_gap_seconds: float = 0.25,        # 250ms
) -> List[Dict[str, Any]]:
    """
    Removes very short isolated notes (< 100ms) with no adjacent notes within 250ms.
    These are almost always microphone clicks, breath noises, or drumstick transients.
    """
    if len(notes) <= 2:
        return notes

    pruned: List[Dict[str, Any]] = []
    n_notes = len(notes)

    for i in range(n_notes):
        curr = notes[i]
        curr_dur = float(curr["offset"]) - float(curr["onset"])

        if curr_dur >= min_orphan_duration_seconds:
            pruned.append(curr)
            continue

        # Check isolation from neighbors
        prev_gap = float(curr["onset"]) - float(notes[i - 1]["offset"]) if i > 0 else 999.0
        next_gap = float(notes[i + 1]["onset"]) - float(curr["offset"]) if i < n_notes - 1 else 999.0

        if prev_gap < isolation_gap_seconds or next_gap < isolation_gap_seconds:
            # Part of a phrase or rhythm, keep it
            pruned.append(curr)
        else:
            # Isolated short click, prune it
            pass

    return pruned


def filter_octave_glitches(
    notes: List[Dict[str, Any]],
    max_dur: float = 0.28,
    max_leap: int = 8,
) -> List[Dict[str, Any]]:
    """
    Detects and eliminates momentary pitch hiccups (octave jumps, overtone spikes, bass bleed)
    where a very short note jumps drastically away from surrounding melodic context.
    Folds back genuine octave errors (+/-12, +/-24 semitones) to preserve melody continuity.
    """
    if len(notes) < 3:
        return [dict(n) for n in notes]

    cleaned: List[Dict[str, Any]] = []
    i = 0
    while i < len(notes):
        curr = dict(notes[i])
        dur = float(curr["offset"]) - float(curr["onset"])

        if i > 0 and i < len(notes) - 1:
            prev = cleaned[-1]
            next_note = notes[i + 1]

            leap_prev = int(curr["pitch"]) - int(prev["pitch"])
            leap_next = int(next_note["pitch"]) - int(curr["pitch"])

            # Condition 1: Peak/valley spike (jumps far away, then immediately returns)
            is_spike = (abs(leap_prev) >= max_leap and abs(leap_next) >= max_leap and (leap_prev * leap_next < 0))
            # Condition 2: Octave error (+/-12, +/-24)
            is_octave = abs(leap_prev) in (11, 12, 13, 23, 24, 25) or abs(leap_next) in (11, 12, 13, 23, 24, 25)

            if dur <= max_dur and (is_spike or is_octave):
                folded = None
                for oct_shift in (-24, -12, 12, 24):
                    candidate = int(curr["pitch"]) + oct_shift
                    if abs(candidate - int(prev["pitch"])) <= 4 and abs(candidate - int(next_note["pitch"])) <= 4:
                        folded = candidate
                        break

                if folded is not None:
                    # Octave foldback: match melodic register
                    curr["pitch"] = folded
                    cleaned.append(curr)
                    i += 1
                    continue
                else:
                    # Transient noise: If bridging identical neighbor pitches, extend prev note
                    if float(curr["onset"]) - float(prev["offset"]) <= 0.05 and int(prev["pitch"]) == int(next_note["pitch"]):
                        prev["offset"] = max(float(prev["offset"]), float(curr["offset"]))
                    i += 1
                    continue

        cleaned.append(curr)
        i += 1

    return cleaned


def separate_lead_and_harmony(
    notes: List[Dict[str, Any]],
    min_overlap_sec: float = 0.06,
    max_legato_gap: float = 0.12,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Decomposes polyphonic vocal notes into:
    1. lead_notes: The primary melodic vocal line (Voice 1)
    2. harmony_notes: Accompanying backing vocal lines (Voice 2 / Bè) with interval tags.
    """
    if not notes:
        return [], []

    lead_notes: List[Dict[str, Any]] = []
    harmony_notes: List[Dict[str, Any]] = []

    # Sort primarily by onset time, then velocity descending (Lead vocal is louder than backing harmonies)
    sorted_notes = sorted(notes, key=lambda n: (float(n["onset"]), -int(n["velocity"]), -int(n["pitch"])))

    for note in sorted_notes:
        onset = round(float(note["onset"]), 3)
        offset = round(float(note["offset"]), 3)
        pitch = int(note["pitch"])
        vel = int(note["velocity"])

        if offset <= onset + 0.04:
            continue

        if not lead_notes:
            lead_notes.append({
                "onset": onset,
                "offset": offset,
                "pitch": pitch,
                "velocity": vel,
            })
            continue

        prev_lead = lead_notes[-1]

        # Check temporal overlap with currently active lead note
        is_overlapping = not (
            offset <= prev_lead["onset"] + min_overlap_sec
            or onset >= prev_lead["offset"] - min_overlap_sec
        )

        if not is_overlapping:
            # Sequential note: Continuation of lead melody
            lead_notes.append({
                "onset": onset,
                "offset": offset,
                "pitch": pitch,
                "velocity": vel,
            })
        else:
            # Polyphonic collision!
            # Same pitch: Extend duration
            if pitch == int(prev_lead["pitch"]):
                prev_lead["offset"] = max(float(prev_lead["offset"]), offset)
                prev_lead["velocity"] = max(int(prev_lead["velocity"]), vel)
                continue

            # Octave overtone collision: Suppress ghost harmonic
            if abs(pitch - int(prev_lead["pitch"])) in (11, 12, 13, 23, 24):
                continue

            # Distinct pitch collision -> Genuine backing harmony note (Bè)!
            interval = pitch - int(prev_lead["pitch"])
            harm_tag = f"{interval:+d}st"
            if interval in (3, 4):
                harm_tag = "+3rd"
            elif interval in (-3, -4):
                harm_tag = "-3rd"
            elif interval in (5,):
                harm_tag = "+4th"
            elif interval in (7,):
                harm_tag = "+5th"
            elif interval in (-5,):
                harm_tag = "-4th"
            elif interval in (-7,):
                harm_tag = "-5th"
            elif interval in (8, 9):
                harm_tag = "+6th"
            elif interval in (-8, -9):
                harm_tag = "-6th"

            harmony_notes.append({
                "onset": onset,
                "offset": offset,
                "pitch": pitch,
                "velocity": vel,
                "intervalTag": harm_tag,
                "leadPitch": int(prev_lead["pitch"]),
            })

    # Apply legato smoothing independently to each voice
    lead_notes = apply_legato_smoothing(lead_notes, max_gap_seconds=max_legato_gap)
    harmony_notes = apply_legato_smoothing(harmony_notes, max_gap_seconds=max_legato_gap)

    return lead_notes, harmony_notes


def refine_melody_skyline(
    raw_notes: List[Dict[str, Any]],
    min_pitch: int = 45,
    max_pitch: int = 85,
    velocity_tolerance: float = 0.70,
    legato_gap: float = 0.12,
    min_orphan_dur: float = 0.10,
) -> List[Dict[str, Any]]:
    """
    Master Level 2 pipeline that transforms raw polyphonic AMT notes into a
    clean, professional Monophonic Lead Sheet melody.
    """
    if not raw_notes:
        return []

    # Step 1: Vocal range constraint
    bounded_notes = filter_vocal_range(raw_notes, min_pitch=min_pitch, max_pitch=max_pitch)

    # Step 2: Pitch glitch filtering & octave foldback
    cleaned_notes = filter_octave_glitches(bounded_notes)

    # Step 3: Energy-weighted Skyline monophonic extraction
    skyline_notes = apply_energy_weighted_skyline(
        cleaned_notes,
        velocity_tolerance_ratio=velocity_tolerance,
    )

    # Step 4: Legato smoothing (merge vibrato splits)
    smoothed_notes = apply_legato_smoothing(skyline_notes, max_gap_seconds=legato_gap)

    # Step 5: Prune isolated short clicks
    final_notes = prune_orphan_notes(smoothed_notes, min_orphan_duration_seconds=min_orphan_dur)

    # Re-round and validate
    result = []
    for n in final_notes:
        onset = round(float(n["onset"]), 3)
        offset = round(float(n["offset"]), 3)
        if offset - onset >= 0.05:
            result.append({
                "onset": onset,
                "offset": offset,
                "pitch": int(n["pitch"]),
                "velocity": int(n["velocity"]),
            })

    result.sort(key=lambda x: (x["onset"], x["pitch"], x["offset"]))
    return result


def refine_vocal_lead_and_harmony(
    raw_notes: List[Dict[str, Any]],
    min_pitch: int = 45,
    max_pitch: int = 85,
    legato_gap: float = 0.12,
) -> Dict[str, Any]:
    """
    Master Vocal Pipeline: Produces both Lead Vocal and Backing Harmony streams
    from isolated vocal audio.
    """
    if not raw_notes:
        return {
            "leadNotes": [],
            "harmonyNotes": [],
            "totalLeadNotes": 0,
            "totalHarmonyNotes": 0,
            "hasHarmony": False,
        }

    # Step 1: Vocal pitch range filter
    bounded = filter_vocal_range(raw_notes, min_pitch=min_pitch, max_pitch=max_pitch)

    # Step 2: Octave glitch filtering & foldback
    cleaned = filter_octave_glitches(bounded)

    # Step 3: Decompose into Lead and Harmony
    lead, harmony = separate_lead_and_harmony(cleaned, max_legato_gap=legato_gap)

    return {
        "leadNotes": lead,
        "harmonyNotes": harmony,
        "totalLeadNotes": len(lead),
        "totalHarmonyNotes": len(harmony),
        "hasHarmony": len(harmony) > 0,
    }

