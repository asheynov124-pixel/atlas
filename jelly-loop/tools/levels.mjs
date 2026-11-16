// Level pictures. One character per cube; '.' is empty.
// R red, Y yellow, B blue, G green, P purple, K black, C cyan, O orange, N pink, W white, T brown.
// A lowercase letter is an ICE cube of that colour (two hits). '#' is a CRATE: it blocks its
// lanes and breaks when a cube beside it pops.
//
// cols  - how many queue columns the hand has
// chunk - roughly how much ammo each jelly carries at level 1 (cubes of a colour are split into
//         jellies this size). Jellies grow with the level: build.mjs adds one for every four
//         levels in (jellyChunk in src/deal.js), so later levels deal fewer, bigger jellies.
// mix   - how far the hand order is shuffled away from the easy order (0 = gentle)
// bg    - optional colour that fills the empty cells, so the subject starts out buried
// mystery - share of jellies dealt face down: their colour shows only at the front of the column
//
// locks - jellies dealt CHAINED: padlocked in the hand until a key cube on the picture pops
// boss  - every tenth level: { every: seconds, grow: cubes } - the picture grows back that many
//         popped cubes on that beat, and the hand gets jellies with just the ammo for them
// intro - which new piece this level shows a card for the first time
//
// build.mjs turns these into src/levels.js, dealing a hand for each picture and
// proving with a bot that the level can be won.

export const PICTURES = [
  {
    // 1
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
    // 2
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
    // 3
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
    // 4
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
    // 5
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
    // 6
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
    // 7
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
    // 8
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
    // 9
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
    // 10 - BOSS
    name: 'Slime King', cols: 4, chunk: 10, mix: 4, intro: 'boss', boss: { every: 20, grow: 8 },
    art: [
      'CCCYCCYCCYCC',
      'CCCYYYYYYYCC',
      'CCCYRYYBYYCC',
      'CCGGGGGGGGGC',
      'CGGGGGGGGGGG',
      'GGWWGGGGWWGG',
      'GGWKGGGGWKGG',
      'GGGGGGGGGGGG',
      'GGGKKKKKKGGG',
      'GGGKRRRRKGGG',
      'CGGGGGGGGGGC',
      'BBBBBBBBBBBB'
    ]
  },
  {
    // 11
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
    // 12
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
    // 13
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
    // 14
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
    // 15
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
    // 16
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
    // 17
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
    // 18
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
    // 19
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
    // 20 - BOSS
    name: 'Grumpy Cloud', cols: 4, chunk: 10, mix: 6, boss: { every: 20, grow: 10 },
    art: [
      'BBBBWWWWBBBBB',
      'BBBWWWWWWWBBB',
      'BWWwWWWWWwWWB',
      'WWWKKWWWKKWWW',
      'WWWWKWWWKWWWW',
      'WWWWWWWWWWWWW',
      'WWWWRRRRRWWWW',
      'BWWWWWWWWWWWB',
      'BBBBYBBBYBBBB',
      'BBBYYBBYYBBBB',
      'BBYYBBBYBBBBB',
      'BBBYBBYBBBBBB'
    ]
  },
  {
    // 21
    name: 'Ice Pond', cols: 4, chunk: 10, mix: 2, intro: 'ice',
    art: [
      'BBBBBBBBBBBB',
      'BbbBBBBBBbbB',
      'BbbbBWWBbbbB',
      'BBbBWWWWBbBB',
      'BBBBWKKWBBBB',
      'BBBBWWWWBBBB',
      'BbBBBOOBBBbB',
      'BbbBBBBBBbbB',
      'BBBBBBBBBBBB',
      'GGGGGGGGGGGG'
    ]
  },
  {
    // 22
    name: 'Snowman', cols: 4, chunk: 12, mix: 3,
    art: [
      'CCCCKKKCCCC',
      'CCCCKKKCCCC',
      'CCCKKKKKCCC',
      'CCCCwwwCCCC',
      'CCCwKwKwCCC',
      'CCCwwOwwCCC',
      'CCCRRRRRCCC',
      'CCwwwwwwwCC',
      'CwwwKwwwwwC',
      'CwwwwwwwwwC',
      'CwwwKwwwwwC',
      'CCwwwwwwwCC',
      'GGGGGGGGGGG'
    ]
  },
  {
    // 23
    name: 'Treasure Chest', cols: 4, chunk: 10, mix: 3, intro: 'crate',
    art: [
      'CCCCCCCCCCCC',
      'CC#TTTTTT#CC',
      'C#TTTTTTTT#C',
      'C#TYYYYYYT#C',
      'CTTTTYYTTTTC',
      'CTTTTKKTTTTC',
      'CTYTTYYTTYTC',
      'CTYTTTTTTYTC',
      'CTTTTTTTTTTC',
      'C##########C',
      'BBBBBBBBBBBB'
    ]
  },
  {
    // 24
    name: 'Lighthouse', cols: 4, chunk: 10, mix: 4,
    art: [
      'KKKKKYKKKKK',
      'KKKKYYYKKKK',
      'KKKKRRRKKKK',
      'KKKKWWWKKKK',
      'KKKKRRRKKKK',
      'KKKKWWWKKKK',
      'KKKKRRRKKKK',
      'KKKWWWWWKKK',
      'KKKRRRRRKKK',
      'KK##WWW##KK',
      'K###RRR###K',
      'bbbbbbbbbbb',
      'BbBBbBBbBBb',
      'BBBBBBBBBBB'
    ]
  },
  {
    // 25
    name: 'Mystery Gift', cols: 4, chunk: 10, mix: 3, mystery: 0.35, intro: 'mystery',
    art: [
      'NNNNNYYNNNNN',
      'NNNNYNNYNNNN',
      'NNNNNYYNNNNN',
      'NPPPPYYPPPPN',
      'NPPPPYYPPPPN',
      'NYYYYYYYYYYN',
      'NPPPPYYPPPPN',
      'NPPPPYYPPPPN',
      'NPPPPYYPPPPN',
      'NPPPPYYPPPPN',
      'NPPPPYYPPPPN',
      'NNNNNNNNNNNN'
    ]
  },
  {
    // 26
    name: 'Castle', cols: 5, chunk: 10, mix: 4, mystery: 0.25,
    art: [
      'CCRCCCCCCCCRCC',
      'CRRRCCCCCCRRRC',
      'CWWWCCYCCCWWWC',
      'CWKWCCYYCCWKWC',
      'CWWWCRRRCCWWWC',
      'CWWWWWWWWWWWWC',
      'CWWKWWWWWKWWWC',
      'CWWWWW##WWWWWC',
      'CWWWW####WWWWC',
      'CWWWW#TT#WWWWC',
      'CWWWW#TT#WWWWC',
      'GGGGGGGGGGGGGG',
      'GGGGGGGGGGGGGG'
    ]
  },
  {
    // 27
    name: 'Hot Air Balloon', cols: 5, chunk: 10, mix: 4, mystery: 0.3,
    art: [
      'CwwCCCCCCCwwC',
      'wwwwCRRRCwwww',
      'CCCCRYYYRCCCC',
      'CCCRYRRRYRCCC',
      'CCRYRYYYRYRCC',
      'CCRYRYYYRYRCC',
      'CCRYRYYYRYRCC',
      'CCCRYRRRYRCCC',
      'CCCCRYYYRCCCC',
      'CCCCCKCKCCCCC',
      'CCCCCKCKCCCCC',
      'CwwCCTTTCCCww',
      'wwwwCTTTCCwww',
      'GGGGGGGGGGGGG'
    ]
  },
  {
    // 28
    name: 'Dragon', cols: 5, chunk: 10, mix: 5, mystery: 0.3,
    art: [
      'KKKKKKKKKKKKKKK',
      'KKGGGKKKKKKKKKK',
      'KGGKGGKKKKKKKKK',
      'KGGGGGGORRKKKKK',
      'KKGGGGooRRRKKKK',
      'KKKGGKKORRKKKKK',
      'KKKGGGKKKKKGGKK',
      'KKGGYGGGKKGGGGK',
      'KGGYYYGGGGGKKGK',
      'KGGYYYGGGGKKKKK',
      'KKGGYGGGGKKKKKK',
      'KKGGKGGKGGKKKKK',
      '##############K'
    ]
  },
  {
    // 29
    name: 'Night City', cols: 5, chunk: 9, mix: 5, mystery: 0.25,
    art: [
      'KKYKKKKKKKYKKKK',
      'KKKKKKYKKKKKKKK',
      'KPPPKKKKKKKBBBK',
      'KPYPKKCCCKKBYBK',
      'KPPPKKCYCKKBBBK',
      'KPYPKKCCCKKBYBK',
      'KPPPBBCYCPPBBBK',
      'KPyPBYCCCPYBYBK',
      'KPPPBBCYCPPBBBK',
      'KPYPByCCCPyBYBK',
      'KPPPBBCCCPPBBBK',
      '#T##T##T##T##T#',
      'WWWWWWWWWWWWWWW'
    ]
  },
  {
    // 30 - BOSS
    name: 'Yeti', cols: 5, chunk: 10, mix: 6, mystery: 0.2, boss: { every: 20, grow: 12 },
    art: [
      'CCCCWWWWWWCCCC',
      'CCCWWWWWWWWCCC',
      'CCWWBBBBBBWWCC',
      'CCWBBKBBKBBWCC',
      'CCWBBBBBBBBWCC',
      'CCWBBWWWWBBWCC',
      'CWWWBBBBBBWWWC',
      'WWWWWWWWWWWWWW',
      'WwWWWWWWWWWWwW',
      'WWCWWWWWWWWCWW',
      'WWCWWWWWWWWCWW',
      'CCCWWWCCWWWCCC',
      'CCCKKKCCKKKCCC',
      'wwwwwwwwwwwwww'
    ]
  },
  {
    // 31
    name: 'Octopus', cols: 5, chunk: 9, mix: 5, mystery: 0.3,
    art: [
      'BBBBBNNNNNNBBBBB',
      'BBBBNNNNNNNNBBBB',
      'BcBNNNNNNNNNNBBB',
      'BBBNNWKNNWKNNBcB',
      'BBBNNWKNNWKNNBBB',
      'BBBNNNNNNNNNNBBB',
      'BBBBNNNRRNNNBBBB',
      'BBBNNNNNNNNNNBBB',
      'BBNNBNNBBNNBNNBB',
      'BNNBBNNBBNNBBNNB',
      'BNBBNNBBBBNNBBNB',
      'BNBBNBBcBBBNBBNB',
      'BBBBNBBBBBBNBBBB',
      'YYYYYYYYYYYYYYYY',
      'yyyyyyyyyyyyyyyy'
    ]
  },
  {
    // 32
    name: 'Mushroom', cols: 5, chunk: 9, mix: 5, mystery: 0.3, locks: 1, intro: 'lock',
    art: [
      'CCCCCRRRRRCCCCC',
      'CCCRRWWRRRRRCCC',
      'CCRRWWWRRRWWRCC',
      'CRRRRWRRRRWWWRC',
      'CRRRRRRRRRRWRRC',
      'RRWWRRRRRRRRRRR',
      'RWWWWRRRWWRRRRR',
      'RRWWRRRWWWWRRRR',
      'CCCCCWWWWWCCCCC',
      'CCCCCWKWKWCCCCC',
      'CCCCCWWWWWCCCCC',
      'CCCCCWWWWWCCCCC',
      'GGGGGWWWWWGGGGG',
      'G##GGGGGGGGG##G',
      'ggggggggggggggg'
    ]
  },
  {
    // 33
    name: 'Owl', cols: 5, chunk: 9, mix: 5, mystery: 0.35, locks: 1,
    art: [
      'KKKyKKKKKKKKyKK',
      'KKTTKKKKKKKTTKK',
      'KKTTTTTTTTTTTKK',
      'KTTWWWTTTWWWTTK',
      'KTWWYYWTWYYWWTK',
      'KTWYKKYTYKKYWTK',
      'KTWWYYWTWYYWWTK',
      'KTTWWWTOTWWWTTK',
      'KTTTTTTOTTTTTTK',
      'KTTWTWTTTWTWTTK',
      'KTTTWTWTWTWTTTK',
      'KTTWTWTTTWTWTTK',
      'KKTTTTTTTTTTTKK',
      'KKKTTTTTTTTTKKK',
      'KKKOOKKKKKOOKKK',
      'TTTTTTTTTTTTTTT'
    ]
  },
  {
    // 34
    name: 'Cactus', cols: 5, chunk: 9, mix: 5, mystery: 0.3, locks: 1,
    art: [
      'YYYYYYNNYYYYYY',
      'YYYYYGGGGYYYYY',
      'YYYYYGgGGYYYYY',
      'YGGYYGGGgYYYYY',
      'YGgYYGGGGYYGGY',
      'YGGYYGgGGYYGgY',
      'YGGGGGGGGYYGGY',
      'YYGGGGGGgGGGGY',
      'YYYYYGGGGGGGYY',
      'YYYYYGgGGYYYYY',
      'YYYYYGGGGYYYYY',
      'YYYYYGGgGYYYYY',
      'YYYOOOOOOOOYYY',
      'YYYYOOOOOOYYYY',
      'YYYYOOOOOOYYYY',
      'TTTTTTTTTTTTTT'
    ]
  },
  {
    // 35
    name: 'Hamburger', cols: 5, chunk: 10, mix: 5, mystery: 0.3, locks: 2,
    art: [
      'CCCCCCCCCCCCCCCC',
      'CCCCTTTTTTTTCCCC',
      'CCTTTWTTTTWTTTCC',
      'CTTTTTTTWTTTTTTC',
      'CTTWTTTTTTTTWTTC',
      'CGGGGGGGGGGGGGGC',
      'CRRRRRRRRRRRRRRC',
      'CYYYYYYYYYYYYYYC',
      'CKKKKKKKKKKKKKKC',
      'CKkKKkKKKkKKkKKC',
      'CGgGGgGGgGGgGGgC',
      'CTTTTTTTTTTTTTTC',
      'CCTTTTTTTTTTTTCC',
      '################'
    ]
  },
  {
    // 36
    name: 'Saturn', cols: 5, chunk: 10, mix: 5, mystery: 0.35, locks: 1,
    art: [
      'KKKKKKKKKKKKKyKK',
      'KKyKKKOOOOKKKKKK',
      'KKKKKOOYYOOKKKKK',
      'KKKKOYYYYYYOKKKK',
      'wwKKOOOOOOOOKKww',
      'KwwwOYYYYYYOwwwK',
      'KKKwwwwwwwwwwKKK',
      'KKKKOwwwwwwOKKKK',
      'KKKKOYYYYYYOKKKK',
      'KKKKKOOYYOOKKKKK',
      'KKyKKKOOOOKKKKKK',
      'KKKKKKKKKKKKKyKK',
      'KKKKyKKKKKKKKKKK',
      'KKKKKKKKKKyKKKKK'
    ]
  },
  {
    // 37
    name: 'Volcano', cols: 5, chunk: 10, mix: 6, mystery: 0.35, locks: 2,
    art: [
      'CCCCCCWWWWCCCCCC',
      'CCCCCWWWWWWCCCCC',
      'CCCCCCWWWWCCCCCC',
      'CCCCCCCOOCCCCCCC',
      'CCCCCCROORCCCCCC',
      'CCCCCCRRORCCCCCC',
      'CCCCCTRORRTCCCCC',
      'CCCCTTTRRTTTCCCC',
      'CCCTTTTORTTTTCCC',
      'CCTTKTTTOTTKTTCC',
      'CTTTTTKTTTTTTTTC',
      'TTKTTTTTTKTTTKTT',
      'TTTTKTTTTTTTTTTT',
      '##TTTTT##TTTTT##',
      'GGGGGGGGGGGGGGGG'
    ]
  },
  {
    // 38
    name: 'Turtle', cols: 5, chunk: 10, mix: 6, mystery: 0.35, locks: 2,
    art: [
      'BBBBBBBGGBBBBBBB',
      'BBBBBGGGGGGBBBBB',
      'BBBBGTTGGTTGBBBB',
      'BBBGTGGTTGGTGBBB',
      'BGGGTGGTTGGTGGGB',
      'GGBGGTTGGTTGGBGG',
      'BBBGTGGTTGGTGBBB',
      'BBBBGTTGGTTGBBBB',
      'BBBGGGGGGGGGGBBB',
      'BBGGBBBBBBBBGGBB',
      'BBBBBBBBBBBBBBBB',
      'bBBBbBBBbBBBbBBB',
      'BBbBBBbBBBbBBBbB',
      'YYYYYYYYYYYYYYYY'
    ]
  },
  {
    // 39
    name: 'Pirate Ship', cols: 5, chunk: 10, mix: 6, mystery: 0.35, locks: 2,
    art: [
      'CCCCCCCKKCCCCCCC',
      'CCCCCCCKWCCCCCCC',
      'CCCCCCCTCCCCCCCC',
      'CCCWWWWTWWWWCCCC',
      'CCCWwWWTWWwWCCCC',
      'CCCWWWWTWWWWCCCC',
      'CCCCWWWTWWWCCCCC',
      'CCWWWWWTWWWWWCCC',
      'CCWWwWWTWWwWWCCC',
      'CCWWWWWTWWWWWCCC',
      'CCCCCCCTCCCCCCCC',
      'TTTTTTTTTTTTTTTT',
      'CTT#TT#TT#TT#TTC',
      'CCTTTTTTTTTTTTCC',
      'BBBbBBBBbBBBBbBB',
      'bBBBBbBBBBBbBBBB'
    ]
  },
  {
    // 40 - BOSS
    name: 'Robo Rex', cols: 5, chunk: 10, mix: 6, mystery: 0.25, boss: { every: 20, grow: 14 },
    art: [
      'KKKKKKKOOOOOOKK',
      'KKKKKKOOOOOOOOK',
      'KKKKKKOORROOOOK',
      'KKKKKKOOOOOOOOO',
      'KKKKKKOOOWWWWWW',
      'KKKKKKOOOOOOOOO',
      'KKKKKOOOOOKKKKK',
      'KKKKOOOOOOOYKKK',
      'KOKOOOOOOOOKKKK',
      'KOOoOOOoOOKKKKK',
      'KKOOOOOOOKKKKKK',
      'KKKOOKKOOKKKKKK',
      'KKKOOKKOOKKKKKK',
      '#KKOO##OO#KKKK#',
      'TTTTTTTTTTTTTTT'
    ]
  },
  {
    // 41
    name: 'Whale', cols: 5, chunk: 10, mix: 6, mystery: 0.4, locks: 2,
    art: [
      'CCCCCCWCCWCCCCCC',
      'CCCCCCCWWCCCCCCC',
      'CCCCCCCCWCCCCCCC',
      'CCCCBBBBBBBBCCCC',
      'CCBBBBBBBBBBBBCC',
      'CBBBBBBBBBBBBBBC',
      'BBWKBBBBBBBBBBBB',
      'BBBBBBBBBBBBBBBC',
      'BWWWWWWWWWBBBBBB',
      'CWWWWWWWWWWBBBCC',
      'CCWWWWWWWWBBBCCC',
      'bbbbbbbbbbbbbbbb',
      'BBbBBBBbBBBBbBBB',
      'BBBBBBBBBBBBBBBB'
    ]
  },
  {
    // 42
    name: 'Lantern', cols: 5, chunk: 10, mix: 6, mystery: 0.4, locks: 2,
    art: [
      'KKKKKKYYKKKKKK',
      'KKKKKKYYKKKKKK',
      'KKKKTTTTTTKKKK',
      'KKKRRRRRRRRKKK',
      'KKRRYRRRRYRRKK',
      'KRRRYRRRRYRRRK',
      'KRRRYRRRRYRRRK',
      'KRRRYRRrrYRRRK',
      'KRRRYRRrrYRRRK',
      'KRRRYRRRRYRRRK',
      'KKRRYRRRRYRRKK',
      'KKKRRRRRRRRKKK',
      'KKKKTTTTTTKKKK',
      'KKKKKKYYKKKKKK',
      'KKKKKYYYYKKKKK',
      '#KKKKYKKYKKKK#'
    ]
  },
  {
    // 43
    name: 'Crown', cols: 5, chunk: 10, mix: 6, mystery: 0.4, locks: 2,
    art: [
      'CCYCCCCYYCCCCYCC',
      'CCYYCCCYYCCCYYCC',
      'CCYYYCYYYYCYYYCC',
      'CCYYYYYYYYYYYYCC',
      'CCYRYYYBBYYYRYCC',
      'CCYYYYYYYYYYYYCC',
      'CCYYyyYYYYyyYYCC',
      'CCYYYYYNNYYYYYCC',
      'CCYYYYYYYYYYYYCC',
      'CCPPPPPPPPPPPPCC',
      'CPPPPPPPPPPPPPPC',
      'C#PPP#PPPP#PPP#C',
      'CCCCCCCCCCCCCCCC'
    ]
  },
  {
    // 44
    name: 'Cherry Blossom', cols: 5, chunk: 10, mix: 6, mystery: 0.4, locks: 2,
    art: [
      'CCNNNCCCCCNNNCCC',
      'CNNnNNCCCNNnNNCC',
      'CNnNNNNCNNNNnNCC',
      'CCNNTNNCNNTNNCCC',
      'CCCCCTCCCTCCCCCC',
      'CNNNCCTCTCCNNNCC',
      'NNnNNCCTCCNNnNNC',
      'CNNNNTTTTTTNNNNC',
      'CCNNCCTTTTCCNNCC',
      'CCCCCCCTTCCCCCCC',
      'CCCCCCCTTCCCCCCC',
      'CCCCCCCTTCCCCCCC',
      'CCCCCCTTTTCCCCCC',
      'GGGGGTTTTTTGGGGG',
      'GgGGGGGGGGGGGgGG',
      'GGGGgGGGGGGgGGGG'
    ]
  },
  {
    // 45
    name: 'Galaxy', cols: 5, chunk: 10, mix: 6, mystery: 0.4, locks: 3,
    art: [
      'KKKKKKKPPKKKKKKK',
      'KKyKKKPPPPKKKKyK',
      'KKKKKPPNNPPKKKKK',
      'KKKKPPNNNNPPKKKK',
      'KKKPPNNWWNNPPKKK',
      'KKPPNNWYYWNNPPKK',
      'KPPNNWYyyYWNNPPK',
      'PPNNWYyYYyYWNNPP',
      'KPPNNWYyyYWNNPPK',
      'KKPPNNWYYWNNPPKK',
      'KKKPPNNWWNNPPKKK',
      'KKKKPPNNNNPPKKKK',
      'KKKKKPPNNPPKKKKK',
      'KyKKKKPPPPKKKKyK',
      'KKKKKKKPPKKKKKKK',
      '##KKK##KK##KKK##',
      'CCCCCCCCCCCCCCCC'
    ]
  },
  {
    // 46
    name: 'Rainbow', cols: 4, chunk: 9, mix: 5, bg: 'C', locks: 2,
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
    // 47
    name: 'Butterfly', cols: 5, chunk: 9, mix: 6, bg: 'C', locks: 2,
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
  },
  {
    // 48
    name: 'Peacock', cols: 5, chunk: 9, mix: 6, mystery: 0.3, locks: 3,
    art: [
      'CCCCBBBBBBBCCCC',
      'CCBBGGGGGGGBBCC',
      'CBGGBBBBBBBGGBC',
      'BGBBPPPPPPPBBGB',
      'BGBPPGGGGGPPBGB',
      'BGBPGGbbbGGPBGB',
      'BGBPGbbYbbGPBGB',
      'CBGBPGbbbGPBGBC',
      'CCBGBPPBPPBGBCC',
      'CCCBGBBKBBGBCCC',
      'CCCCCBBBBBCCCCC',
      'CCCCCCBBBCCCCCC',
      'CCCCCCBOBCCCCCC',
      'CC####TTT####CC',
      'GGGGGGGGGGGGGGG'
    ]
  },
  {
    // 49
    name: 'Fox', cols: 5, chunk: 10, mix: 6, mystery: 0.4, locks: 3,
    art: [
      'GGOGGGGGGGGGGOGG',
      'GOOOGGGGGGGGOOOG',
      'GOWOOGGGGGGOOWOG',
      'GOWWOOOOOOOOWWOG',
      'GOOOOOOOOOOOOOOG',
      'OOOKKOOOOOOKKOOO',
      'OOOOOOOOOOOOOOOO',
      'WOOOOOOOOOOOOOOW',
      'WWOOOOOKKOOOOOWW',
      'GWWWOOOKKOOOWWWG',
      'GGWWWWOOOOWWWWGG',
      'GGGWWWWWWWWWWGGG',
      'GGGGWWWWWWWWGGGG',
      'gggggggggggggggg'
    ]
  }
];
