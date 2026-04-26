export function hasAllFlags(flags: bigint, mask: bigint) {
  return (flags & mask) === mask;
}
