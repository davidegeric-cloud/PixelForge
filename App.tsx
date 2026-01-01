import React, { useReducer, useCallback, useRef, useEffect, useState } from 'react';
import Toolbar from './components/Toolbar';
import LayersPanel from './components/LayersPanel';
import PropertiesPanel from './components/PropertiesPanel';
import Workspace from './components/Workspace';
import { EditorState, EditorAction, Layer, DEFAULT_FILTERS, DEFAULT_EFFECTS, ToolType, WarpPoints, EffectState } from './types';
import { Download, Upload, ZoomIn, ZoomOut, Maximize, Undo, Redo, Copy, BoxSelect, Settings, Type as TypeIcon } from 'lucide-react';
import { createOffscreenLayer, renderCanvas, rasterizeText, measureTextLayer } from './utils/canvasUtils';

// --- State Management ---

const initialState: EditorState = {
  layers: [],
  activeLayerId: null,
  tool: 'move',
  canvasSize: { width: 800, height: 600 },
  zoom: 1,
  pan: { x: 0, y: 0 },
  brushSize: 10,
  brushColor: '#ef4444',
  brushHardness: 100,
  selectionPath: null,
  history: [[]], // Initial empty state
  historyIndex: 0
};

function reducer(state: EditorState, action: EditorAction): EditorState {
  // Helper to push history
  const pushHistory = (newState: EditorState): EditorState => {
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(newState.layers);
    
    // Limit history size
    if (newHistory.length > 20) newHistory.shift();

    return {
      ...newState,
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  };

  // Actions that DO NOT affect history directly
  switch (action.type) {
    case 'UNDO':
      if (state.historyIndex > 0) {
        return {
          ...state,
          layers: state.history[state.historyIndex - 1],
          historyIndex: state.historyIndex - 1
        };
      }
      return state;
    case 'REDO':
      if (state.historyIndex < state.history.length - 1) {
        return {
          ...state,
          layers: state.history[state.historyIndex + 1],
          historyIndex: state.historyIndex + 1
        };
      }
      return state;
    case 'SET_TOOL':
      return { ...state, tool: action.payload };
    case 'SELECT_LAYER':
      return { ...state, activeLayerId: action.payload };
    case 'SET_ZOOM':
      return { ...state, zoom: action.payload };
    case 'SET_PAN':
      return { ...state, pan: action.payload };
    case 'SET_BRUSH_COLOR':
      return { ...state, brushColor: action.payload };
    case 'SET_BRUSH_SIZE':
      return { ...state, brushSize: action.payload };
    case 'SET_SELECTION_PATH':
      return { ...state, selectionPath: action.payload };
  }

  // Actions that modify layers (Push History)
  let nextState = { ...state };

  switch (action.type) {
    case 'ADD_LAYER':
      nextState = { 
        ...state, 
        layers: [action.payload, ...state.layers], 
        activeLayerId: action.payload.id 
      };
      break;
    case 'REMOVE_LAYER':
      nextState = {
        ...state,
        layers: state.layers.filter(l => l.id !== action.payload),
        activeLayerId: state.activeLayerId === action.payload ? (state.layers[1]?.id || null) : state.activeLayerId
      };
      break;
    case 'DUPLICATE_LAYER':
      const layerToDup = state.layers.find(l => l.id === action.payload);
      if (layerToDup) {
        const newLayer = {
          ...layerToDup,
          id: Date.now().toString(),
          name: `${layerToDup.name} (Copy)`,
          x: layerToDup.x + 20,
          y: layerToDup.y + 20
        };
        // Deep copy filters and effects
        newLayer.filters = { ...layerToDup.filters };
        newLayer.effects = JSON.parse(JSON.stringify(layerToDup.effects || DEFAULT_EFFECTS));
        
        // If it's a drawing/image, we need to clone the canvas/image element
        if (layerToDup.imageElement instanceof HTMLCanvasElement) {
             const newCanvas = createOffscreenLayer(layerToDup.width, layerToDup.height);
             const ctx = newCanvas.getContext('2d');
             ctx?.drawImage(layerToDup.imageElement, 0, 0);
             newLayer.imageElement = newCanvas;
        }

        nextState = {
          ...state,
          layers: [newLayer, ...state.layers],
          activeLayerId: newLayer.id
        };
      }
      break;
    case 'UPDATE_LAYER':
      nextState = {
        ...state,
        layers: state.layers.map(l => l.id === action.payload.id ? { ...l, ...action.payload.changes } : l)
      };
      break;
    case 'REORDER_LAYER':
        const { id, direction } = action.payload;
        const currentIndex = state.layers.findIndex(l => l.id === id);
        if (currentIndex === -1) return state;
        
        const newLayers = [...state.layers];
        const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        
        // Check bounds
        if (swapIndex >= 0 && swapIndex < newLayers.length) {
            [newLayers[currentIndex], newLayers[swapIndex]] = [newLayers[swapIndex], newLayers[currentIndex]];
            nextState = { ...state, layers: newLayers };
        }
        break;
    case 'SET_CANVAS_SIZE':
      nextState = {
        ...state,
        canvasSize: action.payload
      };
      break;
    case 'CROP_CANVAS':
      const { x, y, width, height } = action.payload;
      nextState = {
        ...state,
        canvasSize: { width, height },
        layers: state.layers.map(l => ({
          ...l,
          x: l.x - x,
          y: l.y - y
        })),
        tool: 'move'
      };
      break;
    case 'SET_LAYER_FILTER':
      nextState = {
        ...state,
        layers: state.layers.map(l => {
          if (l.id === action.payload.layerId) {
             return {
                ...l,
                filters: { ...l.filters, [action.payload.filter]: action.payload.value }
             };
          }
          return l;
        })
      };
      break;
    case 'UPDATE_LAYER_EFFECT':
        nextState = {
            ...state,
            layers: state.layers.map(l => {
                if (l.id === action.payload.layerId) {
                    return {
                        ...l,
                        effects: { ...l.effects, [action.payload.effectGroup]: action.payload.changes }
                    };
                }
                return l;
            })
        };
        break;
    case 'PUSH_HISTORY':
       // Just trigger a save
       break;
  }

  return pushHistory(nextState);
}

const TextPresetsModal = ({ onClose, onSelect }: { onClose: () => void, onSelect: (preset: Partial<Layer>) => void }) => {
    const presets: { name: string; description: string; style: React.CSSProperties; config: Partial<Layer> }[] = [
        {
            name: "The Blockbuster",
            description: "Cinematic Gold",
            style: { fontFamily: 'Cinzel', color: '#ffd700', textShadow: '2px 2px 4px black', fontWeight: 'bold' },
            config: {
                fontFamily: 'Cinzel', color: '#ffd700', fontWeight: 'bold', fontSize: 80,
                effects: { ...DEFAULT_EFFECTS, dropShadow: { enabled: true, color: '#000000', blur: 10, x: 2, y: 2, opacity: 0.8 } }
            }
        },
        {
            name: "Cyberpunk",
            description: "Futuristic Glitch",
            style: { fontFamily: 'Orbitron', color: '#00f3ff', textShadow: '0 0 5px #00f3ff', fontWeight: 'bold' },
            config: {
                fontFamily: 'Orbitron', color: '#00f3ff', fontWeight: 'bold', fontSize: 64,
                effects: { ...DEFAULT_EFFECTS, glitch: { enabled: true, offset: 5 }, dropShadow: { enabled: true, color: '#00f3ff', blur: 15, x: 0, y: 0, opacity: 0.6 } }
            }
        },
        {
            name: "Retro Wave",
            description: "80s Sunset",
            style: { fontFamily: 'Pacifico', color: '#ff00ff', textShadow: '3px 3px 0px #0000ff' },
            config: {
                fontFamily: 'Pacifico', color: '#ff00ff', fontSize: 72,
                effects: { ...DEFAULT_EFFECTS, dropShadow: { enabled: true, color: '#2a009e', blur: 0, x: 4, y: 4, opacity: 1 } }
            }
        },
        {
            name: "Impact",
            description: "Bold & Loud",
            style: { fontFamily: 'Anton', color: '#ffffff', WebkitTextStroke: '1px black', fontWeight: 'normal' },
            config: {
                fontFamily: 'Anton', color: '#ffffff', fontSize: 96, textStrokeColor: '#000000', textStrokeWidth: 2,
                effects: { ...DEFAULT_EFFECTS, dropShadow: { enabled: true, color: '#000000', blur: 10, x: 5, y: 5, opacity: 0.5 } }
            }
        },
        {
            name: "Elegant",
            description: "Sophisticated Serif",
            style: { fontFamily: 'Playfair Display', fontStyle: 'italic', color: '#f3e5ab' },
            config: {
                fontFamily: 'Playfair Display', fontStyle: 'italic', color: '#f3e5ab', fontSize: 64
            }
        },
        {
            name: "Arcade",
            description: "Pixel Perfect",
            style: { fontFamily: 'VT323', color: '#39ff14' },
            config: {
                fontFamily: 'VT323', color: '#39ff14', fontSize: 80,
                effects: { ...DEFAULT_EFFECTS, scanlines: { enabled: true, intensity: 30, spacing: 3 } }
            }
        },
        {
            name: "Comic Book",
            description: "POW! BAM!",
            style: { fontFamily: 'Bangers', color: '#ffff00', WebkitTextStroke: '1px black', letterSpacing: '2px' },
            config: {
                fontFamily: 'Bangers', color: '#ffff00', fontSize: 80, textStrokeColor: '#000000', textStrokeWidth: 3,
                effects: { ...DEFAULT_EFFECTS, dropShadow: { enabled: true, color: '#000000', blur: 0, x: 6, y: 6, opacity: 1 } }
            }
        },
        {
            name: "Horror",
            description: "Spooky Vibes",
            style: { fontFamily: 'Creepster', color: '#ff0000', textShadow: '0 0 5px black' },
            config: {
                fontFamily: 'Creepster', color: '#ff0000', fontSize: 72,
                effects: { ...DEFAULT_EFFECTS, dropShadow: { enabled: true, color: '#000000', blur: 20, x: 0, y: 0, opacity: 0.9 }, vignette: { enabled: true, amount: 40, size: 40} }
            }
        },
        {
            name: "Minimalist",
            description: "Clean Modern",
            style: { fontFamily: 'Montserrat', fontWeight: 900, color: '#ffffff', letterSpacing: '4px' },
            config: {
                fontFamily: 'Montserrat', fontWeight: 'bold', color: '#ffffff', fontSize: 60
            }
        },
        {
            name: "Vintage",
            description: "Old School",
            style: { fontFamily: 'Lobster', color: '#d4a373' },
            config: {
                fontFamily: 'Lobster', color: '#d4a373', fontSize: 72,
                effects: { ...DEFAULT_EFFECTS },
                filters: { ...DEFAULT_FILTERS, sepia: 50 }
            }
        }
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 w-[800px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <TypeIcon size={24} className="text-accent-500"/> Professional Text Presets
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
                </div>
                
                <div className="grid grid-cols-2 gap-4 overflow-y-auto pr-2">
                    {presets.map((preset, i) => (
                        <button 
                            key={i}
                            onClick={() => onSelect(preset.config)}
                            className="group relative h-28 bg-gray-900 border border-gray-700 rounded-lg hover:border-accent-500 hover:bg-gray-850 transition-all flex flex-col items-center justify-center overflow-hidden"
                        >
                            <div className="text-3xl mb-1 transition-transform group-hover:scale-110" style={preset.style}>
                                {preset.name}
                            </div>
                            <div className="text-xs text-gray-500 font-mono mt-2 uppercase tracking-widest opacity-60 group-hover:opacity-100">
                                {preset.description}
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

const SettingsModal = ({ 
    onClose, 
    onSave, 
    initialWidth, 
    initialHeight 
}: { 
    onClose: () => void; 
    onSave: (w: number, h: number) => void; 
    initialWidth: number; 
    initialHeight: number; 
}) => {
    const [width, setWidth] = useState(initialWidth);
    const [height, setHeight] = useState(initialHeight);
    
    const presets = [
        { name: 'Custom', width: 0, height: 0 },
        { name: 'HD (1280 x 720)', width: 1280, height: 720 },
        { name: 'Full HD (1920 x 1080)', width: 1920, height: 1080 },
        { name: '2K (2560 x 1440)', width: 2560, height: 1440 },
        { name: '4K (3840 x 2160)', width: 3840, height: 2160 },
        { name: 'Instagram Square (1080 x 1080)', width: 1080, height: 1080 },
        { name: 'Instagram Portrait (1080 x 1350)', width: 1080, height: 1350 },
        { name: 'Story / TikTok (1080 x 1920)', width: 1080, height: 1920 },
        { name: 'Twitter Post (1200 x 675)', width: 1200, height: 675 },
    ];

    const matchingPreset = presets.findIndex(p => p.width === initialWidth && p.height === initialHeight);
    const defaultSelect = matchingPreset !== -1 ? matchingPreset : 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-6 w-96" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <Settings size={20} className="text-gray-400"/> Canvas Settings
                </h2>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Preset</label>
                        <select 
                            className="w-full bg-gray-900 border border-gray-700 text-white rounded px-3 py-2 text-sm focus:border-accent-500 outline-none"
                            onChange={(e) => {
                                const idx = parseInt(e.target.value);
                                if (idx > 0) {
                                    setWidth(presets[idx].width);
                                    setHeight(presets[idx].height);
                                }
                            }}
                            defaultValue={defaultSelect}
                        >
                            {presets.map((p, i) => (
                                <option key={i} value={i}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Width (px)</label>
                            <input 
                                type="number" 
                                value={width}
                                onChange={(e) => setWidth(Math.max(1, parseInt(e.target.value) || 0))}
                                className="w-full bg-gray-900 border border-gray-700 text-white rounded px-3 py-2 text-sm focus:border-accent-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Height (px)</label>
                            <input 
                                type="number" 
                                value={height}
                                onChange={(e) => setHeight(Math.max(1, parseInt(e.target.value) || 0))}
                                className="w-full bg-gray-900 border border-gray-700 text-white rounded px-3 py-2 text-sm focus:border-accent-500 outline-none"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={() => onSave(width, height)}
                        className="px-4 py-2 text-sm bg-accent-600 hover:bg-accent-500 text-white rounded font-medium transition-colors shadow-lg shadow-blue-900/20"
                    >
                        Apply Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPresetsOpen, setIsPresetsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Actions
  const handleSelectLayer = (id: string) => dispatch({ type: 'SELECT_LAYER', payload: id });
  
  const handleAddLayer = useCallback(() => {
    const newLayer: Layer = {
      id: Date.now().toString(),
      name: `Layer ${state.layers.length + 1}`,
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
      imageElement: createOffscreenLayer(state.canvasSize.width, state.canvasSize.height),
      filters: { ...DEFAULT_FILTERS },
      effects: { ...DEFAULT_EFFECTS }
    };
    dispatch({ type: 'ADD_LAYER', payload: newLayer });
  }, [state.layers.length, state.canvasSize]);

  const handleUpdateLayer = (id: string, changes: Partial<Layer>, addToHistory = false) => {
    // Automatically resize text layer bounding box if text properties change
    const layer = state.layers.find(l => l.id === id);
    if (layer && layer.type === 'text') {
        const relevantProps = ['text', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'textStrokeWidth'];
        const needsResize = relevantProps.some(p => p in changes);
        
        if (needsResize) {
            // Merge current state with changes to get full config for measurement
            const merged = { ...layer, ...changes };
            if (merged.text) {
                const { width, height } = measureTextLayer(
                    merged.text,
                    merged.fontSize || 24,
                    merged.fontFamily || 'sans-serif',
                    merged.fontWeight,
                    merged.fontStyle,
                    merged.textStrokeWidth
                );
                changes.width = width;
                changes.height = height;
            }
        }
    }
    dispatch({ type: 'UPDATE_LAYER', payload: { id, changes } });
  };
  
  const handleCommitLayerUpdate = () => {
      dispatch({ type: 'PUSH_HISTORY' });
  };

  const handleRasterizeLayer = (id: string) => {
      const layer = state.layers.find(l => l.id === id);
      if (!layer || layer.type !== 'text') return;

      const result = rasterizeText(layer);
      if (result) {
          const { canvas, width, height } = result;
          
          dispatch({
              type: 'UPDATE_LAYER',
              payload: {
                  id,
                  changes: {
                      type: 'image',
                      imageElement: canvas,
                      width: width,
                      height: height,
                      text: undefined, // Clear text props
                      // Keep geometry, filters, and effects
                  }
              }
          });
          dispatch({ type: 'PUSH_HISTORY' });
      }
  };

  const handleApplySettings = (w: number, h: number) => {
    dispatch({ type: 'SET_CANVAS_SIZE', payload: { width: w, height: h } });
    setIsSettingsOpen(false);
  };

  const handleAddPreset = (config: Partial<Layer>) => {
      const fontSize = config.fontSize || 60;
      const text = 'EDIT ME';
      
      const { width, height } = measureTextLayer(
          text,
          fontSize,
          config.fontFamily || 'sans-serif',
          config.fontWeight,
          config.fontStyle,
          config.textStrokeWidth
      );

      const newLayer: Layer = {
          id: Date.now().toString(),
          name: 'Title Layer',
          type: 'text',
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'source-over',
          x: (state.canvasSize.width - width) / 2, // Center based on actual width
          y: (state.canvasSize.height - height) / 2,
          width: width,
          height: height,
          rotation: 0,
          text: text,
          fontSize: fontSize,
          fontFamily: 'sans-serif',
          fontWeight: 'normal',
          fontStyle: 'normal',
          textAlign: 'center',
          color: '#ffffff',
          textStrokeWidth: 0,
          filters: { ...DEFAULT_FILTERS },
          effects: { ...DEFAULT_EFFECTS },
          ...config // Merge preset config
      };
      
      dispatch({ type: 'ADD_LAYER', payload: newLayer });
      setIsPresetsOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        // Create canvas from image to allow editing (erasing)
        const canvas = createOffscreenLayer(img.width, img.height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(img, 0, 0);
        }

        // Resize workspace if it's the first layer
        if (state.layers.length === 0) {
           dispatch({ type: 'SET_CANVAS_SIZE', payload: { width: img.width, height: img.height } });
           
           // Calculate optimal zoom to fit
           const availableW = window.innerWidth - 350;
           const availableH = window.innerHeight - 80;
           const zoomW = availableW / img.width;
           const zoomH = availableH / img.height;
           const newZoom = Math.min(zoomW, zoomH) * 0.9;
           
           dispatch({ type: 'SET_ZOOM', payload: Math.max(0.1, newZoom) });
        }

        const newLayer: Layer = {
          id: Date.now().toString(),
          name: file.name,
          type: 'image',
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'source-over',
          x: 0,
          y: 0,
          width: img.width,
          height: img.height,
          rotation: 0,
          imageElement: canvas, // Store as canvas!
          filters: { ...DEFAULT_FILTERS },
          effects: { ...DEFAULT_EFFECTS }
        };
        dispatch({ type: 'ADD_LAYER', payload: newLayer });
      };
      img.src = objectUrl;
    }
  };

  const handleExport = () => {
    const canvas = document.createElement('canvas');
    canvas.width = state.canvasSize.width;
    canvas.height = state.canvasSize.height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderCanvas(ctx, state.layers, canvas.width, canvas.height, null);

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `pixelforge-export-${Date.now()}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCrop = (cropRect: { x: number, y: number, width: number, height: number }) => {
     dispatch({ type: 'CROP_CANVAS', payload: cropRect });
  };
  
  const handleWarpTool = () => {
      if (!state.activeLayerId) return;
      
      const layer = state.layers.find(l => l.id === state.activeLayerId);
      if (!layer || (layer.type !== 'image' && layer.type !== 'drawing')) return;

      // Initialize warp points if they don't exist
      if (!layer.warpPoints) {
          const x = layer.x;
          const y = layer.y;
          const w = layer.width;
          const h = layer.height;
          
          const cx = x + w/2;
          const cy = y + h/2;
          const ang = (layer.rotation || 0) * Math.PI / 180;
          const cos = Math.cos(ang);
          const sin = Math.sin(ang);
          
          const rotatePoint = (px: number, py: number) => {
              const dx = px - cx;
              const dy = py - cy;
              return {
                  x: cx + dx * cos - dy * sin,
                  y: cy + dx * sin + dy * cos
              };
          };

          const tl = rotatePoint(x, y);
          const tr = rotatePoint(x + w, y);
          const bl = rotatePoint(x, y + h);
          const br = rotatePoint(x + w, y + h);

          const initialWarp: WarpPoints = { tl, tr, bl, br };
          dispatch({ type: 'UPDATE_LAYER', payload: { id: layer.id, changes: { warpPoints: initialWarp } } });
      }
      
      dispatch({ type: 'SET_TOOL', payload: 'warp' });
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
       if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

       // Delete Layer or Clear Selection
       if (e.key === 'Delete' || e.key === 'Backspace') {
           if (state.selectionPath && state.activeLayerId) {
               // Handle Clearing Selection Area
               const layer = state.layers.find(l => l.id === state.activeLayerId);
               if (layer && (layer.type === 'drawing' || layer.type === 'image') && layer.imageElement instanceof HTMLCanvasElement) {
                   const ctx = layer.imageElement.getContext('2d');
                   if (ctx && state.selectionPath.length > 2) {
                       ctx.save();
                       
                       // Create clip path in local coordinates
                       ctx.beginPath();
                       
                       const cx = layer.x + layer.width/2;
                       const cy = layer.y + layer.height/2;
                       const angle = -(layer.rotation || 0) * Math.PI / 180;
                       
                       state.selectionPath.forEach((p, i) => {
                           // Transform global point p to local point
                           const dx = p.x - cx;
                           const dy = p.y - cy;
                           const lx = dx * Math.cos(angle) - dy * Math.sin(angle);
                           const ly = dx * Math.sin(angle) + dy * Math.cos(angle);
                           
                           if (i === 0) ctx.moveTo(lx + layer.width/2, ly + layer.height/2);
                           else ctx.lineTo(lx + layer.width/2, ly + layer.height/2);
                       });
                       ctx.closePath();
                       ctx.clip();
                       
                       // Clear
                       ctx.clearRect(0, 0, layer.width, layer.height);
                       ctx.restore();
                       
                       // Update layer version/render
                       dispatch({ type: 'UPDATE_LAYER', payload: { id: layer.id, changes: {} } });
                       dispatch({ type: 'PUSH_HISTORY' });
                       dispatch({ type: 'SET_SELECTION_PATH', payload: null });
                   }
               }
           } else if (state.activeLayerId) {
               dispatch({ type: 'REMOVE_LAYER', payload: state.activeLayerId });
           }
       }
       
       // Undo/Redo
       if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
           if (e.shiftKey) {
               dispatch({ type: 'REDO' });
           } else {
               dispatch({ type: 'UNDO' });
           }
           e.preventDefault();
       }
       if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
           dispatch({ type: 'REDO' });
           e.preventDefault();
       }
       
       // Duplicate
       if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
           if (state.activeLayerId) {
               dispatch({ type: 'DUPLICATE_LAYER', payload: state.activeLayerId });
               e.preventDefault();
           }
       }

       // Deselect
       if ((e.ctrlKey || e.metaKey) && e.key === 'd' && state.selectionPath) {
            if (state.selectionPath) {
                dispatch({ type: 'SET_SELECTION_PATH', payload: null });
                e.preventDefault();
            }
       }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.activeLayerId, state.selectionPath, state.layers]); 

  const activeLayer = state.layers.find(l => l.id === state.activeLayerId);
  const isWarpable = activeLayer && (activeLayer.type === 'image' || activeLayer.type === 'drawing');

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-200 overflow-hidden font-sans">
      {/* Top Menu Bar */}
      <header className="h-10 bg-gray-900 border-b border-gray-800 flex items-center px-4 justify-between select-none">
        <div className="flex items-center space-x-6">
          <div className="font-bold text-accent-500 tracking-wider flex items-center">
            <span className="text-xl mr-1">⬡</span> PixelForge
          </div>
          
          <div className="flex items-center space-x-2 text-sm text-gray-400">
             <button onClick={() => fileInputRef.current?.click()} className="hover:text-white px-2 py-1 hover:bg-gray-800 rounded flex items-center gap-2">
                <Upload size={14}/> Open
             </button>
             <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
             
             <button onClick={handleExport} className="hover:text-white px-2 py-1 hover:bg-gray-800 rounded flex items-center gap-2">
                <Download size={14}/> Export
             </button>

             <button 
               onClick={() => setIsSettingsOpen(true)} 
               className="hover:text-white px-2 py-1 hover:bg-gray-800 rounded flex items-center gap-2"
               title="Canvas Settings"
             >
                <Settings size={14}/> Settings
             </button>

             <button 
               onClick={() => setIsPresetsOpen(true)} 
               className="hover:text-white px-2 py-1 hover:bg-gray-800 rounded flex items-center gap-2 text-accent-400"
               title="Add Title"
             >
                <TypeIcon size={14}/> Add Title
             </button>

             <div className="w-px h-4 bg-gray-700 mx-2"></div>
             
             {/* Transform Section */}
             <div className="flex items-center space-x-1">
                 <span className="text-xs font-semibold text-gray-600 uppercase mr-1">Transform</span>
                 <button 
                    onClick={handleWarpTool} 
                    disabled={!isWarpable}
                    className={`px-2 py-1 rounded flex items-center gap-2 ${
                        state.tool === 'warp' 
                        ? 'bg-accent-600 text-white' 
                        : isWarpable ? 'hover:text-white hover:bg-gray-800' : 'opacity-30 cursor-not-allowed'
                    }`}
                 >
                    <BoxSelect size={14}/> Warp
                 </button>
             </div>
             
             <div className="w-px h-4 bg-gray-700 mx-2"></div>

             <button 
                onClick={() => dispatch({ type: 'UNDO' })} 
                disabled={state.historyIndex <= 0}
                className={`px-2 py-1 rounded flex items-center gap-2 ${state.historyIndex <= 0 ? 'opacity-30' : 'hover:text-white hover:bg-gray-800'}`}
             >
                <Undo size={14}/> Undo
             </button>
             <button 
                onClick={() => dispatch({ type: 'REDO' })} 
                disabled={state.historyIndex >= state.history.length - 1}
                className={`px-2 py-1 rounded flex items-center gap-2 ${state.historyIndex >= state.history.length - 1 ? 'opacity-30' : 'hover:text-white hover:bg-gray-800'}`}
             >
                <Redo size={14}/> Redo
             </button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
            <button className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded" title="Zoom Out" onClick={() => dispatch({type: 'SET_ZOOM', payload: Math.max(0.1, state.zoom - 0.1)})}>
               <ZoomOut size={16} />
            </button>
            <span className="text-xs w-12 text-center text-gray-500">{Math.round(state.zoom * 100)}%</span>
            <button className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded" title="Zoom In" onClick={() => dispatch({type: 'SET_ZOOM', payload: Math.min(5, state.zoom + 0.1)})}>
               <ZoomIn size={16} />
            </button>
            <button className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded ml-2" title="Fit Screen" onClick={() => dispatch({type: 'SET_ZOOM', payload: 1})}>
               <Maximize size={16} />
            </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Toolbar 
          activeTool={state.tool} 
          setTool={(t) => dispatch({ type: 'SET_TOOL', payload: t })}
          brushColor={state.brushColor}
          setBrushColor={(c) => dispatch({ type: 'SET_BRUSH_COLOR', payload: c })}
        />

        <Workspace 
           state={state}
           onUpdateLayer={handleUpdateLayer}
           onCommitLayerUpdate={handleCommitLayerUpdate}
           onAddLayer={(l) => dispatch({ type: 'ADD_LAYER', payload: l })}
           setZoom={(z) => dispatch({ type: 'SET_ZOOM', payload: z })}
           setPan={(p) => dispatch({ type: 'SET_PAN', payload: p })}
           onSetBrushColor={(c) => dispatch({ type: 'SET_BRUSH_COLOR', payload: c })}
           onCrop={handleCrop}
           onSetSelectionPath={(p) => dispatch({ type: 'SET_SELECTION_PATH', payload: p })}
        />

        <div className="w-72 bg-gray-850 border-l border-gray-750 flex flex-col shadow-xl z-20">
          <div className="flex flex-col h-1/2 border-b border-gray-750">
             <PropertiesPanel 
               activeLayer={activeLayer}
               onUpdateLayer={handleUpdateLayer}
               onRasterizeLayer={handleRasterizeLayer}
               onUpdateFilter={(layerId, filter, value) => 
                 dispatch({ type: 'SET_LAYER_FILTER', payload: { layerId, filter, value } })
               }
               onUpdateEffect={(layerId, effectGroup, changes) =>
                   dispatch({ type: 'UPDATE_LAYER_EFFECT', payload: { layerId, effectGroup, changes } })
               }
             />
          </div>

          <LayersPanel 
            layers={state.layers}
            activeLayerId={state.activeLayerId}
            onSelectLayer={handleSelectLayer}
            onToggleVisibility={(id) => {
              const layer = state.layers.find(l => l.id === id);
              if (layer) handleUpdateLayer(id, { visible: !layer.visible });
            }}
            onToggleLock={(id) => {
              const layer = state.layers.find(l => l.id === id);
              if (layer) handleUpdateLayer(id, { locked: !layer.locked });
            }}
            onDeleteLayer={(id) => dispatch({ type: 'REMOVE_LAYER', payload: id })}
            onDuplicateLayer={(id) => dispatch({ type: 'DUPLICATE_LAYER', payload: id })}
            onAddLayer={handleAddLayer}
            onUpdateLayer={handleUpdateLayer}
            onReorder={(id, direction) => dispatch({ type: 'REORDER_LAYER', payload: { id, direction }})}
          />
        </div>
      </div>
      
      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal 
            initialWidth={state.canvasSize.width}
            initialHeight={state.canvasSize.height}
            onClose={() => setIsSettingsOpen(false)}
            onSave={handleApplySettings}
        />
      )}

      {/* Text Presets Modal */}
      {isPresetsOpen && (
        <TextPresetsModal 
            onClose={() => setIsPresetsOpen(false)}
            onSelect={handleAddPreset}
        />
      )}
    </div>
  );
}