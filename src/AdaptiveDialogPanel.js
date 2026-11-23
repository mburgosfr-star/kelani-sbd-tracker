import React, { useLayoutEffect, useRef } from 'react';
import { adaptiveFontSize, fitScreenContent, scrollRegionsFit } from './adaptiveScreenLayout';

// Dialogs fit their own viewport, independently of the screen underneath.
export default function AdaptiveDialogPanel({ children, style, ...props }) {
  const panelRef = useRef(null);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    let frame = null;
    let disposed = false;
    let signature = '';
    const geometry = () => [panel.clientWidth, panel.clientHeight, panel.scrollWidth,
      panel.scrollHeight, panel.textContent].join('|');
    const measure = () => {
      frame = null;
      if (disposed) return;
      const overlay = panel.parentElement;
      const inset = getComputedStyle(overlay);
      const height = window.visualViewport?.height || window.innerHeight;
      const available = height - (parseFloat(inset.paddingTop) || 0) - (parseFloat(inset.paddingBottom) || 0);
      panel.style.maxHeight = `${Math.max(0, available)}px`;
      if (!panel.clientWidth || !panel.clientHeight || geometry() === signature) return;
      fitScreenContent({
        candidates: [1.1, 1.05, 1],
        apply: scale => panel.style.setProperty('--kelani-content-font-scale', String(scale)),
        compact: enabled => {
          panel.style.padding = enabled ? '12px' : (typeof style?.padding === 'number' ? `${style.padding}px` : style?.padding || 'clamp(16px, 4vw, 22px)');
          panel.style.setProperty('--kelani-dialog-title-gap', enabled ? '8px' : 'clamp(12px, 2dvh, 18px)');
        },
        fits: () => scrollRegionsFit([panel]),
      });
      signature = geometry();
    };
    function schedule() {
      if (!disposed && frame === null) frame = window.requestAnimationFrame(measure);
    }
    const resize = () => { signature = ''; schedule(); };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(panel);
    observer?.observe(panel.parentElement);
    const mutations = new MutationObserver(() => { signature = ''; schedule(); });
    mutations.observe(panel, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    document.fonts?.addEventListener?.('loadingdone', resize);
    document.fonts?.ready?.then(() => { if (!disposed) resize(); });
    panel.addEventListener('load', resize, true);
    measure();
    return () => {
      disposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      mutations.disconnect();
      panel.removeEventListener('load', resize, true);
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      document.fonts?.removeEventListener?.('loadingdone', resize);
    };
  }, [style?.padding]);
  return <div {...props} ref={panelRef} data-adaptive-dialog="true" style={{
    ...style,
    '--kelani-content-font-scale': 1,
    '--kelani-dialog-body-size': adaptiveFontSize(15),
    fontSize: 'var(--kelani-dialog-body-size)',
    maxHeight: 'calc(100dvh - 32px)',
    boxSizing: 'border-box',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    minHeight: 0,
    flexShrink: 1,
  }}>{children}</div>;
}
