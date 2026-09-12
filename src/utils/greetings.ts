const MORNING_GREETINGS = ['Good morning!', 'Hello Ka Suki!', 'Morning! How can we help?'];
const AFTERNOON_GREETINGS = ['Good afternoon!', 'Need help?', 'Hello Ka Suki!'];
const EVENING_GREETINGS = ['Good evening!', 'Hi there!', 'Hello Ka Suki!'];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return pickRandom(MORNING_GREETINGS);
  if (hour >= 12 && hour < 18) return pickRandom(AFTERNOON_GREETINGS);
  return pickRandom(EVENING_GREETINGS);
}

export const TYPING_PLACEHOLDER_MESSAGES = [
  'Type your message here...',
  'Chat seller?',
  'Need help?',
  'Hello Ka Suki!',
  'Ask us anything!',
];
