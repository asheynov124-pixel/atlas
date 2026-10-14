/**
 * Presentation-only configuration per dossier: schematic map labels and timeline scale breaks.
 * Nothing here is a fact about a case; positions are approximate to named places on a schematic.
 */
export type Schematic = {
  viewBox: string; aspect: string;
  places: { name: string; x: number; y: number }[];
  roads: { label: string; x: number; y: number; color?: string; size?: number }[];
  sites: { label: string; match: RegExp; x: number; y: number }[];
  offMap: { title: string; match: RegExp } | null;
  base: string;
};

export const SCHEMATICS: Record<string, Schematic> = {
  'gary-ridgway': {
    viewBox: '0 0 960 640', aspect: '3 / 2',
    places: [['Seattle', 32.6, 24.17], ['SeaTac', 28.5, 49.0], ['Kent', 41.0, 59.4], ['Auburn', 41.6, 74.6], ['Tacoma', 24.7, 79.3], ['Enumclaw', 56.6, 86.9], ['North Bend', 71.1, 41.4], ['Renton', 41.2, 43.9], ['Federal Way', 22.0, 73.6], ['Maple Valley', 54.6, 55.6], ['Bellevue', 43.0, 21.0]].map(([name, x, y]) => ({ name: name as string, x: x as number, y: y as number })),
    roads: [
      { label: 'I-5', x: 36.2, y: 2.6 }, { label: 'I-90', x: 84, y: 58 }, { label: 'SR 18', x: 57, y: 66 }, { label: 'SR 410', x: 68, y: 95 },
      { label: 'PACIFIC HWY S', x: 36, y: 39.6, color: '#C9A35C', size: 10.5 }, { label: 'GREEN RIVER', x: 40, y: 63.6, color: '#7FA7C9', size: 10.5 },
    ],
    sites: [
      { label: 'STAR LAKE RD', match: /Star Lake/i, x: 21.2, y: 62.0 }, { label: 'GREEN RIVER', match: /Green River/i, x: 41.5, y: 55.5 },
      { label: 'SEATAC AIRPORT', match: /SeaTac airport/i, x: 18.0, y: 52.6 }, { label: 'MOUNTAIN VIEW CEM.', match: /Mountain View Cemetery/i, x: 40.6, y: 77.6 },
      { label: 'SR 410', match: /SR 410/i, x: 66.6, y: 89.6 }, { label: 'SR 18 / I-90', match: /SR 18 & I-90|Snoqualmie/i, x: 66.4, y: 32.6 }, { label: 'I-90 EXIT 38', match: /Exit 38/i, x: 81.8, y: 45.0 },
    ],
    offMap: { title: 'OFF MAP · 220 KM SOUTH', match: /Tigard/i },
    base: 'Base: US Census counties via us-atlas · roads schematic',
  },
};

export const TIMELINE_BREAKS: Record<string, { domain: number[]; range: number[]; ticks: [number, string][]; breaks: number[] }> = {
  'gary-ridgway': {
    domain: [1982, 1991, 2000, 2004, 2026], range: [0, 62, 70, 90, 100], breaks: [1991, 2000, 2004],
    ticks: [[1982, '1982'], [1983, "'83"], [1984, "'84"], [1985, "'85"], [1986, "'86"], [1987, "'87"], [1988, "'88"], [1989, "'89"], [1990, "'90"], [1991, '1991'], [1995, '1995'], [2000, '2000'], [2001, '2001'], [2002, '2002'], [2003, '2003'], [2004, ''], [2010, '2010'], [2020, '2020']],
  },
};
