const adjectives = [
  'Calm',
  'Gentle',
  'Quiet',
  'Kind',
  'Brave',
  'Peaceful',
  'Warm',
  'Hopeful',
  'Soft',
  'Steady',
];

const nouns = [
  'Moon',
  'Star',
  'Cloud',
  'River',
  'Breeze',
  'Light',
  'Sky',
  'Willow',
  'Dawn',
  'Ocean',
];

function generateAnonymousName() {
  const adjective =
    adjectives[Math.floor(Math.random() * adjectives.length)];

  const noun =
    nouns[Math.floor(Math.random() * nouns.length)];

  const number =
    Math.floor(1000 + Math.random() * 9000);

  return `${adjective} ${noun} ${number}`;
}

module.exports = {
  generateAnonymousName,
};