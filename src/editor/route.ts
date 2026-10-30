// Which editor a profile opens in: the one place that
// decides. A profile is A-Flow when the A-Flow editor can open it: an A-Flow 3.0 profile, or an
// older A-Flow profile whose steps the reader reads (`openParams`); every other profile opens in
// the step editor. A title or the picker's tag does not decide: a title says nothing about the
// values, and a profile another app saved has no tag.
import type { Profile } from '../api';
import { openParams } from './storage';

export type EditorKind = 'aflow' | 'steps';

/** No profile (nothing loaded, or Decaid does not answer): the A-Flow editor on a default, as before. */
export function editorFor(profile: Profile | null | undefined): EditorKind {
  return profile && !openParams(profile) ? 'steps' : 'aflow';
}
