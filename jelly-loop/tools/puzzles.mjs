// Puzzle boards. Same characters as levels.mjs.
//
// A puzzle has ONE seat on the loop and a short belt (3 places), so each send plays out in
// full before the next. build.mjs deals the hand, finds the fewest sends that clear the
// board (that becomes the puzzle's move limit), and keeps the deal that random tapping
// solves least often.
//
// cols  - queue columns in the hand
// chunk - ammo per jelly (cubes of a colour are split into jellies this size)

export const PUZZLES = [
  {
    name: 'First Steps', cols: 2, chunk: 12,
    art: ['RRRRRR', 'RBBBBR', 'RBYYBR', 'RBYYBR', 'RBBBBR', 'RRRRRR']
  },
  {
    name: 'Stripes', cols: 2, chunk: 11,
    art: ['RRRRRRR', 'BBBBBBB', 'RRRRRRR', 'BBBBBBB', 'RRRRRRR', 'BBBBBBB']
  },
  {
    name: 'Window', cols: 2, chunk: 14,
    art: ['KKKKKKK', 'KCCKCCK', 'KCCKCCK', 'KKKKKKK', 'KCCKCCK', 'KCCKCCK', 'KKKKKKK']
  },
  {
    name: 'Target', cols: 3, chunk: 12,
    art: ['RRRRRRR', 'RWWWWWR', 'RWRRRWR', 'RWRYRWR', 'RWRRRWR', 'RWWWWWR', 'RRRRRRR']
  },
  {
    name: 'Cross', cols: 2, chunk: 14,
    art: ['BBBGBBB', 'BBBGBBB', 'BBBGBBB', 'GGGGGGG', 'BBBGBBB', 'BBBGBBB', 'BBBGBBB']
  },
  {
    name: 'Checkers', cols: 2, chunk: 9,
    art: ['RBRBRB', 'BRBRBR', 'RBRBRB', 'BRBRBR', 'RBRBRB', 'BRBRBR']
  },
  {
    name: 'Sandwich', cols: 3, chunk: 11,
    art: ['TTTTTTTT', 'YYYYYYYY', 'GGGGGGGG', 'RRRRRRRR', 'YYYYYYYY', 'TTTTTTTT']
  },
  {
    name: 'Diamond', cols: 3, chunk: 10,
    art: ['BBBPBBB', 'BBPPPBB', 'BPPYPPB', 'PPYYYPP', 'BPPYPPB', 'BBPPPBB', 'BBBPBBB']
  },
  {
    name: 'Twin Towers', cols: 3, chunk: 12,
    art: ['CRRCCRRC', 'CRRCCRRC', 'CRYCCYRC', 'CRRCCRRC', 'CRRCCRRC', 'GGGGGGGG', 'GGGGGGGG']
  },
  {
    name: 'Spiral', cols: 2, chunk: 13,
    art: ['OOOOOOO', 'KKKKKKO', 'OOOOOKO', 'OKKKOKO', 'OKOOOKO', 'OKKKKKO', 'OOOOOOO']
  },
  {
    name: 'Layer Cake', cols: 3, chunk: 12,
    art: ['NNNNNNNN', 'NWWWWWWN', 'NWNNNNWN', 'NWNYYNWN', 'NWNYYNWN', 'NWNNNNWN', 'NWWWWWWN', 'NNNNNNNN']
  },
  {
    name: 'Ice Box', cols: 2, chunk: 12,
    art: ['BBBBBBB', 'BbbbbbB', 'Bb###bB', 'Bb#R#bB', 'Bb###bB', 'BbbbbbB', 'BBBBBBB']
  }
];
