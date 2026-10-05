export async function resolve(spec, ctx, next) {
  if (spec === 'googleapis') return { url: new URL('./fake-googleapis.mjs', import.meta.url).href, shortCircuit: true };
  return next(spec, ctx);
}
