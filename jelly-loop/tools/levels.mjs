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
  },
  // ---------- 21-30: ice, crates and mystery jellies ----------
  {
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
    name: 'Peacock', cols: 5, chunk: 9, mix: 6, mystery: 0.3,
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
  // ---------- 31-45: bigger pictures, bigger jellies ----------
  {
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
    name: 'Mushroom', cols: 5, chunk: 9, mix: 5, mystery: 0.3,
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
    name: 'Owl', cols: 5, chunk: 9, mix: 5, mystery: 0.35,
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
    name: 'Cactus', cols: 5, chunk: 9, mix: 5, mystery: 0.3,
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
    name: 'Hamburger', cols: 5, chunk: 10, mix: 5, mystery: 0.3,
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
    name: 'Saturn', cols: 5, chunk: 10, mix: 5, mystery: 0.35,
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
    name: 'Volcano', cols: 5, chunk: 10, mix: 6, mystery: 0.35,
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
    name: 'Turtle', cols: 5, chunk: 10, mix: 6, mystery: 0.35,
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
    name: 'Pirate Ship', cols: 5, chunk: 10, mix: 6, mystery: 0.35,
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
    name: 'Fox', cols: 5, chunk: 10, mix: 6, mystery: 0.4,
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
  },
  {
    name: 'Whale', cols: 5, chunk: 10, mix: 6, mystery: 0.4,
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
    name: 'Lantern', cols: 5, chunk: 10, mix: 6, mystery: 0.4,
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
    name: 'Crown', cols: 5, chunk: 10, mix: 6, mystery: 0.4,
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
    name: 'Cherry Blossom', cols: 5, chunk: 10, mix: 6, mystery: 0.4,
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
    name: 'Galaxy', cols: 5, chunk: 10, mix: 6, mystery: 0.4,
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
  }
];
