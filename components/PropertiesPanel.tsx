import React, { useState } from 'react';
import { EditorState, FilterState, Layer, EffectState } from '../types';
import { Sliders, Sun, Moon, Droplet, Aperture, Type, Bold, Italic, AlignLeft, AlignCenter, AlignRight, Image as ImageIcon, Wand2, Layers, Grid, Tv, Box, Zap } from 'lucide-react';

interface PropertiesPanelProps {
  activeLayer: Layer | undefined;
  onUpdateFilter: (layerId: string, filter: keyof FilterState, value: number) => void;
  onUpdateLayer: (id: string, changes: Partial<Layer>) => void;
  onRasterizeLayer?: (id: string) => void;
  onUpdateEffect?: (layerId: string, effectGroup: keyof EffectState, changes: any) => void;
}

const FONT_FAMILIES = [
  'sans-serif',
  'serif',
  'monospace',
  'Arial',
  'Verdana',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Impact',
  'Comic Sans MS',
  // New Google Fonts
  'Montserrat',
  'Playfair Display',
  'Roboto Slab',
  'Orbitron',
  'Pacifico',
  'Bangers',
  'Cinzel',
  'Anton',
  'Lobster',
  'VT323',
  'Creepster'
];

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ activeLayer, onUpdateFilter, onUpdateLayer, onRasterizeLayer, onUpdateEffect }) => {
  const [activeTab, setActiveTab] = useState<'properties' | 'effects'>('properties');

  if (!activeLayer) {
    return (
      <div className="flex-1 bg-gray-850 p-6 flex flex-col items-center justify-center text-gray-500 text-center">
        <Sliders size={48} className="mb-4 opacity-20" />
        <p>No layer selected.</p>
        <p className="text-sm mt-2">Select a layer to adjust properties.</p>
      </div>
    );
  }

  const { filters, effects } = activeLayer;

  const renderSlider = (
    label: string, 
    value: number,
    onChange: (val: number) => void,
    min: number, 
    max: number, 
    icon?: React.ReactNode,
    unit: string = ''
  ) => (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center text-gray-400 text-xs font-medium uppercase tracking-wide">
          {icon && <span className="mr-2">{icon}</span>}
          {label}
        </div>
        <span className="text-xs text-accent-400 font-mono">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent-500 hover:accent-accent-400"
      />
    </div>
  );

  return (
    <div className="flex-1 bg-gray-850 overflow-y-auto border-l border-gray-750 flex flex-col">
      
      {/* Tabs */}
      <div className="flex border-b border-gray-750 bg-gray-900">
         <button 
           onClick={() => setActiveTab('properties')}
           className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'properties' ? 'text-accent-500 border-b-2 border-accent-500' : 'text-gray-500 hover:text-gray-300'}`}
         >
           <Sliders size={14} /> Adjust
         </button>
         <button 
           onClick={() => setActiveTab('effects')}
           className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'effects' ? 'text-accent-500 border-b-2 border-accent-500' : 'text-gray-500 hover:text-gray-300'}`}
         >
           <Wand2 size={14} /> Effects
         </button>
      </div>

      <div className="flex-1 overflow-y-auto">
      {activeTab === 'properties' && (
        <>
          {/* Content Specific Properties */}
          {activeLayer.type === 'text' && (
            <div className="p-4 border-b border-gray-750">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center text-gray-300 font-bold text-xs uppercase">
                        <Type size={14} className="mr-2" /> Text Properties
                    </div>
                    {onRasterizeLayer && (
                        <button 
                            onClick={() => onRasterizeLayer(activeLayer.id)}
                            className="text-[10px] bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-2 py-1 rounded flex items-center gap-1"
                            title="Convert text to image to enable warping and other effects"
                        >
                            <ImageIcon size={10} /> Rasterize
                        </button>
                    )}
                </div>
                
                <div className="space-y-3">
                  <div>
                      <label className="text-xs text-gray-500 block mb-1">Content</label>
                      <textarea 
                        value={activeLayer.text || ''}
                        onChange={(e) => onUpdateLayer(activeLayer.id, { text: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-accent-500 outline-none resize-none h-24"
                      />
                  </div>
                  
                  {/* Font Selection */}
                  <div>
                      <label className="text-xs text-gray-500 block mb-1">Font</label>
                      <select 
                        value={activeLayer.fontFamily || 'sans-serif'}
                        onChange={(e) => onUpdateLayer(activeLayer.id, { fontFamily: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-accent-500 outline-none"
                      >
                        {FONT_FAMILIES.map(font => (
                          <option key={font} value={font}>{font}</option>
                        ))}
                      </select>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1">
                        <label className="text-xs text-gray-500 block mb-1">Size (px)</label>
                        <input 
                          type="number" 
                          value={activeLayer.fontSize || 24}
                          onChange={(e) => onUpdateLayer(activeLayer.id, { fontSize: parseInt(e.target.value) })}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-accent-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Color</label>
                        <input 
                          type="color" 
                          value={activeLayer.color || '#ffffff'}
                          onChange={(e) => onUpdateLayer(activeLayer.id, { color: e.target.value })}
                          className="h-[28px] w-full cursor-pointer bg-transparent border-0 p-0"
                        />
                    </div>
                  </div>

                  {/* Outline / Stroke */}
                  <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="text-xs text-gray-500 block mb-1">Stroke Width</label>
                        <input 
                          type="number" 
                          min="0"
                          max="50"
                          value={activeLayer.textStrokeWidth || 0}
                          onChange={(e) => onUpdateLayer(activeLayer.id, { textStrokeWidth: parseInt(e.target.value) })}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-accent-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Stroke</label>
                        <input 
                          type="color" 
                          value={activeLayer.textStrokeColor || '#000000'}
                          onChange={(e) => onUpdateLayer(activeLayer.id, { textStrokeColor: e.target.value })}
                          className="h-[28px] w-full cursor-pointer bg-transparent border-0 p-0"
                        />
                      </div>
                  </div>

                  {/* Styling & Alignment */}
                  <div className="flex justify-between items-center bg-gray-900 p-1 rounded border border-gray-700">
                      <div className="flex gap-1 border-r border-gray-700 pr-2">
                        <button 
                          onClick={() => onUpdateLayer(activeLayer.id, { fontWeight: activeLayer.fontWeight === 'bold' ? 'normal' : 'bold' })}
                          className={`p-1 rounded ${activeLayer.fontWeight === 'bold' ? 'bg-accent-600 text-white' : 'text-gray-400 hover:text-white'}`}
                          title="Bold"
                        >
                          <Bold size={14} />
                        </button>
                        <button 
                          onClick={() => onUpdateLayer(activeLayer.id, { fontStyle: activeLayer.fontStyle === 'italic' ? 'normal' : 'italic' })}
                          className={`p-1 rounded ${activeLayer.fontStyle === 'italic' ? 'bg-accent-600 text-white' : 'text-gray-400 hover:text-white'}`}
                          title="Italic"
                        >
                          <Italic size={14} />
                        </button>
                      </div>
                      
                      <div className="flex gap-1 pl-2">
                        <button 
                          onClick={() => onUpdateLayer(activeLayer.id, { textAlign: 'left' })}
                          className={`p-1 rounded ${(!activeLayer.textAlign || activeLayer.textAlign === 'left') ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
                          title="Align Left"
                        >
                          <AlignLeft size={14} />
                        </button>
                        <button 
                          onClick={() => onUpdateLayer(activeLayer.id, { textAlign: 'center' })}
                          className={`p-1 rounded ${activeLayer.textAlign === 'center' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
                          title="Align Center"
                        >
                          <AlignCenter size={14} />
                        </button>
                        <button 
                          onClick={() => onUpdateLayer(activeLayer.id, { textAlign: 'right' })}
                          className={`p-1 rounded ${activeLayer.textAlign === 'right' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
                          title="Align Right"
                        >
                          <AlignRight size={14} />
                        </button>
                      </div>
                  </div>
                </div>
            </div>
          )}

          {/* General Filters */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-300 font-bold text-xs uppercase">Color Adjustments</h3>
            </div>

            {renderSlider('Brightness', filters.brightness, (v) => onUpdateFilter(activeLayer.id, 'brightness', v), 0, 200, <Sun size={12} />, '%')}
            {renderSlider('Contrast', filters.contrast, (v) => onUpdateFilter(activeLayer.id, 'contrast', v), 0, 200, <Moon size={12} />, '%')}
            {renderSlider('Saturation', filters.saturation, (v) => onUpdateFilter(activeLayer.id, 'saturation', v), 0, 200, <Droplet size={12} />, '%')}
            {renderSlider('Blur', filters.blur, (v) => onUpdateFilter(activeLayer.id, 'blur', v), 0, 50, <Aperture size={12} />, 'px')}
            {renderSlider('Sepia', filters.sepia, (v) => onUpdateFilter(activeLayer.id, 'sepia', v), 0, 100, <span className="text-xs font-serif">S</span>, '%')}
            {renderSlider('Grayscale', filters.grayscale, (v) => onUpdateFilter(activeLayer.id, 'grayscale', v), 0, 100, <span className="text-xs font-mono">B/W</span>, '%')}
            {renderSlider('Hue', filters.hueRotate, (v) => onUpdateFilter(activeLayer.id, 'hueRotate', v), 0, 360, <span className="text-xs">H</span>, '°')}
          </div>
        </>
      )}

      {activeTab === 'effects' && onUpdateEffect && effects && (
         <div className="p-4 space-y-6">
            
            {/* Drop Shadow */}
            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
               <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center text-gray-300 font-bold text-xs uppercase">
                    <Layers size={14} className="mr-2 text-blue-400" /> Drop Shadow
                  </div>
                  <input 
                    type="checkbox" 
                    checked={effects.dropShadow?.enabled} 
                    onChange={(e) => onUpdateEffect(activeLayer.id, 'dropShadow', { ...effects.dropShadow, enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-600 text-accent-600 bg-gray-700 focus:ring-offset-gray-900"
                  />
               </div>
               {effects.dropShadow?.enabled && (
                 <div className="space-y-3 pl-2 border-l-2 border-gray-800">
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Color</span>
                        <input 
                          type="color" 
                          value={effects.dropShadow.color}
                          onChange={(e) => onUpdateEffect(activeLayer.id, 'dropShadow', { ...effects.dropShadow, color: e.target.value })}
                          className="h-6 w-8 bg-transparent border-0 p-0 cursor-pointer"
                        />
                    </div>
                    {renderSlider('Blur', effects.dropShadow.blur, (v) => onUpdateEffect(activeLayer.id, 'dropShadow', { ...effects.dropShadow, blur: v }), 0, 50, null, 'px')}
                    {renderSlider('Offset X', effects.dropShadow.x, (v) => onUpdateEffect(activeLayer.id, 'dropShadow', { ...effects.dropShadow, x: v }), -50, 50, null, 'px')}
                    {renderSlider('Offset Y', effects.dropShadow.y, (v) => onUpdateEffect(activeLayer.id, 'dropShadow', { ...effects.dropShadow, y: v }), -50, 50, null, 'px')}
                 </div>
               )}
            </div>

            {/* Glitch Effect */}
            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
               <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center text-gray-300 font-bold text-xs uppercase">
                    <Zap size={14} className="mr-2 text-red-500" /> Glitch / RGB Split
                  </div>
                  <input 
                    type="checkbox" 
                    checked={effects.glitch?.enabled} 
                    onChange={(e) => onUpdateEffect(activeLayer.id, 'glitch', { ...effects.glitch, enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-600 text-accent-600 bg-gray-700 focus:ring-offset-gray-900"
                  />
               </div>
               {effects.glitch?.enabled && (
                 <div className="space-y-3 pl-2 border-l-2 border-gray-800">
                    {renderSlider('Offset', effects.glitch.offset, (v) => onUpdateEffect(activeLayer.id, 'glitch', { ...effects.glitch, offset: v }), 1, 50, null, 'px')}
                 </div>
               )}
            </div>

            {/* Vignette */}
            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
               <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center text-gray-300 font-bold text-xs uppercase">
                    <Box size={14} className="mr-2 text-purple-400" /> Vignette
                  </div>
                  <input 
                    type="checkbox" 
                    checked={effects.vignette?.enabled} 
                    onChange={(e) => onUpdateEffect(activeLayer.id, 'vignette', { ...effects.vignette, enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-600 text-accent-600 bg-gray-700 focus:ring-offset-gray-900"
                  />
               </div>
               {effects.vignette?.enabled && (
                 <div className="space-y-3 pl-2 border-l-2 border-gray-800">
                    {renderSlider('Amount', effects.vignette.amount, (v) => onUpdateEffect(activeLayer.id, 'vignette', { ...effects.vignette, amount: v }), 0, 100, null, '%')}
                    {renderSlider('Size', effects.vignette.size, (v) => onUpdateEffect(activeLayer.id, 'vignette', { ...effects.vignette, size: v }), 0, 200, null, '%')}
                 </div>
               )}
            </div>

            {/* Pixelate */}
            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
               <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center text-gray-300 font-bold text-xs uppercase">
                    <Grid size={14} className="mr-2 text-green-400" /> Pixelate
                  </div>
                  <input 
                    type="checkbox" 
                    checked={effects.pixelate?.enabled} 
                    onChange={(e) => onUpdateEffect(activeLayer.id, 'pixelate', { ...effects.pixelate, enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-600 text-accent-600 bg-gray-700 focus:ring-offset-gray-900"
                  />
               </div>
               {effects.pixelate?.enabled && (
                 <div className="space-y-3 pl-2 border-l-2 border-gray-800">
                    {renderSlider('Block Size', effects.pixelate.blockSize, (v) => onUpdateEffect(activeLayer.id, 'pixelate', { ...effects.pixelate, blockSize: v }), 1, 50, null, 'px')}
                 </div>
               )}
            </div>

             {/* Scanlines */}
             <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
               <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center text-gray-300 font-bold text-xs uppercase">
                    <Tv size={14} className="mr-2 text-pink-400" /> CRT Scanlines
                  </div>
                  <input 
                    type="checkbox" 
                    checked={effects.scanlines?.enabled} 
                    onChange={(e) => onUpdateEffect(activeLayer.id, 'scanlines', { ...effects.scanlines, enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-600 text-accent-600 bg-gray-700 focus:ring-offset-gray-900"
                  />
               </div>
               {effects.scanlines?.enabled && (
                 <div className="space-y-3 pl-2 border-l-2 border-gray-800">
                    {renderSlider('Intensity', effects.scanlines.intensity, (v) => onUpdateEffect(activeLayer.id, 'scanlines', { ...effects.scanlines, intensity: v }), 0, 100, null, '%')}
                    {renderSlider('Spacing', effects.scanlines.spacing, (v) => onUpdateEffect(activeLayer.id, 'scanlines', { ...effects.scanlines, spacing: v }), 2, 20, null, 'px')}
                 </div>
               )}
            </div>

         </div>
      )}
      </div>
    </div>
  );
};

export default PropertiesPanel;