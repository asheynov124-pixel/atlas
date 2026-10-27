/**
 * The swipe feed. Cards are absolutely stacked (prev, current, next ×2) and
 * positioned imperatively so drags run at display refresh rate; React only
 * re-renders when the index or path changes.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, activePath, activeData } from '../../state/store';
import { useUI } from '../../state/ui';
import { beginView, endView, ensureBuffer, goNext, goPrev, judge, save, switchPath } from '../../state/feed';
import { useStageGestures, type DragState } from '../../gestures/useStageGestures';
import type { Intent } from '../../gestures/classify';
import type { PlayerHandle } from '../../player/ClipPlayer';
import { haptic } from '../../gestures/haptics';
import { FeedCard } from './FeedCard';
import { FeedEnd } from './FeedEnd';
import { PathBar } from './PathBar';
import { CaptureLayer } from './CaptureLayer';
import { SuggestionBanner } from './SuggestionBanner';
import { CoachMarks } from './CoachMarks';
import { IconHeart, IconPause, IconPlay } from '../../components/Icons';
import { PATH_KINDS } from '../../engine/paths';

const EASE = 'cubic-bezier(.2,.8,.2,1)';
const DUR = 280;

export function FeedView() {
  const path = useStore(activePath);
  const paths = useStore((s) => activeData(s).paths);
  const settings = useStore((s) => s.settings);
  const tab = useUI((s) => s.tab);
  const capture = useUI((s) => s.capture);
  const sheets = useUI((s) => s.sheets);
  const locked = useUI((s) => s.locked);
  const overlayHidden = useUI((s) => s.overlayHidden);
  const [userPaused, setUserPaused] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'play' | 'pause' | 'heart'; x: number; y: number; key: number } | null>(null);
  const [enter, setEnter] = useState<'left' | 'right' | null>(null);
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');

  const stageRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef(new Map<number, HTMLDivElement>());
  const players = useRef(new Map<number, PlayerHandle>());
  const busy = useRef(false);
  const pathRef = useRef(path);
  pathRef.current = path;

  const index = path.index;
  const queue = path.queue;
  const currentId = queue[index];
  const ahead = settings.dataSaver ? 1 : 2;
  const hasNext = index < queue.length - 1 || (!path.exhausted && index < queue.length);
  const hasPrev = index > 0;

  useEffect(() => {
    const on = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  useEffect(() => {
    void ensureBuffer(path.id);
  }, [path.id, index, queue.length]);

  useEffect(() => setUserPaused(false), [currentId]);

  // View tracking (history + implicit signals).
  useEffect(() => {
    if (tab !== 'feed' || !currentId) return;
    const pathId = path.id;
    beginView(currentId);
    return () => {
      const st = useStore.getState();
      const left = useUI.getState().tab !== 'feed' || activePath(st).id !== pathId;
      endView(left ? 'leave' : 'advance');
    };
  }, [currentId, path.id, tab]);

  const slots: { idx: number; id: string | null }[] = [];
  for (let o = -1; o <= ahead; o++) {
    const idx = index + o;
    if (idx < 0) continue;
    if (idx < queue.length) slots.push({ idx, id: queue[idx] });
    else if (idx === queue.length) {
      slots.push({ idx, id: null });
      break;
    }
  }

  const height = () => stageRef.current?.clientHeight ?? window.innerHeight;
  const width = () => stageRef.current?.clientWidth ?? window.innerWidth;

  const place = useCallback((dy = 0, animate = false, only?: number) => {
    const H = height();
    const base = pathRef.current.index;
    for (const [idx, el] of cardEls.current) {
      if (only != null && idx !== only) continue;
      el.style.transition = animate ? `transform ${DUR}ms ${EASE}` : 'none';
      el.style.transform = `translate3d(0, ${(idx - base) * H + dy}px, 0)`;
    }
  }, []);

  useLayoutEffect(() => {
    place(0, false);
    setFeedback(null, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, path.id, queue.length, place, tab]);

  useEffect(() => {
    const onResize = () => place(0, false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [place]);

  // Path-switch entrance animation.
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer || !enter) return;
    layer.style.transition = 'none';
    layer.style.transform = `translate3d(${enter === 'right' ? 40 : -40}%, 0, 0)`;
    layer.style.opacity = '0';
    requestAnimationFrame(() => {
      layer.style.transition = `transform ${DUR}ms ${EASE}, opacity ${DUR}ms ${EASE}`;
      layer.style.transform = 'translate3d(0,0,0)';
      layer.style.opacity = '1';
    });
    const t = setTimeout(() => setEnter(null), DUR + 20);
    return () => clearTimeout(t);
  }, [enter, path.id]);

  function setFeedback(intent: Intent | null, p: number) {
    const fb = feedbackRef.current;
    if (!fb) return;
    fb.dataset.intent = intent ?? '';
    fb.style.setProperty('--p', String(p));
  }

  const cur = () => cardEls.current.get(pathRef.current.index);
  const next = () => cardEls.current.get(pathRef.current.index + 1);

  const after = (fn: () => void) => {
    busy.current = true;
    setTimeout(() => {
      fn();
      busy.current = false;
      stageRef.current?.classList.remove('stage--dragging');
    }, DUR);
  };

  const bounce = () => {
    stageRef.current?.classList.remove('stage--dragging');
    place(0, true);
    setFeedback(null, 0);
  };

  const pathPeek = (dir: 1 | -1 | 0, p = 0) => {
    const el = peekRef.current;
    if (!el) return;
    if (!dir || paths.length < 2) {
      el.style.opacity = '0';
      return;
    }
    const i = paths.findIndex((x) => x.id === pathRef.current.id);
    const target = paths[(i + dir + paths.length) % paths.length];
    el.textContent = `${PATH_KINDS[target.seed.kind].icon} ${target.label}`;
    el.dataset.side = dir > 0 ? 'right' : 'left';
    el.style.opacity = String(Math.min(1, p * 1.2));
  };

  const commit = useCallback(
    (intent: Intent, dyHint = 0) => {
      if (busy.current) return;
      const p = pathRef.current;
      const id = p.queue[p.index];
      const W = width();
      const H = height();
      const st = useStore.getState().settings;
      const c = cur();
      const n = next();
      const canAdvance = p.index < p.queue.length;

      switch (intent) {
        case 'like':
        case 'dislike': {
          if (!id) return bounce();
          const advance = st.advanceOnJudge && canAdvance;
          judge(id, intent, { advance: advance ? 'external' : false });
          setFeedback(intent, 1);
          if (!advance) {
            setTimeout(bounce, 160);
            return;
          }
          const dir = intent === 'like' ? 1 : -1;
          if (c) {
            c.style.transition = `transform ${DUR}ms ${EASE}`;
            c.style.transform = `translate3d(${dir * W * 1.3}px, ${dyHint}px, 0) rotate(${dir * 22}deg)`;
          }
          if (n) {
            n.style.transition = `transform ${DUR}ms ${EASE}`;
            n.style.transform = 'translate3d(0,0,0)';
          }
          after(goNext);
          return;
        }
        case 'save': {
          if (!id) return bounce();
          const advance = st.advanceOnSave && canAdvance;
          save(id, { advance: advance ? 'external' : false, position: players.current.get(p.index)?.time() });
          setFeedback('save', 1);
          if (!advance) {
            setTimeout(bounce, 160);
            return;
          }
          place(-H, true);
          after(goNext);
          return;
        }
        case 'capture': {
          if (!id) return bounce();
          haptic('heavy');
          bounce();
          useUI.getState().setCapture({ videoId: id, time: players.current.get(p.index)?.time() ?? 0 });
          return;
        }
        case 'next': {
          if (p.index >= p.queue.length) {
            haptic('warning');
            return bounce();
          }
          haptic('selection');
          place(-H, true);
          after(goNext);
          return;
        }
        case 'prev': {
          if (p.index <= 0) {
            haptic('warning');
            return bounce();
          }
          haptic('selection');
          place(H, true);
          after(goPrev);
          return;
        }
        case 'pathNext':
        case 'pathPrev': {
          const dir = intent === 'pathNext' ? 1 : -1;
          const layer = layerRef.current;
          pathPeek(0);
          if (useStore.getState().data[useStore.getState().activeProfileId].paths.length < 2) {
            haptic('warning');
            if (layer) {
              layer.style.transition = `transform ${DUR}ms ${EASE}`;
              layer.style.transform = 'translate3d(0,0,0)';
            }
            useUI.getState().toast({ text: 'Only one path so far — long-press a clip for “More like this”', tone: 'info' });
            return;
          }
          haptic('selection');
          if (layer) {
            layer.style.transition = `transform ${DUR * 0.8}ms ${EASE}, opacity ${DUR * 0.8}ms ${EASE}`;
            layer.style.transform = `translate3d(${-dir * W}px,0,0)`;
            layer.style.opacity = '0.2';
          }
          after(() => {
            const target = switchPath(dir as 1 | -1);
            setEnter(dir > 0 ? 'right' : 'left');
            useUI.getState().toast({ text: `${PATH_KINDS[target.seed.kind].icon} ${target.label}`, tone: 'info' });
          });
          return;
        }
        default:
          bounce();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [place],
  );

  const setDragging = (on: boolean) => stageRef.current?.classList.toggle('stage--dragging', on);

  const onDrag = (s: DragState) => {
    setDragging(true);
    const p = pathRef.current;
    const c = cur();
    const H = s.height;
    if (s.mode === 'nav' && s.axis === 'x') {
      const layer = layerRef.current;
      if (layer) {
        layer.style.transition = 'none';
        layer.style.transform = `translate3d(${s.dx * 0.85}px,0,0)`;
      }
      pathPeek(s.dx < 0 ? 1 : -1, s.progress);
      return;
    }
    const navY = s.axis === 'y' && (s.mode === 'nav' || s.intent === 'next' || s.intent === 'prev');
    if (navY) {
      let dy = s.dy;
      if ((dy > 0 && p.index === 0) || (dy < 0 && p.index >= p.queue.length)) dy *= 0.3;
      place(dy, false);
      return;
    }
    if (!c) return;
    c.style.transition = 'none';
    if (s.axis === 'x') {
      const rot = (s.dx / s.width) * 16;
      c.style.transform = `translate3d(${s.dx}px, ${s.dy * 0.12}px, 0) rotate(${rot}deg)`;
    } else if (s.intent === 'save') {
      const n = next();
      c.style.transform = `translate3d(0, ${s.dy}px, 0) scale(${1 - s.progress * 0.03})`;
      if (n && useStore.getState().settings.advanceOnSave) {
        n.style.transition = 'none';
        n.style.transform = `translate3d(0, ${H + s.dy}px, 0)`;
      }
    } else {
      c.style.transform = `translate3d(0, ${s.dy * 0.35}px, 0) scale(${1 - s.progress * 0.05})`;
    }
    setFeedback(s.intent, s.progress);
  };

  const onCancel = () => {
    const layer = layerRef.current;
    if (layer) {
      layer.style.transition = `transform ${DUR}ms ${EASE}`;
      layer.style.transform = 'translate3d(0,0,0)';
    }
    pathPeek(0);
    bounce();
  };

  const showFlash = (kind: 'play' | 'pause' | 'heart', x: number, y: number) => setFlash({ kind, x, y, key: Date.now() });

  useStageGestures(stageRef, {
    enabled: () => !busy.current && !useUI.getState().capture && useUI.getState().sheets.length === 0,
    scheme: () => useStore.getState().settings.gestureScheme,
    onDrag,
    onCommit: (s) => commit(s.intent, s.dy * 0.12),
    onCancel,
    onTap: (x, y) => {
      const ui = useUI.getState();
      if (ui.overlayHidden && useStore.getState().settings.immersive) {
        ui.setOverlayHidden(false);
        return;
      }
      setUserPaused((v) => {
        showFlash(v ? 'play' : 'pause', x, y);
        return !v;
      });
    },
    onDoubleTap: (x, y) => {
      const id = pathRef.current.queue[pathRef.current.index];
      if (!id) return;
      showFlash('heart', x, y);
      judge(id, 'like', { advance: false });
    },
    onLongPress: () => {
      const id = pathRef.current.queue[pathRef.current.index];
      if (!id) return;
      haptic('heavy');
      useUI.getState().openSheet({ kind: 'menu', videoId: id });
    },
    onWheel: (dir) => commit(dir > 0 ? 'next' : 'prev'),
  });

  // Keyboard: arrows, J/K, S, C, [ ], space, M, I.
  useEffect(() => {
    if (tab !== 'feed') return;
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState();
      if (ui.sheets.length || ui.capture || ui.locked) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const id = pathRef.current.queue[pathRef.current.index];
      const map: Record<string, Intent> = {
        ArrowDown: 'next', j: 'next', ArrowUp: 'prev', k: 'prev', ArrowRight: 'like', l: 'like', ArrowLeft: 'dislike', h: 'dislike',
        s: 'save', c: 'capture', ']': 'pathNext', '[': 'pathPrev',
      };
      if (map[e.key]) {
        e.preventDefault();
        commit(map[e.key]);
      } else if (e.key === ' ') {
        e.preventDefault();
        setUserPaused((v) => !v);
      } else if (e.key === 'm') {
        const st = useStore.getState();
        st.setSettings({ muted: !st.settings.muted });
      } else if ((e.key === 'i' || e.key === 'Enter') && id) {
        ui.openSheet({ kind: 'details', videoId: id });
      } else if (e.key === 'p') {
        ui.openSheet({ kind: 'paths' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, commit]);

  // Immersive mode: hide the overlay after a few idle seconds.
  useEffect(() => {
    if (!settings.immersive || overlayHidden) return;
    const t = setTimeout(() => useUI.getState().setOverlayHidden(true), 3500);
    return () => clearTimeout(t);
  }, [settings.immersive, overlayHidden, currentId]);

  const registerEl = useCallback(
    (idx: number, el: HTMLDivElement | null) => {
      if (el) {
        cardEls.current.set(idx, el);
        const H = height();
        el.style.transform = `translate3d(0, ${(idx - pathRef.current.index) * H}px, 0)`;
      } else cardEls.current.delete(idx);
    },
    [],
  );
  const registerPlayer = useCallback((idx: number, h: PlayerHandle | null) => {
    if (h) players.current.set(idx, h);
    else players.current.delete(idx);
  }, []);

  const isPlaying = tab === 'feed' && visible && !userPaused && !capture && !locked && !sheets.some((s) => s.kind === 'menu');

  return (
    <div className={`feed${capture ? ' feed--capturing' : ''}`}>
      <PathBar />
      <SuggestionBanner />
      <div className="stage" ref={stageRef}>
        <div className="stage__layer" ref={layerRef} key={path.id}>
          {slots.map((s) =>
            s.id ? (
              <FeedCard
                key={`${s.idx}:${s.id}`}
                videoId={s.id}
                idx={s.idx}
                active={s.idx === index}
                playing={s.idx === index && isPlaying}
                registerEl={registerEl}
                registerPlayer={registerPlayer}
                onIntent={commit}
                hasPrev={hasPrev}
                hasNext={hasNext}
              />
            ) : (
              <FeedEnd key={`end:${s.idx}`} idx={s.idx} registerEl={registerEl} onBack={() => commit('prev')} />
            ),
          )}
        </div>
        <div className="feedback" ref={feedbackRef} aria-hidden="true">
          <span className="stamp stamp--like">LIKE</span>
          <span className="stamp stamp--dislike">PASS</span>
          <span className="stamp stamp--save">SAVE</span>
          <span className="stamp stamp--capture">CAPTURE</span>
        </div>
        <div className="path-peek" ref={peekRef} aria-hidden="true" />
        {flash && (
          <span key={flash.key} className={`tap-flash tap-flash--${flash.kind}`} style={{ left: flash.x, top: flash.y }} onAnimationEnd={() => setFlash(null)}>
            {flash.kind === 'heart' ? <IconHeart filled size={84} /> : flash.kind === 'pause' ? <IconPause size={46} /> : <IconPlay size={46} />}
          </span>
        )}
        {userPaused && !capture && (
          <span className="paused-badge" aria-live="polite">
            <IconPause size={14} /> Paused
          </span>
        )}
      </div>
      {capture && <CaptureLayer />}
      <CoachMarks quiet={!!capture || index >= queue.length} />
    </div>
  );
}

