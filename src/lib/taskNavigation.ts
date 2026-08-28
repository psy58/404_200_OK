export interface TaskNavigationState {
  from: string;
  label: string;
  scrollY: number;
  filters?: Record<string, string | null>;
}

export function taskNavigationState(
  from: string,
  label: string,
  filters?: Record<string, string | null>,
): TaskNavigationState {
  return { from, label, scrollY: window.scrollY, filters };
}
