import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncateAvgToNote(avg: number): 1 | 2 | 3 | 4 | 5 {
  // Requirements:
  // - 1.5 or below -> 1
  // - 1.51 to 2.5 -> 2
  // - 2.51 to 3.5 -> 3
  // - 3.51 to 4.5 -> 4
  // - 4.5 up -> 5
  if (avg <= 1.5) return 1
  if (avg <= 2.5) return 2
  if (avg <= 3.5) return 3
  if (avg <= 4.5) return 4
  return 5
}