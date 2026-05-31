import answers from './answers.json';
import guesses from './guesses.json';

// 🟢 Convert both arrays to uppercase instantly when the app loads
export const WORD_LIST: string[] = answers.map((word: string) => word.toUpperCase());
export const VALID_GUESSES: string[] = guesses.map((word: string) => word.toUpperCase());

// Combine them into a single Set for O(1) instant validation
export const VALID_WORD_SET = new Set([...WORD_LIST, ...VALID_GUESSES]);