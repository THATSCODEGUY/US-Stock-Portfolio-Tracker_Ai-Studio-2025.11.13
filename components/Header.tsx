import React from 'react';
import { ChartBarIcon, GiftIcon } from './icons';

interface HeaderProps {
  onOpenChangelog: () => void;
  showUpdateBadge: boolean;
}


export const Header: React.FC<HeaderProps> = ({ onOpenChangelog, showUpdateBadge }) => {
  return (
    <header className="bg-gray-800 shadow-md">
      <div className="container mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <ChartBarIcon className="h-8 w-8 text-green-accent" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
            Stock Portfolio Tracker
          </h1>
        </div>
        
        <div className="flex items-center space-x-4">
           <span className="text-sm text-gray-400 hidden sm:block">U.S. Stock Portfolio Tracker</span>
           <button 
             onClick={onOpenChangelog} 
             className="relative text-gray-400 hover:text-white transition-colors"
             aria-label="View recent updates"
           >
             <GiftIcon className="h-6 w-6" />
             {showUpdateBadge && (
                <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-accent ring-2 ring-gray-800" />
             )}
           </button>
        </div>
      </div>
    </header>
  );
};