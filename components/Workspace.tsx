import React, { useRef, useEffect, useState } from 'react';
import { Layer, EditorState, DEFAULT_FILTERS, DEFAULT_EFFECTS, WarpPoints } from '../types';
import { renderCanvas, createOffscreenLayer, measureTextLayer } from '../utils/canvasUtils';

interface WorkspaceProps {
  state: EditorState;
  onUpdateLayer: (id: string, changes: Partial<Layer>) => void;
  onCommitLayerUpdate: () => void;
  onAddLayer: (layer: Layer) => void;
  setZoom: (z: number) => void;
  setPan: (p: { x: number; y: number }) => void;
  onSetBrushColor: (c: string) => void;
  onCrop: (rect: { x: number, y: number, width: number, height: number }) => void;
  onSetSelectionPath: (path: { x: number; y: number }[] | null) => void;
}

const Workspace: React.FC<WorkspaceProps> = ({ 
  state, 
  onUpdateLayer, 
  onCommitLayerUpdate,
  onAddLayer, 
  setZoom, 
  setPan, 
  onSetBrushColor, 
  onCrop,
  onSetSelectionPath
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [initialLayerState, setInitialLayerState] = useState<Partial<Layer> | null>(null);

  const [cropRect, setCropRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  // Local selection path building
  const [currentSelectionPath, setCurrentSelectionPath] = useState<{ x: number; y: number }[]>([]);

  const [pattern, setPattern] = useState<CanvasPattern | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 20;
    pCanvas.height = 20;
    const pCtx = pCanvas.getContext('2d');
    if (pCtx) {
      pCtx.fillStyle = '#1e1e1e';
      pCtx.fillRect(0, 0, 20, 20);
      pCtx.fillStyle = '#252525';
      pCtx.fillRect(0, 0, 10, 10);
      pCtx.fillRect(10, 10, 10, 10);
      const pat = pCtx.createPattern(pCanvas, 'repeat');
      setPattern(pat);
    }
  }, []);

  // Handle Resize for sharp rendering
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
        if (containerRef.current) {
            const { width, height } = containerRef.current.getBoundingClientRect();
            // Trigger re-render with new size
            setViewportSize({ width, height });
        }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Update canvas DOM size when viewport changes
  useEffect(() => {
      const canvas = canvasRef.current;
      if (canvas && viewportSize.width > 0 && viewportSize.height > 0) {
          const dpr = window.devicePixelRatio || 1;
          canvas.width = viewportSize.width * dpr;
          canvas.height = viewportSize.height * dpr;
      }
  }, [viewportSize]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (state.tool === 'crop' && cropRect && e.key === 'Enter') {
        const normalizedRect = {
          x: cropRect.width < 0 ? cropRect.x + cropRect.width : cropRect.x,
          y: cropRect.height < 0 ? cropRect.y + cropRect.height : cropRect.y,
          width: Math.abs(cropRect.width),
          height: Math.abs(cropRect.height)
        };
        if (normalizedRect.width > 0 && normalizedRect.height > 0) {
           onCrop(normalizedRect);
           setCropRect(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.tool, cropRect, onCrop]);

  useEffect(() => {
    if (state.tool !== 'crop') setCropRect(null);
  }, [state.tool]);

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High DPI handling
    const dpr = window.devicePixelRatio || 1;
    
    // 1. Reset and Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Background of viewport (Dark)
    ctx.fillStyle = '#0d1117'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Setup Transform for Logical Coordinates
    // Scale by DPR to map logical pixels to physical pixels
    ctx.scale(dpr, dpr);
    
    // Now work in logical pixels (e.g. 0-800 for width)
    const vWidth = canvas.width / dpr;
    const vHeight = canvas.height / dpr;

    ctx.translate(vWidth / 2 + state.pan.x, vHeight / 2 + state.pan.y);
    ctx.scale(state.zoom, state.zoom);
    ctx.translate(-state.canvasSize.width / 2, -state.canvasSize.height / 2);

    // Drop Shadow for Document
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    
    // Canvas Document Background (White)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, state.canvasSize.width, state.canvasSize.height);
    ctx.shadowColor = 'transparent';

    // Render Layer Content
    renderCanvas(ctx, state.layers, state.canvasSize.width, state.canvasSize.height, pattern);

    // Overlays
    
    // Selection Path (Marching Ants)
    const activeSelection = currentSelectionPath.length > 0 ? currentSelectionPath : state.selectionPath;
    if (activeSelection && activeSelection.length > 0) {
        ctx.save();
        ctx.beginPath();
        activeSelection.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        if (state.selectionPath) ctx.closePath(); // Closed if confirmed
        
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1 / state.zoom;
        ctx.setLineDash([4 / state.zoom, 4 / state.zoom]);
        ctx.stroke();
        
        ctx.strokeStyle = '#000';
        ctx.setLineDash([4 / state.zoom, 4 / state.zoom]);
        ctx.lineDashOffset = 4 / state.zoom;
        ctx.stroke();
        ctx.restore();
    }

    if (state.tool === 'crop') {
       ctx.fillStyle = 'rgba(0,0,0,0.5)';
       ctx.fillRect(0, 0, state.canvasSize.width, state.canvasSize.height);
       if (cropRect) {
         ctx.save();
         ctx.globalCompositeOperation = 'destination-out';
         ctx.fillStyle = 'black';
         ctx.fillRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
         ctx.restore();
         ctx.strokeStyle = '#fff';
         ctx.lineWidth = 1 / state.zoom;
         ctx.setLineDash([5 / state.zoom, 5 / state.zoom]);
         ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
         ctx.fillStyle = 'white';
         ctx.font = `${12 / state.zoom}px sans-serif`;
         ctx.setLineDash([]);
         ctx.fillText("Press ENTER to Crop", cropRect.x, cropRect.y - (5 / state.zoom));
       }
    }

    // Warp Controls
    if (state.tool === 'warp' && state.activeLayerId) {
        const layer = state.layers.find(l => l.id === state.activeLayerId);
        if (layer && layer.warpPoints) {
            const { tl, tr, bl, br } = layer.warpPoints;
            
            ctx.save();
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1 / state.zoom;
            
            // Draw Quad Outline
            ctx.beginPath();
            ctx.moveTo(tl.x, tl.y);
            ctx.lineTo(tr.x, tr.y);
            ctx.lineTo(br.x, br.y);
            ctx.lineTo(bl.x, bl.y);
            ctx.closePath();
            ctx.stroke();
            
            // Draw Mesh (3x3 grid for visualization)
            ctx.strokeStyle = '#3b82f655';
            const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
            const getPt = (u: number, v: number) => {
                const tx = lerp(tl.x, tr.x, u);
                const ty = lerp(tl.y, tr.y, u);
                const bx = lerp(bl.x, br.x, u);
                const by = lerp(bl.y, br.y, u);
                return { x: lerp(tx, bx, v), y: lerp(ty, by, v) };
            };
            
            ctx.beginPath();
            for(let i=1; i<3; i++) {
                // Verticals
                const t1 = getPt(i/3, 0);
                const b1 = getPt(i/3, 1);
                ctx.moveTo(t1.x, t1.y);
                ctx.lineTo(b1.x, b1.y);
                
                // Horizontals
                const l1 = getPt(0, i/3);
                const r1 = getPt(1, i/3);
                ctx.moveTo(l1.x, l1.y);
                ctx.lineTo(r1.x, r1.y);
            }
            ctx.stroke();

            // Draw Handles
            const handleSize = 8 / state.zoom;
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#3b82f6';
            
            [tl, tr, bl, br].forEach(p => {
                ctx.fillRect(p.x - handleSize/2, p.y - handleSize/2, handleSize, handleSize);
                ctx.strokeRect(p.x - handleSize/2, p.y - handleSize/2, handleSize, handleSize);
            });
            
            ctx.restore();
        }
    }

    // Transform Controls (Move Tool)
    if (state.activeLayerId && state.tool === 'move') {
       const activeLayer = state.layers.find(l => l.id === state.activeLayerId);
       if (activeLayer) {
           ctx.save();
           
           const cx = activeLayer.x + activeLayer.width / 2;
           const cy = activeLayer.y + activeLayer.height / 2;
           ctx.translate(cx, cy);
           ctx.rotate((activeLayer.rotation || 0) * Math.PI / 180);
           
           const w = activeLayer.width;
           const h = activeLayer.height;
           
           ctx.strokeStyle = '#3b82f6';
           ctx.lineWidth = 1 / state.zoom;
           ctx.strokeRect(-w/2, -h/2, w, h);
           
           const handleSize = 8 / state.zoom;
           ctx.fillStyle = '#ffffff';
           ctx.strokeStyle = '#3b82f6';
           
           const corners = [
               { x: -w/2, y: -h/2 },
               { x: w/2, y: -h/2 },
               { x: w/2, y: h/2 },
               { x: -w/2, y: h/2 }
           ];

           corners.forEach(c => {
               ctx.fillRect(c.x - handleSize/2, c.y - handleSize/2, handleSize, handleSize);
               ctx.strokeRect(c.x - handleSize/2, c.y - handleSize/2, handleSize, handleSize);
           });

           const rotHandleY = -h/2 - (20 / state.zoom);
           ctx.beginPath();
           ctx.moveTo(0, -h/2);
           ctx.lineTo(0, rotHandleY);
           ctx.stroke();
           
           ctx.beginPath();
           ctx.arc(0, rotHandleY, handleSize/1.5, 0, Math.PI * 2);
           ctx.fill();
           ctx.stroke();

           ctx.restore();
       }
    }

    ctx.restore();
  }, [state, pattern, cropRect, currentSelectionPath, viewportSize]);

  // Coordinate Helpers
  const getCanvasCoordinates = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    // We rely on viewportSize state or rect for center calc
    const centerX = rect.width / 2 + state.pan.x;
    const centerY = rect.height / 2 + state.pan.y;
    
    const x = (clientX - centerX) / state.zoom + state.canvasSize.width / 2;
    const y = (clientY - centerY) / state.zoom + state.canvasSize.height / 2;
    return { x, y };
  };

  const getHandleAtPosition = (x: number, y: number, layer: Layer) => {
      const cx = layer.x + layer.width / 2;
      const cy = layer.y + layer.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      
      const angle = -(layer.rotation || 0) * Math.PI / 180;
      const lx = dx * Math.cos(angle) - dy * Math.sin(angle);
      const ly = dx * Math.sin(angle) + dy * Math.cos(angle);
      
      const w = layer.width;
      const h = layer.height;
      const threshold = 10 / state.zoom; 

      if (Math.abs(lx - (-w/2)) < threshold && Math.abs(ly - (-h/2)) < threshold) return 'tl';
      if (Math.abs(lx - (w/2)) < threshold && Math.abs(ly - (-h/2)) < threshold) return 'tr';
      if (Math.abs(lx - (w/2)) < threshold && Math.abs(ly - (h/2)) < threshold) return 'br';
      if (Math.abs(lx - (-w/2)) < threshold && Math.abs(ly - (h/2)) < threshold) return 'bl';
      
      if (Math.abs(lx - 0) < threshold && Math.abs(ly - (-h/2 - 20/state.zoom)) < threshold) return 'rot';

      if (lx >= -w/2 && lx <= w/2 && ly >= -h/2 && ly <= h/2) return 'body';

      return null;
  };
  
  const getWarpHandleAtPosition = (x: number, y: number, wp: WarpPoints) => {
      const threshold = 10 / state.zoom;
      if (Math.hypot(x - wp.tl.x, y - wp.tl.y) < threshold) return 'tl';
      if (Math.hypot(x - wp.tr.x, y - wp.tr.y) < threshold) return 'tr';
      if (Math.hypot(x - wp.bl.x, y - wp.bl.y) < threshold) return 'bl';
      if (Math.hypot(x - wp.br.x, y - wp.br.y) < threshold) return 'br';
      return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const coords = getCanvasCoordinates(e);
    setStartPos(coords);
    setLastMousePos(coords);

    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        setIsDragging(true);
        setActiveHandle('pan');
        return;
    }

    if (state.tool === 'crop') {
        setIsDragging(true);
        setCropRect({ x: coords.x, y: coords.y, width: 0, height: 0 });
        return;
    }
    
    // Warp Interaction
    if (state.tool === 'warp' && state.activeLayerId) {
        const layer = state.layers.find(l => l.id === state.activeLayerId);
        if (layer && layer.warpPoints) {
            const handle = getWarpHandleAtPosition(coords.x, coords.y, layer.warpPoints);
            if (handle) {
                setIsDragging(true);
                setActiveHandle(handle);
                setInitialLayerState({ ...layer }); // Save state for undo/cancel if we added that
                return;
            }
        }
    }

    if (state.tool === 'lasso-select') {
        setIsDrawing(true);
        onSetSelectionPath(null); // Clear old
        setCurrentSelectionPath([{ x: coords.x, y: coords.y }]);
        return;
    }

    if (state.tool === 'move' && state.activeLayerId) {
        const layer = state.layers.find(l => l.id === state.activeLayerId);
        if (layer) {
            const handle = getHandleAtPosition(coords.x, coords.y, layer);
            if (handle) {
                setIsDragging(true);
                setActiveHandle(handle);
                setInitialLayerState({ ...layer });
                return;
            }
        }
    }

    // Drawing (Brush or Eraser)
    if (state.tool === 'brush' || state.tool === 'eraser') {
        setIsDrawing(true);
        // Create new drawing layer if none active or active is text
        const activeLayer = state.layers.find(l => l.id === state.activeLayerId);
        let layerId = state.activeLayerId;
        
        if (!activeLayer || activeLayer.type === 'text' || (state.tool === 'brush' && !activeLayer)) {
             // For eraser, we can only erase existing. But if none active, we can't erase.
             // If brush and no active or text, create new.
             if (state.tool === 'brush') {
                 const newLayerId = Date.now().toString();
                 const newCanvas = createOffscreenLayer(state.canvasSize.width, state.canvasSize.height);
                 onAddLayer({
                     id: newLayerId,
                     name: `Drawing ${state.layers.length + 1}`,
                     type: 'drawing',
                     visible: true,
                     locked: false,
                     opacity: 1,
                     blendMode: 'source-over',
                     x: 0,
                     y: 0,
                     width: state.canvasSize.width,
                     height: state.canvasSize.height,
                     rotation: 0,
                     imageElement: newCanvas,
                     filters: { ...DEFAULT_FILTERS },
                     effects: { ...DEFAULT_EFFECTS }
                 });
                 layerId = newLayerId;
             }
        }

        const layer = state.layers.find(l => l.id === layerId);
        if (layer && (layer.type === 'drawing' || layer.type === 'image') && layer.imageElement instanceof HTMLCanvasElement) {
           const ctx = layer.imageElement.getContext('2d');
           if (ctx) {
               ctx.beginPath();
               
               // Start path in local coordinates
               const cx = layer.x + layer.width/2;
               const cy = layer.y + layer.height/2;
               const dx = coords.x - cx;
               const dy = coords.y - cy;
               const angle = -(layer.rotation || 0) * Math.PI / 180;
               const lx = dx * Math.cos(angle) - dy * Math.sin(angle);
               const ly = dx * Math.sin(angle) + dy * Math.cos(angle);
               const drawX = lx + layer.width/2;
               const drawY = ly + layer.height/2;

               ctx.moveTo(drawX, drawY);
           }
        }
    }
    
    if (state.tool === 'text') {
        const text = 'New Text';
        const fontSize = 32;
        const font = 'sans-serif';
        const { width, height } = measureTextLayer(text, fontSize, font);

        onAddLayer({
            id: Date.now().toString(),
            name: `Text ${state.layers.length + 1}`,
            type: 'text',
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: 'source-over',
            x: coords.x,
            y: coords.y,
            width, 
            height,
            rotation: 0,
            text,
            fontSize,
            fontFamily: font,
            fontWeight: 'normal',
            fontStyle: 'normal',
            textAlign: 'left',
            color: state.brushColor,
            textStrokeColor: '#000000',
            textStrokeWidth: 0,
            filters: { ...DEFAULT_FILTERS },
            effects: { ...DEFAULT_EFFECTS }
        });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const coords = getCanvasCoordinates(e);

    if (isDragging && activeHandle === 'pan') {
        setPan({ x: state.pan.x + e.movementX, y: state.pan.y + e.movementY });
        return;
    }

    if (isDragging && state.tool === 'crop' && cropRect) {
       setCropRect({ ...cropRect, width: coords.x - startPos.x, height: coords.y - startPos.y });
       return;
    }
    
    if (isDragging && state.tool === 'warp' && state.activeLayerId && activeHandle) {
        const layer = state.layers.find(l => l.id === state.activeLayerId);
        if (layer && layer.warpPoints) {
            const newWarp = { ...layer.warpPoints };
            // Update specific corner
            if (activeHandle === 'tl') newWarp.tl = { x: coords.x, y: coords.y };
            if (activeHandle === 'tr') newWarp.tr = { x: coords.x, y: coords.y };
            if (activeHandle === 'bl') newWarp.bl = { x: coords.x, y: coords.y };
            if (activeHandle === 'br') newWarp.br = { x: coords.x, y: coords.y };
            
            onUpdateLayer(layer.id, { warpPoints: newWarp });
        }
        return;
    }

    if (isDrawing && state.tool === 'lasso-select') {
        setCurrentSelectionPath(prev => [...prev, { x: coords.x, y: coords.y }]);
        return;
    }

    if (isDragging && state.tool === 'move' && state.activeLayerId && initialLayerState) {
        const layer = state.layers.find(l => l.id === state.activeLayerId);
        if (!layer) return;

        if (activeHandle === 'body') {
            const dx = coords.x - lastMousePos.x;
            const dy = coords.y - lastMousePos.y;
            onUpdateLayer(layer.id, { x: layer.x + dx, y: layer.y + dy });
        } else if (activeHandle === 'rot') {
             const cx = layer.x + layer.width / 2;
             const cy = layer.y + layer.height / 2;
             const angleRad = Math.atan2(coords.y - cy, coords.x - cx);
             const angleDeg = angleRad * 180 / Math.PI;
             onUpdateLayer(layer.id, { rotation: angleDeg + 90 });
        } else if (activeHandle && initialLayerState) {
            const cx = layer.x + layer.width / 2;
            const cy = layer.y + layer.height / 2;
            
            const initialDist = Math.hypot(startPos.x - cx, startPos.y - cy);
            const currentDist = Math.hypot(coords.x - cx, coords.y - cy);
            const scale = currentDist / initialDist;
            
            if (initialLayerState.width && initialLayerState.height) {
                const newWidth = initialLayerState.width * scale;
                const newHeight = initialLayerState.height * scale;
                
                onUpdateLayer(layer.id, {
                    width: newWidth,
                    height: newHeight,
                    x: cx - newWidth / 2,
                    y: cy - newHeight / 2
                });
            }
        }
    }

    if (isDrawing && (state.tool === 'brush' || state.tool === 'eraser') && state.activeLayerId) {
        const layer = state.layers.find(l => l.id === state.activeLayerId);
        if (layer && (layer.type === 'drawing' || layer.type === 'image') && layer.imageElement instanceof HTMLCanvasElement) {
             const ctx = layer.imageElement.getContext('2d');
             if (ctx) {
                 ctx.save();
                 
                 // Apply Clipping from Selection
                 if (state.selectionPath && state.selectionPath.length > 2) {
                     // We need to transform selection path to local coordinates
                     ctx.beginPath();
                     const cx = layer.x + layer.width/2;
                     const cy = layer.y + layer.height/2;
                     const angle = -(layer.rotation || 0) * Math.PI / 180;
                     
                     state.selectionPath.forEach((p, i) => {
                         const dx = p.x - cx;
                         const dy = p.y - cy;
                         const lx = dx * Math.cos(angle) - dy * Math.sin(angle);
                         const ly = dx * Math.sin(angle) + dy * Math.cos(angle);
                         
                         if (i === 0) ctx.moveTo(lx + layer.width/2, ly + layer.height/2);
                         else ctx.lineTo(lx + layer.width/2, ly + layer.height/2);
                     });
                     ctx.closePath();
                     ctx.clip();
                 }

                 ctx.lineCap = 'round';
                 ctx.lineJoin = 'round';
                 ctx.lineWidth = state.brushSize;
                 
                 // Eraser Mode
                 if (state.tool === 'eraser') {
                     ctx.globalCompositeOperation = 'destination-out';
                 } else {
                     ctx.strokeStyle = state.brushColor;
                     ctx.globalCompositeOperation = 'source-over';
                 }

                 const cx = layer.x + layer.width/2;
                 const cy = layer.y + layer.height/2;
                 const dx = coords.x - cx;
                 const dy = coords.y - cy;
                 const angle = -(layer.rotation || 0) * Math.PI / 180;
                 const lx = dx * Math.cos(angle) - dy * Math.sin(angle);
                 const ly = dx * Math.sin(angle) + dy * Math.cos(angle);
                 
                 const drawX = lx + layer.width/2;
                 const drawY = ly + layer.height/2;

                 ctx.lineTo(drawX, drawY);
                 ctx.stroke();
                 ctx.restore();
                 
                 onUpdateLayer(layer.id, { }); 
             }
        }
    }

    setLastMousePos(coords);
  };

  const handleMouseUp = () => {
    if (isDragging && state.tool === 'move' && state.activeLayerId && activeHandle) {
        onCommitLayerUpdate();
    }
    if (isDragging && state.tool === 'warp' && state.activeLayerId && activeHandle) {
        onCommitLayerUpdate();
    }
    if (isDrawing && (state.tool === 'brush' || state.tool === 'eraser')) {
        onCommitLayerUpdate();
    }
    if (isDrawing && state.tool === 'lasso-select') {
        onSetSelectionPath(currentSelectionPath);
        setCurrentSelectionPath([]);
    }
    
    setIsDragging(false);
    setIsDrawing(false);
    setActiveHandle(null);
    setInitialLayerState(null);
  };
  
  const handleWheel = (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
          const newZoom = Math.max(0.1, Math.min(5, state.zoom * zoomFactor));
          setZoom(newZoom);
      } else {
           setPan({ x: state.pan.x - e.deltaX, y: state.pan.y - e.deltaY });
      }
  };

  return (
    <div 
      ref={containerRef} 
      className="flex-1 relative bg-gray-900 overflow-hidden cursor-crosshair touch-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div className="absolute bottom-4 left-4 bg-gray-800/80 text-white text-xs px-3 py-1 rounded backdrop-blur border border-gray-700 pointer-events-none select-none">
         {Math.round(state.zoom * 100)}% | {state.canvasSize.width} x {state.canvasSize.height}px
      </div>
    </div>
  );
};

export default Workspace;