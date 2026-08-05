// pdf.js ships its worker as a bare .mjs with no types. Vite's `?url` suffix
// hands back the built worker's URL, which is the only supported way to point
// GlobalWorkerOptions at a bundled worker.
declare module '*.mjs?url' {
  const url: string;
  export default url;
}
