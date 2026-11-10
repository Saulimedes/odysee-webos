export function cycle(index: number, delta: number, count: number) {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}
