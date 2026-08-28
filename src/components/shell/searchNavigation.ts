/** Circular listbox navigation while DOM focus remains on the combobox input. */
export function nextSearchIndex(current: number, itemCount: number, direction: 1 | -1): number {
  if (itemCount <= 0) return -1;
  if (current < 0 || current >= itemCount) return direction === 1 ? 0 : itemCount - 1;
  return (current + direction + itemCount) % itemCount;
}
