import React from 'react';
import { ChartBarIcon } from './icons';

export const Header: React.FC = () => {
  return (
    <header className="bg-gray-800 shadow-md">
      <div className="container mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <ChartBarIcon className="h-8 w-8 text-green-accent" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
            Stock Portfolio Tracker
          </h1>
        </div>
        <span className="text-sm text-gray-400 hidden sm:block">U.S. Stock Portfolio Tracker</span>
      </div>
    </header>
  );
};