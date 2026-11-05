// The settings page's filter: what a filter leaves of the tree. No UI; the page and the category
// Skin draw a hit with the rows they draw without a filter.
import { isEmptyFilter, matchesFilter } from '../filter-words';
import { SKIN_ROWS, type RowWords } from './skin-rows';
import { ACTIONS, SETTINGS_TREE, visibleSubcategories, type Action, type Category, type Subcategory } from './tree';

/** What a filter leaves of a subcategory. */
export interface Hit {
  category: Category;
  sub: Subcategory;
  /** the ids of the rows it leaves */
  rows: Set<string>;
  /** the filter is in the subcategory's and category's names: a view that is not a list of fields shows whole */
  whole: boolean;
}

/** What the page shows on this machine, the same with a filter as without. */
export interface Shown {
  bengle: boolean;
  developer: boolean;
  offered: (action: Action) => boolean;
}

function rowsOf(sub: Subcategory, offered: Shown['offered']): RowWords[] {
  if (sub.content.kind === 'skin') return SKIN_ROWS[sub.content.part];
  const actions = (sub.content.actions ?? []).filter(offered).map((action) => ({ id: action, ...ACTIONS[action] }));
  return [...sub.content.fields, ...actions];
}

const hasView = (sub: Subcategory) => (sub.content.kind === 'skin' ? SKIN_ROWS[sub.content.part].length === 0 : !!sub.content.view);

/**
 * The subcategories with a row the filter finds, in the tree's order: every word in the row's
 * label, its hint, or the names of its subcategory and category. None for an empty filter, which
 * gives the page back.
 */
export function filterSettings(filter: string, shown: Shown): Hit[] {
  if (isEmptyFilter(filter)) return [];
  return SETTINGS_TREE.flatMap((category) =>
    visibleSubcategories(category, shown.bengle, shown.developer).flatMap((sub) => {
      const names = `${sub.name} ${category.name}`;
      const whole = matchesFilter(names, filter);
      const rows = rowsOf(sub, shown.offered).filter((row) => matchesFilter(`${row.label} ${row.hint ?? ''} ${names}`, filter));
      return rows.length > 0 || (whole && hasView(sub)) ? [{ category, sub, rows: new Set(rows.map((row) => row.id)), whole }] : [];
    }),
  );
}
