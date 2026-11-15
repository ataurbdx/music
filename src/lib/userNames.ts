/**
 * Community Gaming-Style Username Generator
 * Creates memorable identifiers like 'Cosmic_Baul_482', 'Acoustic_Rider_109'
 */

const ADJECTIVES = [
  'Sonic',
  'Velvet',
  'Mystic',
  'Cosmic',
  'Acoustic',
  'Electric',
  'Lyrical',
  'Midnight',
  'Golden',
  'Shadow',
  'Emerald',
  'Silver',
  'Starlight',
  'Harmonic',
  'Nomad',
  'Campfire',
  'Baul',
  'Urban',
  'Vintage',
  'Radiant',
];

const NOUNS = [
  'Bard',
  'Rider',
  'Singer',
  'Vocalist',
  'Strummer',
  'Chanter',
  'Echo',
  'Drifter',
  'Soul',
  'Maestro',
  'Poet',
  'Melody',
  'Vibe',
  'Chord',
  'Adda',
  'Seeker',
  'Rhythm',
  'Sufi',
  'Traveler',
  'Notes',
];

export function generateGamingUsername(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${adj}_${noun}_${num}`;
}
