/**
 * Find the last element in an array that matches a predicate
 * @param array Array to search
 * @param predicate Function to test each element
 * @returns Last matching element or undefined
 */
export function findLast<T>(
  array: T[],
  predicate: (value: T, index: number, array: T[]) => boolean
): T | undefined {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i], i, array)) {
      return array[i]
    }
  }
  return undefined
}
