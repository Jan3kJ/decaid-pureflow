/** True only in the ocr build (`vite build --mode ocr`), which also reads the bean bag; see vite.config.ts. */
declare const __OCR__: boolean;
/** The skin's name and version from public/manifest.json, set by vite.config.ts. */
declare const __PRODUCT_NAME__: string;
declare const __PRODUCT_VERSION__: string;
