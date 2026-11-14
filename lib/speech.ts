// Web Speech API, ja-JP. Everything fails silently: no speechSynthesis, no Japanese voice, or an error.

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

export function getJapaneseVoice(): SpeechSynthesisVoice | null {
  try {
    const voices = synth()?.getVoices() ?? [];
    return voices.find((v) => v.lang === "ja-JP") ?? voices.find((v) => /^ja\b/i.test(v.lang)) ?? null;
  } catch {
    return null;
  }
}

// Voices load asynchronously in Chrome; calls back when the list changes.
export function onVoicesChanged(cb: () => void): () => void {
  const s = synth();
  if (!s) return () => {};
  try {
    s.addEventListener("voiceschanged", cb);
    return () => s.removeEventListener("voiceschanged", cb);
  } catch {
    return () => {};
  }
}

export function speak(text: string, rate = 0.9): void {
  const s = synth();
  const voice = getJapaneseVoice();
  if (!s || !voice || !text) return;
  try {
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.voice = voice;
    u.rate = rate;
    s.speak(u);
  } catch {
    // ignore
  }
}
