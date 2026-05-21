/**
 * GET /api/healthz
 *
 * Minimal unauthenticated liveness check for load balancers and uptime
 * monitors. Keep the response intentionally coarse so it never exposes
 * deployment details, dependency status, version data, or tenant metadata.
 */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  return { ok: true }
})
