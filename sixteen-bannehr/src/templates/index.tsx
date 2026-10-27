import type { ComponentType } from 'react';
import type { TemplateId } from '../model/types';
import { TEMPLATES } from '../model/templates';
import { Page } from './kit';
import { Cover } from './Cover';
import { Opener } from './Opener';
import { Essay } from './Essay';
import { Contents, Dedication, TitlePage } from './FrontMatter';
import { BeforeAfter, FullBleed } from './Images';
import { Gallery } from './Gallery';
import { Plan } from './Plan';
import { Palette } from './Palette';
import { Decision } from './Decision';
import { Library, Shopping, StillToDecide } from './Lists';
import { MoodBoard } from './MoodBoard';

function Pending() {
  return (
    <>
      <Page side="verso" />
      <Page side="recto" />
    </>
  );
}

const registry: Partial<Record<TemplateId, ComponentType>> = {
  cover: Cover,
  dedication: Dedication,
  contents: Contents,
  opener: Opener,
  essay: Essay,
  fullbleed: FullBleed,
  beforeAfter: BeforeAfter,
  gallery: Gallery,
  moodboard: MoodBoard,
  plan: Plan,
  palette: Palette,
  decision: Decision,
  shopping: Shopping,
  library: Library,
  stillToDecide: StillToDecide,
  title: TitlePage,
};

export function templateComponent(id: TemplateId): ComponentType {
  return registry[id] ?? Pending;
}

export function registerTemplates(more: Partial<Record<TemplateId, ComponentType>>) {
  Object.assign(registry, more);
}

export { TEMPLATES };
