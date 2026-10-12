import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { RoomScene, type StageSpec } from './scene';
import { useStore } from '../lib/store';

export interface StageHandle { resetView: () => void; screenshot: () => string | undefined }

export const RoomStage = forwardRef<StageHandle, { spec: StageSpec; className?: string }>(function RoomStage({ spec, className = '' }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const scene = useRef<RoomScene | null>(null);
  const theme = useStore((s) => s.theme);

  useImperativeHandle(ref, () => ({ resetView: () => scene.current?.resetView(), screenshot: () => scene.current?.screenshot() }), []);

  useEffect(() => {
    if (!el.current) return;
    let s: RoomScene | null = null;
    try { s = new RoomScene(el.current); } catch { return; }
    scene.current = s;
    const ro = new ResizeObserver(() => s!.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); s!.dispose(); scene.current = null; };
  }, []);

  useEffect(() => { scene.current?.setSpec(spec); }, [spec, theme]);

  return <div ref={el} className={`relative h-full w-full overflow-hidden ${className}`} />;
});
