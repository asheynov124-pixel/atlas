/**
 * AI hooks. The app calls these through `ai()`; the mock provider is rules +
 * the catalog's synthetic embeddings. A live provider would back
 * interpretQuery with an LLM, embedFrame with a CLIP-style image encoder, and
 * keep the same return shapes.
 */
import type { Taxonomy, VideoSummary, Vec } from '../data/types';
import { interpretQuery, type Interpretation } from './interpret';
import { interpretAspect, type AspectInput, type AspectIntent } from './aspect';

export interface AIProvider {
  readonly name: string;
  interpretQuery(text: string, tx: Taxonomy): Promise<Interpretation>;
  interpretAspect(input: AspectInput, tx: Taxonomy): Promise<AspectIntent>;
  /** Embedding for a frame of a video (optionally a region). Mock: the clip's own embedding. */
  embedFrame(video: VideoSummary, atSec: number): Promise<Vec>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockAI: AIProvider = {
  name: 'mock-rules',
  async interpretQuery(text, tx) {
    return interpretQuery(text, tx);
  },
  async interpretAspect(input, tx) {
    // A beat of "thinking" so the reasoning UI is visible; real models take longer.
    await sleep(420 + Math.random() * 300);
    return interpretAspect(input, tx);
  },
  async embedFrame(video) {
    return video.embedding.slice();
  },
};

let provider: AIProvider = mockAI;

export function ai(): AIProvider {
  return provider;
}

export function setAIProvider(p: AIProvider) {
  provider = p;
}

export type { Interpretation, AspectInput, AspectIntent };
