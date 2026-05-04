const SELECTED_DATASET_KEY = "flashcard_selected_dataset";

export function getSelectedDataset(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SELECTED_DATASET_KEY);
  } catch {
    return null;
  }
}

export function setSelectedDataset(slug: string): void {
  try {
    localStorage.setItem(SELECTED_DATASET_KEY, slug);
  } catch {
    // ignore
  }
}
