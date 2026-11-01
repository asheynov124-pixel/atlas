import type { ComponentType } from 'react';
import type { TemplateId } from '@/book/types';
import type { SpreadCtx } from '@/reader/SpreadContext';
import { CoverTemplate } from './cover/Cover';
import { OpenerTemplate } from './opener/Opener';
import { EssayTemplate } from './essay/Essay';
import { StubTemplate } from './stub/Stub';

export type TemplateComponent = ComponentType<{ ctx: SpreadCtx }>;

const components: Partial<Record<TemplateId, TemplateComponent>> = {
  cover: CoverTemplate,
  opener: OpenerTemplate,
  essay: EssayTemplate,
};

export function templateComponent(id: TemplateId): TemplateComponent {
  return components[id] ?? StubTemplate;
}

export { TEMPLATE_META, templateIsBleed, ADDABLE_TEMPLATES } from './meta';
