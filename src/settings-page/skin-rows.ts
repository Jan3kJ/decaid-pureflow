// The words of the rows of the category Skin, as data: `SkinCategory.svelte` draws them and the
// page's filter reads them, so a row has its label and hint in one place.
import { DISPLAY_SIZES, LINE_WIDTHS, type DisplayChoice } from '../display';
import { PRODUCT_NAME, PRODUCT_VERSION } from '../product';
import { STEAM_FIELDS } from '../settings';
import type { SkinPart } from './tree';

/** What the filter reads of a row; `id` names it within its subcategory. */
export interface RowWords {
  id: string;
  label: string;
  hint?: string;
}

export interface SkinSwitch extends RowWords {
  key: 'firstStepWorkaround' | 'showProfileSteps' | 'showGraphLegend' | 'showShotValues';
  hint: string;
}

export interface SkinDisplay extends RowWords {
  key: 'displaySize' | 'lineWidth';
  hint: string;
  choices: DisplayChoice[];
}

/** A row of Skin > Steam per group of its values. */
export const STEAM_ROWS: RowWords[] = STEAM_FIELDS.map((group) => ({ id: group.title, label: group.title, hint: group.hint }));

export const RATIOS_ROW: RowWords = { id: 'ratios', label: 'ratios', hint: 'last shot × ratio is the stop at weight' };

/** The editor's maximum flow and the dose of a shot that has none. */
export const EDITOR_DOSE_ROW: RowWords = {
  id: 'editor-dose',
  label: 'editor and dose',
  hint: 'the highest flow the A-Flow editor offers; the dose of a shot that has none',
};

export const SWITCHES: SkinSwitch[] = [
  {
    key: 'firstStepWorkaround',
    id: 'first-step-workaround',
    label: 'first-step workaround',
    hint: 'a profile from the editor starts with a Pre Fill step of 1 s, for a machine that skips the first step.',
  },
  {
    key: 'showProfileSteps',
    id: 'show-profile-steps',
    label: 'profile steps',
    hint: 'the editor has a button that shows the generated steps under the graph. It opens closed.',
  },
];

export const OLD_AFLOW_ROW: RowWords = {
  id: 'old-aflow',
  label: 'old A-Flow profiles',
  hint: "converts every older A-Flow profile to A-Flow 3.0, as the editor's save does; Decaid's bundled ones are skipped.",
};

export const START_ROW: RowWords = {
  id: 'start-row',
  label: 'start row',
  hint: "the editor's profiles to start from, up to five. A tap on a slot chooses its profile.",
};

export const GRAPH_SWITCHES: SkinSwitch[] = [
  {
    key: 'showGraphLegend',
    id: 'show-graph-legend',
    label: 'legend',
    hint: 'the shot graph names its curves and their units under it, and what a dashed line is. Without it the graph shows no unit.',
  },
  {
    key: 'showShotValues',
    id: 'show-shot-values',
    label: 'shot values',
    hint: 'after a shot its overlay shows the values of preinfusion, extraction and the whole shot under the graph.',
  },
];

/** Skin > Display: Streamline's two sizes, each a factor of the settings object */
export const DISPLAY: SkinDisplay[] = [
  {
    key: 'displaySize',
    id: 'display-size',
    label: 'display size',
    hint: 'every text, button and graph of the skin, larger or smaller. Medium fits the screen as designed.',
    choices: DISPLAY_SIZES,
  },
  {
    key: 'lineWidth',
    id: 'line-width',
    label: 'chart line width',
    hint: 'the curves of the shot graph, the profile previews and the A-Flow editor.',
    choices: LINE_WIDTHS,
  },
];

export const BACKUP_ROW: RowWords = { id: 'backup', label: 'backup' };

export const VERSION_ROW: RowWords = { id: 'version', label: PRODUCT_NAME, hint: `version ${PRODUCT_VERSION}` };

export const DEVELOPER_ROW: RowWords = {
  id: 'developer-options',
  label: 'developer options',
  hint: 'shows Skin > Developer, to install a build from a server on your PC. Only on this tablet.',
};

/** The rows of each part of the category Skin; a part without any is a view, found by its subcategory's name. */
export const SKIN_ROWS: Record<SkinPart, RowWords[]> = {
  steam: STEAM_ROWS,
  'hot-water': [RATIOS_ROW],
  profile: [EDITOR_DOSE_ROW, ...SWITCHES, OLD_AFLOW_ROW, START_ROW],
  graph: GRAPH_SWITCHES,
  display: DISPLAY,
  skins: [],
  versions: [],
  backup: [BACKUP_ROW, VERSION_ROW, DEVELOPER_ROW],
  developer: [],
};
