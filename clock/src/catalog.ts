export const PALETTES = [
  { id: 'night', name: 'Night cover' },
  { id: 'shu', name: 'Shu reprint' },
  { id: 'cloth', name: 'Indigo cloth' },
  { id: 'sumi', name: 'Sumi' },
] as const;

export const FACES = [
  { id: 'numeral', name: 'Numeral' },
  { id: 'dial', name: 'Dial' },
  { id: 'ribbon', name: 'Ribbon' },
] as const;

export const SOUNDS = [
  { id: 'tone', name: 'Tone' },
  { id: 'bell', name: 'Bell' },
  { id: 'pulse', name: 'Pulse' },
  { id: 'strike', name: 'Soft strike' },
] as const;

export const RITES = [
  { id: 'tap', name: 'Tap' },
  { id: 'math', name: 'Math' },
  { id: 'sequence', name: 'Sequence' },
  { id: 'phrase', name: 'Phrase' },
] as const;

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
