/** The workflow pack: built-in research and drafting workflows beyond the core five. */
import type { TemplateContext, WorkflowTemplate } from '../../context.js';
import { misquoteTemplate, dissectorTemplate, unpublishedTemplate, replyGapTemplate } from './briefs.js';
import { respondingTemplate } from './responding.js';

export const PACK: Record<string, (ctx: TemplateContext) => WorkflowTemplate> = {
  misquotes: misquoteTemplate,
  dissect: dissectorTemplate,
  unpublished: unpublishedTemplate,
  reply_gaps: replyGapTemplate,
  responding: respondingTemplate,
};
