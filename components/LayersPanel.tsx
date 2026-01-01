import React from 'react';
import { Layer, BlendMode } from '../types';
import { Eye, EyeOff, Lock, Unlock, Trash2, Plus, ArrowUp, ArrowDown, Image as ImageIcon, Type as TypeIcon, PenTool, Copy } from 'lucide-react';

interface LayersPanelProps {
  layers: Layer[];
  activeLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDeleteLayer: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onAddLayer: () => void;
  onUpdateLayer: (id: string, changes: Partial<Layer>) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
}

const BLEND_MODES: BlendMode[] = [
  'source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 
  'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'
];

const LayersPanel: React.FC<LayersPanelProps> = ({
  layers,
  activeLayerId,
  onSelectLayer,
  onToggleVisibility,
  onToggleLock,
  onDeleteLayer,
  onDuplicateLayer,
  onAddLayer,
  onUpdateLayer,
  onReorder
}) => {
  return (
    <div className="flex flex-col h-1/2 bg-gray-850 border-t border-gray-750">
      {/* Header */}
      <div className="px-3 py-2 bg-gray-900 border-b border-gray-750 flex justify-between items-center">
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Layers</h3>
        <button 
          onClick={onAddLayer}
          className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
          title="New Layer"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Layer List */}
      <div className="flex-1 overflow-y-auto">
        {layers.map((layer, index) => (
          <div
            key={layer.id}
            onClick={() => onSelectLayer(layer.id)}
            className={`group flex items-center px-2 py-2 border-b border-gray-800 cursor-pointer select-none transition-colors ${
              activeLayerId === layer.id ? 'bg-accent-900/30 border-l-4 border-l-accent-500' : 'hover:bg-gray-800 border-l-4 border-l-transparent'
            }`}
          >
            {/* Visibility */}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
              className={`p-1 mr-2 rounded ${layer.visible ? 'text-gray-400 hover:text-white' : 'text-gray-600'}`}
            >
              {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>

            {/* Thumbnail / Icon */}
            <div className="w-8 h-8 bg-gray-700 rounded mr-3 flex items-center justify-center overflow-hidden border border-gray-600">
               {layer.type === 'image' && <ImageIcon size={14} className="text-blue-400" />}
               {layer.type === 'text' && <TypeIcon size={14} className="text-green-400" />}
               {layer.type === 'drawing' && <PenTool size={14} className="text-purple-400" />}
            </div>

            {/* Name & Quick Props */}
            <div className="flex-1 min-w-0">
               <div className="text-sm text-gray-200 truncate font-medium">{layer.name}</div>
               <div className="flex items-center space-x-2 mt-1">
                 <span className="text-[10px] text-gray-500 uppercase">{layer.blendMode.replace('-', ' ')}</span>
                 <span className="text-[10px] text-gray-500">{Math.round(layer.opacity * 100)}%</span>
               </div>
            </div>

            {/* Actions (visible on hover or active) */}
            <div className={`flex items-center space-x-1 ${activeLayerId === layer.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                {/* Reorder */}
               <div className="flex flex-col mr-1">
                   <button 
                     onClick={(e) => { e.stopPropagation(); onReorder(layer.id, 'up'); }}
                     className="text-gray-500 hover:text-white disabled:opacity-30"
                     disabled={index === 0}
                   >
                     <ArrowUp size={10} />
                   </button>
                   <button 
                     onClick={(e) => { e.stopPropagation(); onReorder(layer.id, 'down'); }}
                     className="text-gray-500 hover:text-white disabled:opacity-30"
                     disabled={index === layers.length - 1}
                   >
                     <ArrowDown size={10} />
                   </button>
               </div>
               
               <button 
                onClick={(e) => { e.stopPropagation(); onDuplicateLayer(layer.id); }}
                className="p-1 text-gray-500 hover:text-white"
                title="Duplicate"
              >
                 <Copy size={12} />
               </button>

               <button 
                onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}
                className={`p-1 hover:text-white ${layer.locked ? 'text-yellow-500 opacity-100' : 'text-gray-500'}`}
              >
                 {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
               </button>
               <button 
                onClick={(e) => { e.stopPropagation(); onDeleteLayer(layer.id); }}
                className="p-1 text-gray-500 hover:text-red-400"
              >
                 <Trash2 size={12} />
               </button>
            </div>
          </div>
        ))}
      </div>

      {/* Active Layer Properties (Bottom of list) */}
      {activeLayerId && (
        <div className="p-3 bg-gray-900 border-t border-gray-750 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Opacity</span>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01"
              value={layers.find(l => l.id === activeLayerId)?.opacity || 1}
              onChange={(e) => onUpdateLayer(activeLayerId, { opacity: parseFloat(e.target.value) })}
              className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
          <div className="flex items-center justify-between">
             <span className="text-xs text-gray-400">Mode</span>
             <select 
              value={layers.find(l => l.id === activeLayerId)?.blendMode || 'source-over'}
              onChange={(e) => onUpdateLayer(activeLayerId, { blendMode: e.target.value as BlendMode })}
              className="bg-gray-800 text-gray-300 text-xs rounded border border-gray-700 px-2 py-1 outline-none focus:border-accent-500"
             >
               {BLEND_MODES.map(m => (
                 <option key={m} value={m}>{m}</option>
               ))}
             </select>
          </div>
        </div>
      )}
    </div>
  );
};

export default LayersPanel;