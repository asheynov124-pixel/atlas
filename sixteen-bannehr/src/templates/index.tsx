import type { ComponentType } from 'react';
import type { TemplateId } from '../model/types';
import { TEMPLATES } from '../model/templates';
import { Page } from './kit';
import { Cover } from './Cover';
import { Opener } from './Opener';
import { Essay } from './Essay';

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
  opener: Opener,
  essay: Essay,
};

export function templateComponent(id: TemplateId): ComponentType {
  return registry[id] ?? Pending;
}

export function registerTemplates(more: Partial<Record<TemplateId, ComponentType>>) {
  Object.assign(registry, more);
}

export { TEMPLATES };
