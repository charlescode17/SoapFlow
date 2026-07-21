import { useState, useEffect } from "react";

export function useTypewriter(
  phrases: string[],
  typingSpeed = 55,
  deletingSpeed = 30,
  pauseTime = 1400,
  loop = true,
) {
  const [displayed, setDisplayed] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentPhrase = phrases[phraseIndex];
    let timeout: ReturnType<typeof setTimeout>;

    const isLastPhrase = phraseIndex === phrases.length - 1;
    const doneForGood = !loop && isLastPhrase && displayed === currentPhrase;

    if (doneForGood) return;

    if (!isDeleting && displayed === currentPhrase) {
      timeout = setTimeout(() => setIsDeleting(true), pauseTime);
    } else if (isDeleting && displayed === "") {
      setIsDeleting(false);
      setPhraseIndex((phraseIndex + 1) % phrases.length);
    } else {
      timeout = setTimeout(
        () => {
          setDisplayed((prev) =>
            isDeleting
              ? currentPhrase.slice(0, prev.length - 1)
              : currentPhrase.slice(0, prev.length + 1),
          );
        },
        isDeleting ? deletingSpeed : typingSpeed,
      );
    }

    return () => clearTimeout(timeout);
  }, [
    displayed,
    isDeleting,
    phraseIndex,
    phrases,
    typingSpeed,
    deletingSpeed,
    pauseTime,
    loop,
  ]);

  return displayed;
}
