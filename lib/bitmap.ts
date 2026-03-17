/** question numbers are 1-indexed */
export function numbersToHex(numbers: number[], totalQuestions: number): string {
  const byteCount = Math.ceil(totalQuestions / 8);
  const bytes = new Uint8Array(byteCount);
  for (const n of numbers) {
    if (n < 1 || n > totalQuestions) continue;
    const idx = n - 1;
    const bytePos = Math.floor(idx / 8);
    const bitPos = 7 - (idx % 8); // MSB-first
    bytes[bytePos] |= 1 << bitPos;
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToNumbers(hex: string, totalQuestions: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    const byteIndex = i / 2;
    for (let bit = 7; bit >= 0; bit--) {
      if (byte & (1 << bit)) {
        const n = byteIndex * 8 + (7 - bit) + 1; // 1-indexed
        if (n <= totalQuestions) result.push(n);
      }
    }
  }
  return result;
}
