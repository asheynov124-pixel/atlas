// Level pictures. One character per cube; '.' is empty.
// R red, Y yellow, B blue, G green, P purple, K black, C cyan, O orange, N pink, W white, T brown.
//
// cols  - how many queue columns the hand has
// chunk - roughly how much ammo each jelly carries (cubes of a colour are split into jellies this size)
// mix   - how far the hand order is shuffled away from the easy order (0 = gentle)
// bg    - optional colour that fills the empty cells, so the subject starts out buried
//
// build.mjs turns these into src/levels.js, dealing a hand for each picture and
// proving with a bot that the level can be won.

export const PICTURES = [
  {
    // The procedural test board from BoardManager.GenerateSimpleLevel, at phone size.
    name: 'Warm-up', cols: 3, chunk: 12, mix: 0,
    art: [
      'RRRRRRRR',
      'RRRRRRRR',
      'BBBBBBBB',
      'BBBBBBBB',
      'BBBBBBBB',
      'YYGGGGYY',
      'YYGGGGYY',
      'YYGGGGYY',
      'YYGGGGYY'
    ]
  },
  {
    name: 'Heart', cols: 3, chunk: 10, mix: 1,
    art: [
      '.RRR...RRR.',
      'RRRRR.RRRRR',
      'RRNNRRRNNRR',
      'RRNNNNNNNRR',
      'RRNNNWNNNRR',
      '.RRNNNNNRR.',
      '..RRNNNRR..',
      '...RRNRR...',
      '....RRR....',
      '.....R.....'
    ]
  },
  {
    name: 'Apple Tree', cols: 3, chunk: 10, mix: 1,
    art: [
      '...GGGG...',
      '..GGGGGG..',
      '.GGGRGGGG.',
      '.GGGGGGRG.',
      'GGRGGGGGGG',
      'GGGGGGRGGG',
      '.GGGGGGGG.',
      '..GGGGGG..',
      '....TT....',
      '....TT....',
      '....TT....',
      '.YYYYYYYY.'
    ]
  },
  {
    name: 'Flower', cols: 4, chunk: 10, mix: 2, bg: 'C',
    art: [
      '....NNN....',
      '...NNNNN...',
      '.NN.NNN.NN.',
      'NNNNNYNNNNN',
      'NNNNYYYNNNN',
      'NNNNNYNNNNN',
      '.NN.NNN.NN.',
      '...NNNNN...',
      '....NNN....',
      '.....G.....',
      '..GG.G.GG..',
      '...GGGGG...'
    ]
  },
  {
    name: 'Duck', cols: 4, chunk: 10, mix: 3, bg: 'W',
    art: [
      '....YYYY....',
      '...YYYYYY...',
      '...YKYYYYOO.',
      '...YYYYYYOOO',
      '...YYYYYY...',
      'Y...YYYY....',
      'YY.YYYYYYY..',
      'YYYYYYYYYYY.',
      '.YYYYYYYYYY.',
      '..YYYYYYYY..',
      'BBBBBBBBBBBB',
      'CBBCBBCBBCBB'
    ]
  },
  {
    name: 'Rocket', cols: 4, chunk: 9, mix: 3, bg: 'K',
    art: [
      '....R....',
      '...RRR...',
      '..RRRRR..',
      '..WWWWW..',
      '..WCCCW..',
      '..WCCCW..',
      '..WWWWW..',
      '..WWWWW..',
      '.RWWWWWR.',
      'RRWWWWWRR',
      'RR.KKK.RR',
      '...OOO...',
      '..OYYYO..',
      '...OYO...'
    ]
  },
  {
    name: 'House', cols: 4, chunk: 10, mix: 4, bg: 'C',
    art: [
      '.....RR.....',
      '....RRRR....',
      '...RRRRRR...',
      '..RRRRRRRR..',
      '.RRRRRRRRRR.',
      'RRRRRRRRRRRR',
      '.YYYYYYYYYY.',
      '.YCCYYYYTTY.',
      '.YCCYYYYTTY.',
      '.YYYYYYYTTY.',
      '.YYYYYYYTTY.',
      'GGGGGGGGGGGG'
    ]
  },
  {
    name: 'Cat', cols: 4, chunk: 10, mix: 4, bg: 'P',
    art: [
      'OO........OO',
      'OOO......OOO',
      'ONOOOOOOOONO',
      'OOOOOOOOOOOO',
      'OOGKOOOOGKOO',
      'OOGKOOOOGKOO',
      'OOOOONNOOOOO',
      'OWWOOKKOOWWO',
      'OWWWWKKWWWWO',
      '.OWWWWWWWWO.',
      '..OOOOOOOO..'
    ]
  },
  {
    name: 'Fish', cols: 4, chunk: 10, mix: 5, bg: 'B',
    art: [
      '..........OO..',
      '...CCYC...OOO.',
      '..CCCYCY.OOOO.',
      '.CCKCYCYCOOO..',
      'CCCCCYCYCOO...',
      'CCCCCYCYCOO...',
      '.CCCCYCYCOOO..',
      '..CCCYCY.OOOO.',
      '...CCYC...OOO.',
      '..........OO..'
    ]
  },
  {
    name: 'Rainbow', cols: 4, chunk: 9, mix: 5, bg: 'C',
    art: [
      '...RRRRRRRR...',
      '..RROOOOOORR..',
      '.RROOYYYYOORR.',
      'RROOYYGGYYOORR',
      'RROYYGGGGYYORR',
      'RROYGGBBGGYORR',
      'RROYGB..BGYORR',
      'WWWWGB..BGWWWW',
      'WWWWW....WWWWW'
    ]
  },
  {
    name: 'Cupcake', cols: 5, chunk: 9, mix: 6, bg: 'C',
    art: [
      '.....RR.....',
      '....RRRR....',
      '....NNNN....',
      '...NNNNNN...',
      '..NNWNNNNN..',
      '.NNNNNNWNNN.',
      '.NNNNNNNNNN.',
      'NNNWNNNNNNNN',
      'NNNNNNNNNWNN',
      'YTYTYTYTYTYT',
      '.TYTYTYTYTY.',
      '.TYTYTYTYTY.',
      '..YTYTYTYT..',
      '..YTYTYTYT..'
    ]
  },
  {
    name: 'Sun', cols: 4, chunk: 10, mix: 3, bg: 'C',
    art: [
      '.....YY.....',
      '.Y...YY...Y.',
      '..Y.OOOO.Y..',
      '...OOYYOO...',
      '..OYYYYYYO..',
      'YYOYKYYKYOYY',
      'YYOYYYYYYOYY',
      '..OYYRRYYO..',
      '...OOYYOO...',
      '..Y.OOOO.Y..',
      '.Y...YY...Y.',
      '.....YY.....'
    ]
  },
  {
    name: 'Ice Cream', cols: 4, chunk: 9, mix: 4, bg: 'B',
    art: [
      '...NNNN...',
      '..NNWNNN..',
      '.NNNNNNNN.',
      '.CCCCCCCC.',
      'CCCWCCCCCC',
      'CCCCCCCWCC',
      '.TTTTTTTT.',
      '.TYTYTYTY.',
      '..TYTYTYT.',
      '..YTYTYT..',
      '...TYTYT..',
      '...YTYT...',
      '....TY....',
      '....YT....'
    ]
  },
  {
    name: 'Ghost', cols: 4, chunk: 10, mix: 4, bg: 'P',
    art: [
      '....WWWW....',
      '..WWWWWWWW..',
      '.WWWWWWWWWW.',
      '.WWKKWWKKWW.',
      'WWWKKWWKKWWW',
      'WWWWWWWWWWWW',
      'WWWWWNNWWWWW',
      'WWWWWWWWWWWW',
      'WWWWWWWWWWWW',
      'WWWWWWWWWWWW',
      'WW.WWW.WWW.W',
      'W...W...W...'
    ]
  },
  {
    name: 'Penguin', cols: 4, chunk: 10, mix: 5, bg: 'C',
    art: [
      '....KKK....',
      '...KKKKK...',
      '..KKWWWKK..',
      '..KWKWKWK..',
      '..KWWOWWK..',
      '.KKWWWWWKK.',
      'KKWWWWWWWKK',
      'KKWWWWWWWKK',
      '.KWWWWWWWK.',
      '.KKWWWWWKK.',
      '..KKWWWKK..',
      '...OO.OO...',
      '..OOO.OOO..'
    ]
  },
  {
    name: 'Strawberry', cols: 4, chunk: 10, mix: 5, bg: 'W',
    art: [
      '....GGGG....',
      '..GGGGGGGG..',
      '..RRGGGGRR..',
      '.RRRRGGRRRR.',
      'RRYRRRRRRYRR',
      'RRRRRYRRRRRR',
      'RYRRRRRRRYRR',
      'RRRRYRRRRRRR',
      '.RRRRRRYRRR.',
      '.RRYRRRRRRR.',
      '..RRRRRYRR..',
      '...RRRRRR...',
      '.....RR.....'
    ]
  },
  {
    name: 'Sailboat', cols: 4, chunk: 10, mix: 5, bg: 'C',
    art: [
      '......K......',
      '......KW.....',
      '.....WKWW....',
      '....WWKWWW...',
      '...WWWKWWWW..',
      '..WWWWKWWWWW.',
      '......K......',
      'TTTTTTTTTTTTT',
      '.TTTTTTTTTTT.',
      '..TTTTTTTTT..',
      'BBBBBBBBBBBBB',
      'BCBBBCBBBCBBB'
    ]
  },
  {
    name: 'Robot', cols: 5, chunk: 9, mix: 6, bg: 'P',
    art: [
      '.....RR.....',
      '.....KK.....',
      '..KKKKKKKK..',
      '..KWWWWWWK..',
      '..KWCWWCWK..',
      '..KWWWWWWK..',
      '..KWNNNNWK..',
      '..KKKKKKKK..',
      'KKKOOOOOOKKK',
      'K.KOYOOYOK.K',
      'K.KOOOOOOK.K',
      '..KKKKKKKK..',
      '..KK....KK..'
    ]
  },
  {
    name: 'Watermelon', cols: 5, chunk: 9, mix: 6, bg: 'C',
    art: [
      'GWRRRRRRRRRRWG',
      'GWRRKRRRRKRRWG',
      '.GWRRRRKRRRWG.',
      '.GWRKRRRRKRWG.',
      '..GWRRRKRRWG..',
      '...GWRRRRWG...',
      '....GWWWWG....',
      '.....GGGG.....'
    ]
  },
  {
    name: 'Butterfly', cols: 5, chunk: 9, mix: 6, bg: 'C',
    art: [
      '.PP.......PP.',
      'PNNP.....PNNP',
      'PNYNP...PNYNP',
      'PNNNNPKPNNNNP',
      '.PNNNPKPNNNP.',
      '..PPPPKPPPP..',
      '.PNNNPKPNNNP.',
      'PNYNNPKPNNYNP',
      'PNNNP...PNNNP',
      '.PPP.....PPP.'
    ]
  }
];
