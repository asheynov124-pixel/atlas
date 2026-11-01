import type { ComponentType } from 'react';
import type { TemplateId } from '@/book/types';
import type { SpreadCtx } from '@/reader/SpreadContext';
import { CoverTemplate } from './cover/Cover';
import { EndpapersTemplate } from './endpapers/Endpapers';
import { ContentsTemplate } from './contents/Contents';
import { OpenerTemplate } from './opener/Opener';
import { EssayTemplate } from './essay/Essay';
import { FullBleedTemplate } from './fullbleed/FullBleed';
import { BeforeAfterTemplate } from './beforeafter/BeforeAfter';
import { GalleryTemplate } from './gallery/Gallery';
import { MoodBoardTemplate } from './moodboard/MoodBoard';
import { PinsTemplate } from './pins/Pins';
import { PaletteTemplate } from './palette/Palette';
import { DecisionTemplate } from './decision/Decision';
import { ShoppingTemplate } from './shopping/Shopping';
import { StillToDecideTemplate } from './stilltodecide/StillToDecide';

export type TemplateComponent = ComponentType<{ ctx: SpreadCtx }>;

const components: Record<TemplateId, TemplateComponent> = {
  cover: CoverTemplate,
  endpapers: EndpapersTemplate,
  contents: ContentsTemplate,
  opener: OpenerTemplate,
  essay: EssayTemplate,
  fullbleed: FullBleedTemplate,
  beforeafter: BeforeAfterTemplate,
  gallery: GalleryTemplate,
  moodboard: MoodBoardTemplate,
  pins: PinsTemplate,
  palette: PaletteTemplate,
  decision: DecisionTemplate,
  shopping: ShoppingTemplate,
  stilltodecide: StillToDecideTemplate,
};

export function templateComponent(id: TemplateId): TemplateComponent {
  return components[id];
}

export { TEMPLATE_META, templateIsBleed, ADDABLE_TEMPLATES } from './meta';
