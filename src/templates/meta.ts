import type { TemplateId } from '@/book/types';

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  /** One image across the whole spread; a single page on the phone. */
  bleed: boolean;
  /** Can be added from the thumbnail strip. */
  addable: boolean;
  /** On the phone, render as one tall page instead of two (spanning layouts). */
  phoneSingle?: boolean;
  /** One-line description for the template picker. */
  blurb: string;
}

export const TEMPLATE_META: Record<TemplateId, TemplateMeta> = {
  cover: { id: 'cover', name: 'Cover', bleed: true, addable: false, blurb: 'Title, subtitle, one hero image, the address set small.' },
  endpapers: { id: 'endpapers', name: 'Endpapers', bleed: false, addable: false, blurb: 'Sage endpapers and a dedication.' },
  contents: { id: 'contents', name: 'Contents', bleed: false, addable: false, blurb: 'Generated from the chapters.' },
  opener: { id: 'opener', name: 'Chapter opener', bleed: true, addable: true, blurb: 'A full-bleed image, the chapter number, title and epigraph.' },
  essay: { id: 'essay', name: 'Essay', bleed: false, addable: true, blurb: 'Two text columns, a drop cap, a pull quote, a small image in the margin.' },
  fullbleed: { id: 'fullbleed', name: 'Full bleed', bleed: true, addable: true, blurb: 'One image across the spread, a caption in the margin.' },
  beforeafter: { id: 'beforeafter', name: 'Before / after', bleed: false, addable: true, phoneSingle: true, blurb: 'Two images with a comparison slider.' },
  gallery: { id: 'gallery', name: 'Options gallery', bleed: false, addable: true, blurb: 'A grid of options to favourite and compare.' },
  moodboard: { id: 'moodboard', name: 'Mood board', bleed: false, addable: true, phoneSingle: true, blurb: 'A free canvas of images, swatches, text and notes.' },
  pins: { id: 'pins', name: 'Plan + pins', bleed: false, addable: true, blurb: 'A plan or render with numbered hotspots.' },
  palette: { id: 'palette', name: 'Palette & materials', bleed: false, addable: true, blurb: 'Swatches and material cards with the Clean panel.' },
  decision: { id: 'decision', name: 'Decision', bleed: false, addable: true, blurb: 'Options considered, the one chosen, why, cost, status.' },
  shopping: { id: 'shopping', name: 'Shopping list', bleed: false, addable: true, blurb: 'Items, status, price, retailer, running total.' },
  stilltodecide: { id: 'stilltodecide', name: 'Still to Decide', bleed: false, addable: false, blurb: 'Built automatically from every open decision.' },
};

export const templateIsBleed = (id: TemplateId) => TEMPLATE_META[id]?.bleed ?? false;

export const ADDABLE_TEMPLATES = (Object.values(TEMPLATE_META) as TemplateMeta[]).filter((t) => t.addable);
