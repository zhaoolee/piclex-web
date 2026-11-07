import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {emitExperience} from './experience-effects';
import { CharacterRippleLedger, RIPPLE_DURATION, rippleFrame } from './character-ripples.mjs';

type Shock = { x: number; y: number; rotation: number; started: number };
export default function CharacterRipples({ scope, expected, entered, quickIndices, revealed, active, effect="socialCode", completed=false, perfect=false }: {
  scope: string; expected: string; entered: string; quickIndices?: number[] | null; revealed: boolean; active: boolean; effect?:string; completed?:boolean; perfect?:boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ledger = useRef(new CharacterRippleLedger());
  const shocks = useRef<Shock[]>([]), frame = useRef(0);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Glyph nodes are replaced whenever a letter, its correctness or the answer scope changes,
  // so every animation we start must be ours to finish: a handle may never outlive its glyph.
  const glyphs = useRef(new Map<Element, Animation>());
  const animatedScope = useRef(scope);
  const forget = (glyph: Element, animation: Animation) => { if (glyphs.current.get(glyph) === animation) glyphs.current.delete(glyph); };
  // Keep animations that can still paint, drop finished ones and ones whose glyph left the DOM.
  const prune = () => {
    for (const [glyph, animation] of glyphs.current) {
      const state = animation.playState;
      if (glyph.isConnected && state !== 'finished' && state !== 'idle') continue;
      animation.cancel(); glyphs.current.delete(glyph);
    }
  };
  const cancelGlyphs = () => {
    for (const animation of glyphs.current.values()) animation.cancel();
    glyphs.current.clear();
  };
  const stop = () => {
    cancelAnimationFrame(frame.current); frame.current = 0; shocks.current = [];
    cancelGlyphs();
    const node = canvas.current; node?.getContext('2d')?.clearRect(0, 0, node.width, node.height);
  };
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { if (media.matches) stop(); setReduced(media.matches); };
    const hide = () => { if (document.hidden) stop(); };
    media.addEventListener('change', update); document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', stop); window.addEventListener('resize', stop);
    return () => { stop(); media.removeEventListener('change', update); document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', stop); window.removeEventListener('resize', stop); };
  }, []);
  useLayoutEffect(() => {
    // A new answer never inherits the previous answer's glyph animations.
    if (animatedScope.current !== scope) { animatedScope.current = scope; cancelGlyphs(); }
    else prune();
    const enabled = active && !reduced && !document.hidden;
    const indices = ledger.current.update({ scope, expected, entered, quickIndices, revealed, active: enabled });
    if (!enabled || revealed) { stop(); return; }
    const node = canvas.current, context = node?.getContext('2d');
    if (!node || !context || !indices.length) return;
    const bounds = node.getBoundingClientRect(), ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(bounds.width * ratio), height = Math.round(bounds.height * ratio);
    if (node.width !== width || node.height !== height) { node.width = width; node.height = height; shocks.current = []; }
    const started = performance.now();
    const origins:DOMRect[]=[];
    for (const index of indices) {
      const glyph = node.parentElement?.querySelector(`[data-letter-index="${index}"] .letter-glyph`);
      const rect = glyph?.getBoundingClientRect();
      // Never substitute the underline or slot when character geometry is absent.
      if (!glyph || !rect?.width || !rect.height || shocks.current.length >= 64) continue;
      origins.push(rect);
      glyphs.current.get(glyph)?.cancel();
      const animation = glyph.animate([{opacity:0,transform:"scale(.84)"},{opacity:1,transform:"scale(1)"}],{duration:180,easing:"ease-out"});
      glyphs.current.set(glyph, animation);
      animation.onfinish = () => forget(glyph, animation);
      animation.oncancel = () => forget(glyph, animation);
      shocks.current.push({ x: rect.x + rect.width / 2 - bounds.x, y: rect.y + rect.height / 2 - bounds.y,
        rotation: index * 2.399, started });
    }
    emitExperience(origins,completed,perfect,effect);
    if (frame.current || !shocks.current.length) return;
    const draw = (now: number) => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, bounds.width, bounds.height);
      shocks.current = shocks.current.filter(shock => now - shock.started < RIPPLE_DURATION);
      const color = getComputedStyle(node).getPropertyValue('--ripple').trim() || '#777';
      for (const shock of shocks.current) {
        const value = rippleFrame(now - shock.started); if (!value) continue;
        context.strokeStyle = color; context.globalAlpha = value.opacity * .65; context.lineWidth = value.width;
        context.beginPath(); context.arc(shock.x, shock.y, value.radius, 0, Math.PI * 2); context.stroke();
        context.globalAlpha = value.opacity; context.lineWidth = 1.05; context.lineCap = 'round';
        for (const angle of [.16, 2.24, 4.20]) {
          context.beginPath(); context.arc(shock.x, shock.y, value.radius, angle + shock.rotation, angle + .78 + shock.rotation); context.stroke();
        }
      }
      frame.current = shocks.current.length ? requestAnimationFrame(draw) : 0;
    };
    frame.current = requestAnimationFrame(draw);
  }, [scope, expected, entered, quickIndices, revealed, active, reduced, completed, perfect, effect]);
  return <canvas ref={canvas} className="character-ripples" aria-hidden="true" />;
}
