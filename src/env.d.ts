/** True only in the ocr build (`vite build --mode ocr`), which also reads the bean bag; see vite.config.ts. */
declare const __OCR__: boolean;
/** The skin's id, name and version from public/manifest.json, set by vite.config.ts. */
declare const __PRODUCT_ID__: string;
declare const __PRODUCT_NAME__: string;
declare const __PRODUCT_VERSION__: string;
/** The skin's GitHub repository as owner/name, from the manifest's repository URL. */
declare const __PRODUCT_REPO__: string;
