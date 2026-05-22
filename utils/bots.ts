import { Player, Question } from '../types';
import { calculateScore, QUESTION_TIME } from './scoring';

const BOT_NAMES = [
  'QuizMaster', 'BrainStorm', 'TriviaPro', 'Smarty', 'EinsteinJr',
  'KnowItAll', 'BrainPower', 'MindBlast', 'QuizWiz', 'AcePlayer',
  'BigBrain', 'FlashMind', 'TopScore', 'SpeedDemon', 'NightOwl',
  'GeniusIQ', 'ThinkFast', 'QuizKing', 'BrainBox', 'MasterMind',
];

const BOT_AVATARS = ['🤖', '👾', '🎮', '🧠', '⚡', '🦊', '🐯', '🦅', '🐉', '🦁'];

export function generateBots(count: number): Player[] {
  const used = new Set<string>();
  return Array.from({ length: count }, (_, i) => {
    let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    while (used.has(name)) name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    used.add(name);
    return {
      id: `bot-${Date.now()}-${i}`,
      name,
      avatar: BOT_AVATARS[i % BOT_AVATARS.length],
      score: 0,
      isBot: true,
      isLocal: false,
      skillLevel: 0.3 + Math.random() * 0.6,
    };
  });
}

export function generateLiveBots(count: number): Player[] {
  const names = [
    'Alex', 'Sam', 'Jordan', 'Casey', 'Morgan', 'Riley', 'Taylor', 'Avery',
    'Quinn', 'Blake', 'Drew', 'Jamie', 'Ryan', 'Skyler', 'Reese', 'Parker',
    'Finley', 'Dakota', 'Sage', 'River', 'Hunter', 'Rowan', 'Emery', 'Peyton',
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: `live-${Date.now()}-${i}`,
    name: names[i % names.length] + (i >= names.length ? String(Math.floor(i / names.length) + 1) : ''),
    avatar: BOT_AVATARS[i % BOT_AVATARS.length],
    score: 0,
    isBot: true,
    isLocal: false,
    skillLevel: 0.3 + Math.random() * 0.6,
  }));
}

export interface BotMove {
  answer: string;
  delay: number;
  points: number;
}

export function planBotMove(bot: Player, question: Question): BotMove {
  const skill = bot.skillLevel ?? 0.5;
  const correct = Math.random() < skill;
  const answer = correct
    ? question.correctAnswer
    : question.incorrectAnswers[Math.floor(Math.random() * question.incorrectAnswers.length)];

  const delay = 1500 + Math.random() * 11500;
  const timeRemaining = correct ? Math.max(0, QUESTION_TIME - delay / 1000) : 0;
  return { answer, delay, points: correct ? calculateScore(timeRemaining) : 0 };
}
