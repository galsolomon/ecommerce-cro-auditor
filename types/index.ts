export type GameMode = 'solo' | '1v1' | '3v3' | '4v4' | 'allvsall' | 'live';

export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  gradientColors: [string, string];
}

export interface Question {
  id: string;
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  allAnswers: string[];
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  score: number;
  isBot: boolean;
  isLocal: boolean;
  team?: number;
  skillLevel?: number;
}

export interface GameState {
  categoryId: number;
  categoryName: string;
  mode: GameMode;
  gameCode: string | null;
  isHost: boolean;
  localPlayerId: string;
  players: Player[];
  questions: Question[];
  currentQuestionIndex: number;
  selectedAnswer: string | null;
  answerRevealed: boolean;
  scores: Record<string, number>;
  phase: 'idle' | 'lobby' | 'question' | 'revealing' | 'leaderboard' | 'finished';
}

export type GameAction =
  | { type: 'SETUP'; payload: Partial<GameState> }
  | { type: 'SET_QUESTIONS'; payload: Question[] }
  | { type: 'SET_PLAYERS'; payload: Player[] }
  | { type: 'ADD_PLAYER'; payload: Player }
  | { type: 'SET_PHASE'; payload: GameState['phase'] }
  | { type: 'SELECT_ANSWER'; payload: string | null }
  | { type: 'SET_ANSWER_REVEALED'; payload: boolean }
  | { type: 'UPDATE_SCORE'; payload: { playerId: string; points: number } }
  | { type: 'NEXT_QUESTION' }
  | { type: 'RESET' };
