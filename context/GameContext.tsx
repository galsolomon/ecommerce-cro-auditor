import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { GameState, GameAction } from '../types';

const initial: GameState = {
  categoryId: 9,
  categoryName: 'General Knowledge',
  mode: 'solo',
  gameCode: null,
  isHost: true,
  localPlayerId: 'local',
  players: [],
  questions: [],
  currentQuestionIndex: 0,
  selectedAnswer: null,
  answerRevealed: false,
  scores: {},
  phase: 'idle',
};

function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SETUP':
      return { ...initial, ...action.payload, phase: 'lobby' };

    case 'SET_QUESTIONS':
      return { ...state, questions: action.payload };

    case 'SET_PLAYERS':
      return {
        ...state,
        players: action.payload,
        scores: action.payload.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {} as Record<string, number>),
      };

    case 'ADD_PLAYER':
      return {
        ...state,
        players: [...state.players, action.payload],
        scores: { ...state.scores, [action.payload.id]: 0 },
      };

    case 'SET_PHASE':
      return { ...state, phase: action.payload };

    case 'SELECT_ANSWER':
      return { ...state, selectedAnswer: action.payload };

    case 'SET_ANSWER_REVEALED':
      return { ...state, answerRevealed: action.payload };

    case 'UPDATE_SCORE': {
      const current = state.scores[action.payload.playerId] ?? 0;
      return {
        ...state,
        scores: { ...state.scores, [action.payload.playerId]: current + action.payload.points },
      };
    }

    case 'NEXT_QUESTION': {
      const next = state.currentQuestionIndex + 1;
      if (next >= state.questions.length) return { ...state, phase: 'finished' };
      return {
        ...state,
        currentQuestionIndex: next,
        selectedAnswer: null,
        answerRevealed: false,
        phase: 'question',
      };
    }

    case 'RESET':
      return initial;

    default:
      return state;
  }
}

interface Ctx {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const GameContext = createContext<Ctx | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  return <GameContext.Provider value={{ state, dispatch }}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be inside GameProvider');
  return ctx;
}
