/** A custom display name for a song. */
export interface SongName {
  name: string;
  /** The viewer first named this song or is an admin, so they may change it. */
  canEdit: boolean;
}

export const SONG_NAME_MAX_LENGTH = 120;
