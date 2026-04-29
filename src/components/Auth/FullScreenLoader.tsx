import React from 'react';

export const FullScreenLoader = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center h-screen bg-[#02040a] text-white">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mb-4"></div>
    <p className="text-sm font-bold uppercase tracking-widest">{message}</p>
  </div>
);
