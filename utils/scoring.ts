export const BASE_SCORE    = 1000;
export const MAX_SPEED_BONUS = 500;
export const QUESTION_TIME   = 15;

export function calculateScore(timeRemaining: number): number {
  if (timeRemaining <= 0) return 0;
  const speedBonus = Math.round(MAX_SPEED_BONUS * (timeRemaining / QUESTION_TIME));
  return BASE_SCORE + speedBonus;
}
