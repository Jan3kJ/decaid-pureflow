import manifest from '../public/manifest.json';

/** The name shown in the UI; the skin's manifest is its single source. */
export const PRODUCT_NAME: string = manifest.name;

/** The skin's version, from its manifest: a backup of the settings names it. */
export const PRODUCT_VERSION: string = manifest.version;
