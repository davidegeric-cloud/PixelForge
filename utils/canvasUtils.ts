import { Layer, FilterState, WarpPoints, Point } from '../types';

export const getFilterString = (filters: FilterState): string => {
  return `
    brightness(${filters.brightness}%) 
    contrast(${filters.contrast}%) 
    saturate(${filters.saturation}%) 
    blur(${filters.blur}px) 
    sepia(${filters.sepia}%) 
    grayscale(${filters.grayscale}%) 
    hue-rotate(${filters.hueRotate}deg)
  `;
};

// Bilinear interpolation
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const getWarpedPoint = (u: number, v: number, wp: WarpPoints): Point => {
  // Top edge
  const tx = lerp(wp.tl.x, wp.tr.x, u);
  const ty = lerp(wp.tl.y, wp.tr.y, u);
  
  // Bottom edge
  const bx = lerp(wp.bl.x, wp.br.x, u);
  const by = lerp(wp.bl.y, wp.br.y, u);
  
  // Interpolate vertical
  return {
    x: lerp(tx, bx, v),
    y: lerp(ty, by, v)
  };
};

const renderWarpedLayer = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  wp: WarpPoints,
  originalWidth: number,
  originalHeight: number
) => {
  const GRID_SIZE = 20; 
  
  // Pre-calculate step sizes in normalized coords (0..1)
  const stepU = 1.0 / GRID_SIZE;
  const stepV = 1.0 / GRID_SIZE;
  
  // Step sizes in source image pixels
  const stepW = originalWidth / GRID_SIZE;
  const stepH = originalHeight / GRID_SIZE;

  // Avoid divide by zero if image is somehow 0x0
  if (stepW <= 0.001 || stepH <= 0.001) return;

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      // Normalized coordinates
      const u0 = x * stepU;
      const v0 = y * stepV;
      const u1 = u0 + stepU;
      const v1 = v0 + stepV;

      // Source coordinates (Intrinsic Image Pixels)
      const sx = u0 * originalWidth;
      const sy = v0 * originalHeight;

      // Destination coordinates (Canvas Pixels)
      const p1 = getWarpedPoint(u0, v0, wp); // Top Left
      const p2 = getWarpedPoint(u1, v0, wp); // Top Right
      const p3 = getWarpedPoint(u0, v1, wp); // Bottom Left
      const p4 = getWarpedPoint(u1, v1, wp); // Bottom Right

      // Render two triangles to form the quad
      // 1. Top-Left Triangle (TL-TR-BL) -> (p1, p2, p3)
      renderTriangleFixed(ctx, image, sx, sy, stepW, stepH, p1, p2, p3, true);
      
      // 2. Bottom-Right Triangle (BR-TR-BL) -> (p4, p2, p3)
      renderTriangleFixed(ctx, image, sx, sy, stepW, stepH, p4, p2, p3, false);
    }
  }
};

// Optimized renderer for axis-aligned source triangles
const renderTriangleFixed = (
  ctx: CanvasRenderingContext2D,
  im: HTMLImageElement | HTMLCanvasElement,
  sx: number, sy: number, sw: number, sh: number,
  p0: Point, p1: Point, p2: Point, 
  isUpper: boolean
) => {
  
  // Calculate centroid for clipping expansion
  const cx = (p0.x + p1.x + p2.x) / 3;
  const cy = (p0.y + p1.y + p2.y) / 3;

  // Bloat the clipping triangle slightly to cover anti-aliasing seams (the "tiles")
  // We push the vertices out from the center by a small pixel amount.
  const bloat = (p: Point) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    const overlap = 0.6; // ~0.6px overlap to seal gaps
    if (len < 0.1) return p;
    const s = 1 + (overlap / len);
    return { x: cx + dx * s, y: cy + dy * s };
  };

  const cp0 = bloat(p0);
  const cp1 = bloat(p1);
  const cp2 = bloat(p2);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cp0.x, cp0.y);
  ctx.lineTo(cp1.x, cp1.y);
  ctx.lineTo(cp2.x, cp2.y);
  ctx.closePath();
  ctx.clip();

  // Affine transform parameters calculated using ORIGINAL points (to preserve correct mapping)
  let m11, m12, m21, m22, dx, dy;

  if (isUpper) {
      // Upper Triangle:
      // Src: (sx, sy) -> (sx+sw, sy) -> (sx, sy+sh)
      // Dst: p0(TL)   -> p1(TR)      -> p2(BL)
      
      m11 = (p1.x - p0.x) / sw;
      m12 = (p1.y - p0.y) / sw;
      m21 = (p2.x - p0.x) / sh;
      m22 = (p2.y - p0.y) / sh;
      dx = p0.x - m11 * sx - m21 * sy;
      dy = p0.y - m12 * sx - m22 * sy;
  } else {
      // Lower Triangle:
      // Src: (sx+sw, sy+sh) -> (sx+sw, sy) -> (sx, sy+sh)
      // Dst: p0(BR)         -> p1(TR)      -> p2(BL)
      // Map (sx+sw, sy+sh) to p0
      
      m11 = (p0.x - p2.x) / sw;
      m12 = (p0.y - p2.y) / sw;
      m21 = (p0.x - p1.x) / sh;
      m22 = (p0.y - p1.y) / sh;
      
      const srcX = sx + sw;
      const srcY = sy + sh;
      dx = p0.x - m11 * srcX - m21 * srcY;
      dy = p0.y - m12 * srcX - m22 * srcY;
  }

  // Use transform
  ctx.transform(m11, m12, m21, m22, dx, dy);
  
  // Padding for source texture fetch
  const pad = 2.0; 
  
  let s_x = sx - pad;
  let s_y = sy - pad;
  let s_w = sw + 2 * pad;
  let s_h = sh + 2 * pad;

  const imW = im.width;
  const imH = im.height;

  if (s_x < 0) { s_w += s_x; s_x = 0; }
  if (s_y < 0) { s_h += s_y; s_y = 0; }
  
  // Draw
  if (s_w > 0 && s_h > 0) {
      ctx.drawImage(im, s_x, s_y, s_w, s_h, s_x, s_y, s_w, s_h);
  }
  
  ctx.restore();
};

export const measureTextLayer = (
    text: string, 
    fontSize: number, 
    fontFamily: string, 
    fontWeight: string = 'normal', 
    fontStyle: string = 'normal', 
    strokeWidth: number = 0
): { width: number, height: number } => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return { width: 100, height: 50 };

    const fontStr = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.font = fontStr;

    const lines = text.split('\n');
    const lineHeight = fontSize * 1.2;

    let maxWidth = 0;
    lines.forEach(line => {
        const m = ctx.measureText(line);
        if (m.width > maxWidth) maxWidth = m.width;
    });

    const horizontalPadding = (strokeWidth || 0) + 20;
    const verticalPadding = (strokeWidth || 0) + 10;

    const width = Math.ceil(maxWidth + horizontalPadding);
    const height = Math.ceil((lines.length * lineHeight) + verticalPadding);

    return { width, height };
};

export const rasterizeText = (layer: Layer): { canvas: HTMLCanvasElement, width: number, height: number } | null => {
  if (layer.type !== 'text' || !layer.text) return null;

  // Use the shared helper to determine strict bounds
  const size = layer.fontSize || 24;
  const strokeWidth = layer.textStrokeWidth || 0;
  const { width, height } = measureTextLayer(
      layer.text, 
      size, 
      layer.fontFamily || 'sans-serif', 
      layer.fontWeight, 
      layer.fontStyle, 
      strokeWidth
  );
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  
  const weight = layer.fontWeight || 'normal';
  const style = layer.fontStyle || 'normal';
  const family = layer.fontFamily || 'sans-serif';
  
  ctx.font = `${style} ${weight} ${size}px ${family}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = layer.color || '#000000';
  ctx.textAlign = 'left'; 
  
  // For rasterization we just draw tightly packed. 
  // We keep align left because we are creating a fresh image block.
  // The layer itself handles positioning.

  const lines = layer.text.split('\n');
  const lineHeight = size * 1.2;
  const xOffset = (strokeWidth || 0) + 10;
  const yOffset = (strokeWidth || 0) + 5;

  lines.forEach((line, i) => {
      const y = yOffset + (i * lineHeight);
      ctx.fillText(line, xOffset, y);
      if (strokeWidth > 0) {
          ctx.lineWidth = strokeWidth;
          ctx.strokeStyle = layer.textStrokeColor || '#000000';
          ctx.strokeText(line, xOffset, y);
      }
  });

  return { canvas, width, height };
};

// Global Buffer Cache to avoid creating canvas every frame
let sharedBufferCanvas: HTMLCanvasElement | null = null;

const getBuffer = (width: number, height: number) => {
    if (!sharedBufferCanvas) {
        sharedBufferCanvas = document.createElement('canvas');
    }
    // Resize buffer if it's smaller than the viewport
    if (sharedBufferCanvas.width < width || sharedBufferCanvas.height < height) {
        sharedBufferCanvas.width = width;
        sharedBufferCanvas.height = height;
    }
    const ctx = sharedBufferCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, width, height); // Clear only what we need
    return { canvas: sharedBufferCanvas, ctx };
};

// --- Effects Helpers ---

const applyPixelate = (ctx: CanvasRenderingContext2D, width: number, height: number, blockSize: number) => {
    if (blockSize <= 1) return;
    
    // We use a small temp canvas to downscale then upscale
    const w = Math.ceil(width / blockSize);
    const h = Math.ceil(height / blockSize);
    
    const temp = document.createElement('canvas');
    temp.width = w;
    temp.height = h;
    const tCtx = temp.getContext('2d');
    if (!tCtx) return;
    
    // Draw current context content to small canvas
    tCtx.drawImage(ctx.canvas, 0, 0, width, height, 0, 0, w, h);
    
    // Clear main and draw back scaled up with no smoothing
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp, 0, 0, w, h, 0, 0, width, height);
    ctx.imageSmoothingEnabled = true; // Reset
};

const applyVignette = (ctx: CanvasRenderingContext2D, width: number, height: number, amount: number, size: number) => {
    if (amount <= 0) return;
    
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop'; // Only draw over existing pixels
    
    const radius = Math.max(width, height) * (size / 100);
    const gradient = ctx.createRadialGradient(width / 2, height / 2, radius * 0.2, width / 2, height / 2, radius);
    
    // Transparent center to black edges
    gradient.addColorStop(0, `rgba(0,0,0,0)`);
    gradient.addColorStop(1, `rgba(0,0,0,${amount / 100})`);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
};

const applyScanlines = (ctx: CanvasRenderingContext2D, width: number, height: number, intensity: number, spacing: number) => {
    if (intensity <= 0) return;
    
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(0,0,0,${intensity / 100})`;
    
    for (let y = 0; y < height; y += spacing) {
        ctx.fillRect(0, y, width, 1);
    }
    ctx.restore();
};

const applyGlitch = (ctx: CanvasRenderingContext2D, width: number, height: number, offset: number) => {
    if (offset <= 0) return;
    
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const copy = new Uint8ClampedArray(data);
    
    // Horizontal RGB Split
    // Red channel shifted -offset
    // Blue channel shifted +offset
    // Alpha/Green intact
    
    const pixelOffset = Math.floor(offset);
    const byteOffset = pixelOffset * 4;
    
    for (let i = 0; i < data.length; i += 4) {
        const leftIdx = i - byteOffset;
        const rightIdx = i + byteOffset;
        
        // Simple clamp to array bounds to prevent crashes, 
        // effectively repeating edge pixels or just grabbing whatever is there (which is fine for glitch)
        
        if (leftIdx >= 0 && leftIdx < data.length) {
            data[i] = copy[leftIdx]; // Red takes from left
        }
        // Green stays data[i+1]
        if (rightIdx >= 0 && rightIdx < data.length) {
            data[i+2] = copy[rightIdx+2]; // Blue takes from right
        }
    }
    
    ctx.putImageData(imgData, 0, 0);
};

export const renderCanvas = (
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  width: number,
  height: number,
  checkboardPattern?: CanvasPattern | null
) => {
  // Clear
  ctx.clearRect(0, 0, width, height);

  // Draw checkerboard background
  if (checkboardPattern) {
    ctx.fillStyle = checkboardPattern;
    ctx.fillRect(0, 0, width, height);
  }

  const layersToRender = [...layers].reverse();
  const { canvas: buffer, ctx: bufferCtx } = getBuffer(width, height);

  layersToRender.forEach((layer) => {
    if (!layer.visible) return;
    if (!bufferCtx || !buffer) return;

    // 1. CLEAR BUFFER
    // We clear the specific area or whole canvas. For simplicity, clear whole.
    bufferCtx.clearRect(0, 0, width, height);
    
    // 2. RENDER LAYER TO BUFFER (Local Transforms)
    // We render the layer centered in the buffer exactly as it would appear on screen
    bufferCtx.save();
    
    // Apply basic filters here first (brightness etc) before effects
    bufferCtx.filter = getFilterString(layer.filters);

    if (layer.warpPoints && (layer.type === 'image' || layer.type === 'drawing') && layer.imageElement) {
        renderWarpedLayer(bufferCtx, layer.imageElement, layer.warpPoints, layer.imageElement.width, layer.imageElement.height);
    } else {
        const centerX = layer.x + layer.width / 2;
        const centerY = layer.y + layer.height / 2;
        bufferCtx.translate(centerX, centerY);
        if (layer.rotation) bufferCtx.rotate((layer.rotation * Math.PI) / 180);
        bufferCtx.translate(-layer.width / 2, -layer.height / 2);

        if (layer.type === 'image' || layer.type === 'drawing') {
            if (layer.imageElement) {
                bufferCtx.drawImage(layer.imageElement, 0, 0, layer.width, layer.height);
            }
        } else if (layer.type === 'text' && layer.text) {
             const weight = layer.fontWeight || 'normal';
             const style = layer.fontStyle || 'normal';
             const size = layer.fontSize || 24;
             const family = layer.fontFamily || 'sans-serif';
             const lineHeight = size * 1.2;
             
             bufferCtx.font = `${style} ${weight} ${size}px ${family}`;
             bufferCtx.textBaseline = 'top';
             bufferCtx.textAlign = layer.textAlign || 'left';
             bufferCtx.fillStyle = layer.color || '#000000';
             
             const lines = layer.text.split('\n');
             
             let x = 0;
             if (layer.textAlign === 'center') x = layer.width / 2;
             else if (layer.textAlign === 'right') x = layer.width;

             lines.forEach((line, index) => {
                 const y = index * lineHeight;
                 bufferCtx.fillText(line, x, y);

                 if (layer.textStrokeWidth && layer.textStrokeWidth > 0) {
                     bufferCtx.lineWidth = layer.textStrokeWidth;
                     bufferCtx.strokeStyle = layer.textStrokeColor || '#000000';
                     bufferCtx.strokeText(line, x, y);
                 }
             });
        }
    }
    bufferCtx.restore();

    // 3. APPLY PIXEL-MANIPULATION EFFECTS TO BUFFER
    // These modify the pixels currently on the buffer
    if (layer.effects) {
        if (layer.effects.pixelate?.enabled) {
            applyPixelate(bufferCtx, width, height, layer.effects.pixelate.blockSize);
        }
        if (layer.effects.glitch?.enabled) {
            applyGlitch(bufferCtx, width, height, layer.effects.glitch.offset);
        }
        if (layer.effects.vignette?.enabled) {
             // We need a way to apply vignette LOCAL to the object. 
             // Since the buffer contains ONLY the object, 'source-atop' works perfectly.
             applyVignette(bufferCtx, width, height, layer.effects.vignette.amount, layer.effects.vignette.size);
        }
        if (layer.effects.scanlines?.enabled) {
             applyScanlines(bufferCtx, width, height, layer.effects.scanlines.intensity, layer.effects.scanlines.spacing);
        }
    }

    // 4. DRAW BUFFER TO MAIN CONTEXT
    // Apply Blending, Opacity, and Drop Shadow here
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode;
    
    if (layer.effects?.dropShadow?.enabled) {
        ctx.shadowColor = layer.effects.dropShadow.color;
        ctx.shadowBlur = layer.effects.dropShadow.blur;
        ctx.shadowOffsetX = layer.effects.dropShadow.x;
        ctx.shadowOffsetY = layer.effects.dropShadow.y;
    }

    ctx.drawImage(buffer, 0, 0);
    ctx.restore();
  });
};

export const createCheckerboard = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 20;
  canvas.height = 20;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(0, 0, 10, 10);
    ctx.fillRect(10, 10, 10, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(10, 0, 10, 10);
    ctx.fillRect(0, 10, 10, 10);
  }
  return canvas;
};

export const createOffscreenLayer = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};