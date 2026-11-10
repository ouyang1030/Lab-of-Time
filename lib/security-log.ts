/** One JSON line per security-relevant event for Workers Logs. Never pass emails or passwords. */
export function logSecurityEvent(event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ security: event, ...fields }));
}
