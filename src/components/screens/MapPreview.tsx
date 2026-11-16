/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { buildMap, MapOptions } from '../../game/maps/catalog';
import { renderMapPreview } from '../../game/maps/terrain';

/** Real preview of a battlefield: the actual generated map (same seed and options), rendered by the terrain compositor. */
const previewCache = new Map<string, ImageData>();

export const MapPreview: React.FC<{ mapId: string; options?: MapOptions; px?: number; className?: string; label?: string }> = ({ mapId, options = {}, px = 200, className, label }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify([mapId, options, px]);
  useEffect(() => {
    let cancelled = false;
    const draw = () => {
      if (cancelled || !ref.current) return;
      let img = previewCache.get(key);
      if (!img) {
        const p = renderMapPreview(buildMap(mapId, options), px);
        img = new ImageData(new Uint8ClampedArray(p.data), p.w, p.h);
        previewCache.set(key, img);
        if (previewCache.size > 40) previewCache.delete(previewCache.keys().next().value as string);
      }
      const c = ref.current;
      c.width = img.width; c.height = img.height;
      c.getContext('2d')?.putImageData(img, 0, 0);
    };
    // generate after paint so screens open instantly
    const id = window.setTimeout(draw, 0);
    return () => { cancelled = true; window.clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <canvas ref={ref} className={className} aria-label={label ?? 'Map preview'} role="img" style={{ imageRendering: 'auto' }} />;
};
