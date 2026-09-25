import { p, countWords } from '../markup';
import type { KnowledgeRecord, Section, Paragraph, QuickFact } from '../types';

interface Draft {
  id: string;
  title: string;
  description: string;
  aliases?: string[];
  lead: string[];
  facts?: QuickFact[];
  sections: { heading: string; paragraphs: string[] }[];
  categories: string[];
  first: number;
  spoil: number;
  assigned?: boolean;
  layer?: string;
}

function build(d: Draft): KnowledgeRecord {
  const lead: Paragraph[] = d.lead.map(p);
  const sections: Section[] = d.sections.map((s, i) => ({
    id: `${d.id}-s${i + 1}`,
    heading: s.heading,
    level: 2 as const,
    paragraphs: s.paragraphs.map(p),
  }));
  const wordCount = countWords(lead) + sections.reduce((n, s) => n + countWords(s.paragraphs), 0);
  return {
    id: d.id,
    title: d.title,
    lang: 'en',
    description: d.description,
    aliases: d.aliases ?? [],
    leadImage: { seed: d.id, caption: d.title },
    lead,
    quickFacts: d.facts,
    sections,
    categories: d.categories,
    wordCount,
    updatedAt: '2026-09-25T06:00:00Z',
    languagesAvailable: ['en'],
    first: d.first,
    spoil: d.spoil,
    assigned: d.assigned ?? true,
    layer: d.layer,
  };
}

const drafts: Draft[] = [
  {
    id: 'odysseus',
    title: 'Odysseus',
    description: 'The man the song is about',
    aliases: ['Ulysses'],
    first: 1,
    spoil: 1,
    layer: 'story',
    lead: ['**Odysseus** is already known at this watermark. On [[scheria|Scheria]] he sits in the hall of [[alcinous|Alcinous]] and weeps when the bard sings of [[troy|Troy]].'],
    facts: [{ label: 'First', value: 'Book 1' }, { label: 'Safe at', value: 'Book 8' }],
    sections: [{ heading: 'At book 8', paragraphs: ['He has not yet named himself to the Phaeacians.'] }],
    categories: ['character', 'story'],
  },
  {
    id: 'book-8',
    title: 'Book 8',
    description: 'Games on Scheria',
    first: 8,
    spoil: 8,
    layer: 'story',
    lead: ['The games are over. [[odysseus|Odysseus]] weeps at the song of [[troy|Troy]]. [[alcinous|Alcinous]] sees it and will ask who he is.'],
    facts: [{ label: 'Setting', value: 'Scheria', linkTo: 'scheria' }, { label: 'Watermark', value: 'You are here' }],
    sections: [{ heading: 'What is safe', paragraphs: ['Everything that has already been sung. [[penelope|Penelope]] exists as a name. Her later trial does not.'] }],
    categories: ['book', 'story'],
  },
  {
    id: 'troy',
    title: 'Troy',
    description: 'The war already sung',
    aliases: ['Ilium'],
    first: 1,
    spoil: 8,
    layer: 'story',
    lead: ['The fall of **Troy** is behind the watermark. The bard on [[scheria|Scheria]] is singing it now.'],
    facts: [{ label: 'First', value: 'Book 1' }],
    sections: [{ heading: 'In the song', paragraphs: ['[[odysseus|Odysseus]] cannot hear the name of the city without weeping.'] }],
    categories: ['place', 'story'],
  },
  {
    id: 'alcinous',
    title: 'Alcinous',
    description: 'King of the Phaeacians',
    first: 6,
    spoil: 13,
    layer: 'story',
    lead: ['**Alcinous** is host on [[scheria|Scheria]]. Safe to meet at book 8. What he does after the guest is named belongs later.'],
    facts: [{ label: 'First', value: 'Book 6' }, { label: 'Sealed after', value: 'Book 13' }],
    sections: [{ heading: 'Related', paragraphs: ['The island is [[scheria|Scheria]]. Home across the water is [[ithaca|Ithaca]].'] }],
    categories: ['character', 'story'],
  },
  {
    id: 'scheria',
    title: 'Scheria',
    description: 'Phaeacian island',
    first: 6,
    spoil: 13,
    layer: 'story',
    lead: ['**Scheria** is the island of safety before the return. [[alcinous|Alcinous]] rules it.'],
    facts: [{ label: 'First', value: 'Book 6' }, { label: 'Sealed after', value: 'Book 13' }],
    sections: [{ heading: 'Across the water', paragraphs: ['[[ithaca|Ithaca]] is waiting.'] }],
    categories: ['place', 'story'],
  },
  {
    id: 'penelope',
    title: 'Penelope',
    description: 'Sealed after book 8',
    first: 1,
    spoil: 19,
    layer: 'story',
    lead: ['**Penelope** is a name you already know. Her later trial belongs to book 19. Opening her as Extra does not move the watermark.'],
    facts: [{ label: 'First', value: 'Book 1' }, { label: 'Sealed after', value: 'Book 19' }],
    sections: [{ heading: 'Not yet', paragraphs: ['The hall, the bow, and [[the-return|the return]] stay on the other side of the clock.'] }],
    categories: ['character', 'story'],
  },
  {
    id: 'ithaca',
    title: 'Ithaca',
    description: 'Home',
    first: 1,
    spoil: 22,
    layer: 'story',
    lead: ['**Ithaca** is the island that is waiting. You may say the name. You may not walk the hall.'],
    facts: [{ label: 'First', value: 'Book 1' }, { label: 'Sealed after', value: 'Book 22' }],
    sections: [{ heading: 'Later', paragraphs: ['[[the-return|The return]] is unborn at book 8.'] }],
    categories: ['place', 'story'],
  },
  {
    id: 'ithaca-world',
    title: 'Ithaca, Greece',
    description: 'World-layer analogue',
    aliases: ['Ithaki'],
    first: 1,
    spoil: 1,
    layer: 'world',
    lead: ['Modern island used as a world-layer analogue. Safe at every watermark.'],
    facts: [{ label: 'Layer', value: 'world' }],
    sections: [{ heading: 'Story twin', paragraphs: ['The poem island is [[ithaca|Ithaca]].'] }],
    categories: ['place', 'world'],
  },
  {
    id: 'the-return',
    title: 'The return',
    description: 'Unborn at book 8',
    first: 22,
    spoil: 22,
    layer: 'story',
    lead: ['The slaughter in the hall. This passage does not have a public name until the watermark reaches book 22.'],
    facts: [{ label: 'First', value: 'Book 22' }],
    sections: [{ heading: 'Why it is hidden', paragraphs: ['Search will not find this title. Peeking it only says it has not happened yet.'] }],
    categories: ['scene', 'story'],
  },
];

export const continuityCorpus: KnowledgeRecord[] = drafts.map(build);
export const continuityById: Record<string, KnowledgeRecord> = Object.fromEntries(
  continuityCorpus.map((r) => [r.id, r]),
);
export const continuityFeaturedId = 'book-8';
