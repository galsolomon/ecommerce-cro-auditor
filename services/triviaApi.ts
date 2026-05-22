import { Question } from '../types';

const API_BASE = 'https://opentdb.com/api.php';

function decode(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function fetchQuestions(categoryId: number, amount = 10): Promise<Question[]> {
  const catParam = categoryId > 0 ? `&category=${categoryId}` : '';
  const url = `${API_BASE}?amount=${amount}&type=multiple&encode=url3986${catParam}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();

    if (data.response_code !== 0) throw new Error('API returned non-zero code');

    return data.results.map((item: any, i: number): Question => {
      const correct = decode(item.correct_answer);
      const wrong = item.incorrect_answers.map(decode);
      return {
        id: `q${Date.now()}${i}`,
        question: decode(item.question),
        correctAnswer: correct,
        incorrectAnswers: wrong,
        allAnswers: shuffle([correct, ...wrong]),
        category: decode(item.category),
        difficulty: item.difficulty,
      };
    });
  } catch {
    return getFallbackQuestions();
  }
}

function getFallbackQuestions(): Question[] {
  const raw = [
    { q: 'What is the capital of France?', a: 'Paris', w: ['London', 'Berlin', 'Madrid'] },
    { q: 'Which planet is closest to the Sun?', a: 'Mercury', w: ['Venus', 'Earth', 'Mars'] },
    { q: 'What is 7 × 8?', a: '56', w: ['54', '48', '64'] },
    { q: 'Who wrote Romeo and Juliet?', a: 'William Shakespeare', w: ['Charles Dickens', 'Jane Austen', 'Mark Twain'] },
    { q: 'What is the largest ocean on Earth?', a: 'Pacific Ocean', w: ['Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean'] },
    { q: 'In what year did World War II end?', a: '1945', w: ['1944', '1946', '1943'] },
    { q: 'What element has the symbol O?', a: 'Oxygen', w: ['Osmium', 'Oganesson', 'Gold'] },
    { q: 'Which country invented pizza?', a: 'Italy', w: ['France', 'Greece', 'Spain'] },
    { q: 'How many sides does a hexagon have?', a: '6', w: ['5', '7', '8'] },
    { q: 'What gas makes up most of Earth\'s atmosphere?', a: 'Nitrogen', w: ['Oxygen', 'Carbon Dioxide', 'Argon'] },
    { q: 'Which is the fastest land animal?', a: 'Cheetah', w: ['Lion', 'Greyhound', 'Horse'] },
    { q: 'What is the longest river in the world?', a: 'Nile', w: ['Amazon', 'Yangtze', 'Mississippi'] },
    { q: 'Who painted the Mona Lisa?', a: 'Leonardo da Vinci', w: ['Michelangelo', 'Raphael', 'Picasso'] },
    { q: 'What is the chemical formula for water?', a: 'H₂O', w: ['CO₂', 'O₂', 'H₂SO₄'] },
    { q: 'How many continents are on Earth?', a: '7', w: ['5', '6', '8'] },
  ];

  return shuffle(raw).slice(0, 10).map((item, i): Question => {
    const all = shuffle([item.a, ...item.w]);
    return {
      id: `fb${i}`,
      question: item.q,
      correctAnswer: item.a,
      incorrectAnswers: item.w,
      allAnswers: all,
      category: 'General Knowledge',
      difficulty: 'medium',
    };
  });
}
