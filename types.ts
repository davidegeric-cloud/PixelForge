export type BlendMode = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

export type ToolType = 'move' | 'brush' | 'eraser' | 'rect-select' | 'lasso-select' | 'text' | 'crop' | 'eyedropper' | 'warp';

export interface FilterState {
  brightness: number; // 100 is default
  contrast: number; // 100 is default
  saturation: number; // 100 is default
  blur: number; // 0 is default
  sepia: number; // 0 is default
  grayscale: number; // 0 is default
  hueRotate: number; // 0 is default
}

export interface EffectState {
  dropShadow: {
    enabled: boolean;
    color: string;
    blur: number;
    x: number;
    y: number;
    opacity: number;
  };
  vignette: {
    enabled: boolean;
    amount: number; // 0-100
    size: number; // 0-100
  };
  pixelate: {
    enabled: boolean;
    blockSize: number; // 1-50
  };
  scanlines: {
    enabled: boolean;
    intensity: number; // 0-100
    spacing: number;
  };
  glitch: {
    enabled: boolean;
    offset: number; // 0-100
  };
}

export interface Point {
  x: number;
  y: number;
}

export interface WarpPoints {
  tl: Point;
  tr: Point;
  bl: Point;
  br: Point;
}

export interface Layer {
  id: string;
  name: string;
  type: 'image' | 'text' | 'drawing';
  visible: boolean;
  locked: boolean;
  opacity: number; // 0-1
  blendMode: BlendMode;
  
  // Position, Size, and Transformation
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // Degrees
  
  // Warping
  // If defined, these points override standard x/y/rotation rendering for image/drawing layers
  warpPoints?: WarpPoints | null; 

  // Content
  imageElement?: HTMLImageElement | HTMLCanvasElement; // For 'image' and 'drawing'
  text?: string; // For 'text'
  color?: string; // For 'text'
  fontSize?: number; // For 'text'
  fontFamily?: string; // For 'text'
  fontWeight?: 'normal' | 'bold'; // For 'text'
  fontStyle?: 'normal' | 'italic'; // For 'text'
  textAlign?: 'left' | 'center' | 'right'; // For 'text'
  textStrokeColor?: string; // For 'text'
  textStrokeWidth?: number; // For 'text'
  
  // Non-destructive filters
  filters: FilterState;
  
  // Special Effects
  effects: EffectState;
}

export interface EditorState {
  layers: Layer[];
  activeLayerId: string | null;
  tool: ToolType;
  canvasSize: { width: number; height: number };
  zoom: number;
  pan: { x: number; y: number };
  brushSize: number;
  brushColor: string;
  brushHardness: number;
  
  // Selection
  selectionPath: { x: number; y: number }[] | null;

  // History
  history: Layer[][];
  historyIndex: number;
}

export type EditorAction =
  | { type: 'SET_TOOL'; payload: ToolType }
  | { type: 'ADD_LAYER'; payload: Layer }
  | { type: 'REMOVE_LAYER'; payload: string }
  | { type: 'DUPLICATE_LAYER'; payload: string }
  | { type: 'SELECT_LAYER'; payload: string }
  | { type: 'UPDATE_LAYER'; payload: { id: string; changes: Partial<Layer> } }
  | { type: 'REORDER_LAYER'; payload: { id: string; direction: 'up' | 'down' } }
  | { type: 'SET_CANVAS_SIZE'; payload: { width: number; height: number } }
  | { type: 'CROP_CANVAS'; payload: { x: number; y: number; width: number; height: number } }
  | { type: 'SET_ZOOM'; payload: number }
  | { type: 'SET_PAN'; payload: { x: number; y: number } }
  | { type: 'SET_BRUSH_SIZE'; payload: number }
  | { type: 'SET_BRUSH_COLOR'; payload: string }
  | { type: 'SET_LAYER_FILTER'; payload: { layerId: string; filter: keyof FilterState; value: number } }
  | { type: 'UPDATE_LAYER_EFFECT'; payload: { layerId: string; effectGroup: keyof EffectState; changes: any } }
  | { type: 'SET_SELECTION_PATH'; payload: { x: number; y: number }[] | null }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'PUSH_HISTORY' }; // Internal action to save state

export const DEFAULT_FILTERS: FilterState = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  hueRotate: 0,
};

export const DEFAULT_EFFECTS: EffectState = {
  dropShadow: { enabled: false, color: '#000000', blur: 10, x: 5, y: 5, opacity: 0.5 },
  vignette: { enabled: false, amount: 50, size: 50 },
  pixelate: { enabled: false, blockSize: 10 },
  scanlines: { enabled: false, intensity: 20, spacing: 4 },
  glitch: { enabled: false, offset: 10 },
};