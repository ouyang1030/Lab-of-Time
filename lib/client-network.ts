/**
 * Rate-limit identity for a client address. IPv4 is used as-is; IPv6 is reduced
 * to its /64 prefix because one subscriber usually controls the whole /64.
 */
export function clientNetwork(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head, tail] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((group) => parseInt(group, 16).toString(16))
    .join(":")}::/64`;
}
