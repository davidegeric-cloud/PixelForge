import React from 'react';
import { 
  Move, 
  Brush, 
  Eraser, 
  Type, 
  Crop, 
  MousePointer2, 
  Pipette,
  Lasso
} from 'lucide-react';
import { ToolType } from '../types';

interface ToolbarProps {
  activeTool: ToolType;
  setTool: (t: ToolType) => void;
  brushColor: string;
  setBrushColor: (c: string) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ activeTool, setTool, brushColor, setBrushColor }) => {
  
  const tools: { id: ToolType; icon: React.ReactNode; label: string }[] = [
    { id: 'move', icon: <Move size={20} />, label: 'Move (V)' },
    { id: 'lasso-select', icon: <Lasso size={20} />, label: 'Lasso Select (L)' },
    { id: 'brush', icon: <Brush size={20} />, label: 'Brush (B)' },
    { id: 'eraser', icon: <Eraser size={20} />, label: 'Eraser (E)' },
    { id: 'text', icon: <Type size={20} />, label: 'Text (T)' },
    { id: 'crop', icon: <Crop size={20} />, label: 'Crop (C)' },
    { id: 'eyedropper', icon: <Pipette size={20} />, label: 'Eyedropper (I)' },
  ];

  return (
    <div className="w-16 bg-gray-850 border-r border-gray-750 flex flex-col items-center py-4 z-20 shadow-xl">
      <div className="space-y-2 w-full flex flex-col items-center">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setTool(tool.id)}
            title={tool.label}
            className={`p-3 rounded-lg transition-all duration-200 group relative ${
              activeTool === tool.id 
                ? 'bg-accent-600 text-white shadow-lg shadow-blue-900/50' 
                : 'text-gray-400 hover:bg-gray-750 hover:text-white'
            }`}
          >
            {tool.icon}
            {/* Tooltip */}
            <span className="absolute left-full ml-2 px-2 py-1 bg-black text-xs text-white rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none transition-opacity">
              {tool.label}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 w-full flex flex-col items-center border-t border-gray-750 pt-4">
        <label className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider font-bold">Color</label>
        <div className="relative group cursor-pointer">
             <input
              type="color"
              value={brushColor}
              onChange={(e) => setBrushColor(e.target.value)}
              className="w-10 h-10 rounded-full border-2 border-gray-600 p-0 overflow-hidden cursor-pointer"
            />
            <div className="absolute inset-0 rounded-full ring-2 ring-white/10 pointer-events-none"></div>
        </div>
      </div>
    </div>
  );
};

export default Toolbar;