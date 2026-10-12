export type Market = 'amazon' | 'facebook' | 'wayfair' | 'etsy' | 'westelm' | 'ikea' | 'homedepot' | 'lowes' | '1stdibs' | 'chairish' | 'cb2' | 'rh' | 'rejuvenation' | 'schoolhouse' | 'lumens' | 'tilebar' | 'floorlife' | 'build';

export const MARKET_NAMES: Record<Market, string> = {
  amazon: 'Amazon', facebook: 'Facebook Marketplace', wayfair: 'Wayfair', etsy: 'Etsy', westelm: 'West Elm', ikea: 'IKEA',
  homedepot: 'Home Depot', lowes: "Lowe's", '1stdibs': '1stDibs', chairish: 'Chairish', cb2: 'CB2', rh: 'RH',
  rejuvenation: 'Rejuvenation', schoolhouse: 'Schoolhouse', lumens: 'Lumens', tilebar: 'TileBar', floorlife: 'Floor & Decor', build: 'Build.com',
};

export const ALL_MARKETS: Market[] = ['amazon', 'facebook', 'wayfair', 'etsy', 'westelm', 'cb2', 'rh', 'rejuvenation', 'schoolhouse', 'lumens', 'ikea', 'homedepot', 'lowes', 'build', 'tilebar', 'floorlife', 'chairish', '1stdibs'];

export function marketUrl(m: Market, query: string): string {
  const q = encodeURIComponent(query);
  const plus = q.replace(/%20/g, '+');
  switch (m) {
    case 'amazon': return `https://www.amazon.com/s?k=${plus}`;
    case 'facebook': return `https://www.facebook.com/marketplace/search/?query=${q}`;
    case 'wayfair': return `https://www.wayfair.com/keyword.php?keyword=${plus}`;
    case 'etsy': return `https://www.etsy.com/search?q=${q}`;
    case 'westelm': return `https://www.westelm.com/search/results.html?words=${plus}`;
    case 'ikea': return `https://www.ikea.com/us/en/search/?q=${q}`;
    case 'homedepot': return `https://www.homedepot.com/s/${q}`;
    case 'lowes': return `https://www.lowes.com/search?searchTerm=${plus}`;
    case '1stdibs': return `https://www.1stdibs.com/search/?q=${q}`;
    case 'chairish': return `https://www.chairish.com/search?q=${q}`;
    case 'cb2': return `https://www.cb2.com/search?query=${q}`;
    case 'rh': return `https://rh.com/us/en/search/results?Ntt=${q}`;
    case 'rejuvenation': return `https://www.rejuvenation.com/search/results.html?words=${plus}`;
    case 'schoolhouse': return `https://www.schoolhouse.com/search?q=${q}`;
    case 'lumens': return `https://www.lumens.com/search?q=${q}`;
    case 'tilebar': return `https://www.tilebar.com/catalogsearch/result/?q=${q}`;
    case 'floorlife': return `https://www.flooranddecor.com/search?q=${q}`;
    case 'build': return `https://www.build.com/search?term=${q}`;
  }
}
