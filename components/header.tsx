"use client"

import Link from "next/link"
import { RocketIcon } from "lucide-react"

export function Header() {
  const handleStartClick = (e: React.MouseEvent) => {
    e.preventDefault()
    
    // Use the global centerRedditForm function to center and focus the form
    if (typeof window !== 'undefined' && window.centerRedditForm) {
      window.centerRedditForm()
    }
  }
  
  return (
    <header className="w-full bg-red-500 py-6 px-4 flex justify-between items-center sticky top-0 z-20 border-b-4 border-black shadow-[0_4px_0_rgba(0,0,0,0.2)]">
      <div className="container max-w-6xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-white rounded-md flex items-center justify-center border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.8)]">
            <RocketIcon className="w-8 h-8 text-red-500" />
          </div>
          <span className="font-black text-3xl tracking-tight text-white">Reddit Opportunity Engine</span>
        </div>
        <nav>
          <button
            onClick={handleStartClick}
            className="px-8 py-3 bg-yellow-400 rounded-md font-bold text-lg border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.8)] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.8)] transition-all"
          >
            Start Now
          </button>
        </nav>
      </div>
    </header>
  )
}
