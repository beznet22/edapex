/**
 * Vite asset imports.
 *
 * `?url` is a Vite convention with no TypeScript meaning, and it returns a string that
 * is only valid after the bundler has emitted the file. Declaring it keeps the import
 * type-safe without a cast, which matters here because a silent `undefined` URL would
 * make IronPress fetch `"undefined"` and fail at the first export rather than at build.
 */
declare module "*?url" {
  const url: string;
  export default url;
}

/**
 * IronPress' WebAssembly binary, exposed through its package `exports` map.
 *
 * The package ships no type for this subpath because importing the raw binary is not
 * part of its documented API — but passing an explicit URL is the only way to make the
 * asset a build-time contract instead of a runtime guess.
 */
declare module "ironpress/ironpress_bg.wasm?url" {
  const url: string;
  export default url;
}
