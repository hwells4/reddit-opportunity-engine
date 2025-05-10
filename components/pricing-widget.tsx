"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

// Define tier structure
type Tier = {
  id: string;
  name: string;
  priceLabel: string;
  priceValue: number;
  userLimit: string;
  index: number; // To easily compare tiers
};

const tiers: Tier[] = [
  { id: 'free', name: 'Free', priceLabel: 'Free', priceValue: 0, userLimit: 'first 25 users', index: 0 },
  { id: 'early', name: 'Early Bird', priceLabel: '$29', priceValue: 29, userLimit: 'first 100 users', index: 1 },
  { id: 'growth', name: 'Growth', priceLabel: '$59', priceValue: 59, userLimit: 'first 1k users', index: 2 },
  { id: 'premium', name: 'Premium', priceLabel: '$129', priceValue: 129, userLimit: 'after beta', index: 3 },
];

export function PricingWidget() {
  // Set initial state to the 'free' tier object
  const [activeTier, setActiveTier] = useState<Tier>(tiers[0]);

  // useEffect(() => { 
  //   // Simulate fetching active tier index from DB later
  //   const fetchedActiveTierIndex = 0; // Example: Start at free
  //   setActiveTier(tiers[fetchedActiveTierIndex]);
  // }, []);

  const getTierState = (tierIndex: number): 'past' | 'on' | 'future' => {
    if (tierIndex < activeTier.index) return 'past';
    if (tierIndex === activeTier.index) return 'on';
    return 'future';
  };

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8 bg-white rounded-lg border-2 border-black shadow-neobrutalism">
      <div className="text-center mb-12"> 
        <h2 className="text-lg font-semibold text-primary"># Pricing</h2>
        <h1 className="mt-2 text-4xl md:text-5xl font-black text-black">Save yourself 60 hours of work</h1>
      </div>
      
      {/* --- Pricing Slider Section --- */}
      <div className="relative max-w-4xl mx-auto mb-16"> 
        {/* Slider Track - Thinner */}
        <div className="w-full h-1 bg-gray-200 relative mb-6 rounded-full"> 
          {/* Slider Dots Container */}
          <div className="absolute inset-x-0 -top-3 flex items-center justify-between px-1">
            {tiers.map((tier) => {
              const state = getTierState(tier.index);
              return (
                <div 
                  key={tier.id}
                  className={cn(
                    "rounded-full border-2 border-black transition-all duration-300 shadow-sm",
                    state === 'on' ? 'h-7 w-7 bg-primary' : 'h-5 w-5',
                    state === 'past' ? 'bg-gray-500 border-gray-500' : '',
                    state === 'future' ? 'bg-gray-300 border-gray-400' : ''
                  )}
                />
              );
            })}
          </div>
        </div>
        
        {/* Pricing Labels */}
        <div className="flex justify-between text-base text-black font-medium px-1 mt-8">
          {tiers.map((tier) => {
            const state = getTierState(tier.index);
            return (
              <div key={tier.id} className="text-center flex-1 px-2">
                <div className={cn(
                  "mb-1 font-bold",
                  state === 'on' ? 'text-2xl text-primary' : 'text-xl',
                  state === 'past' ? 'text-gray-400 line-through' : '',
                  state === 'future' ? 'text-gray-400' : 'text-black' 
                )}>
                  {tier.priceLabel}
                </div>
                <div className={cn(
                  "text-sm",
                  state === 'on' ? 'text-black font-semibold' : 'text-gray-500',
                  state === 'past' ? 'text-gray-400 line-through' : '',
                   state === 'future' ? 'text-gray-400' : ''
                )}>
                  {tier.userLimit}
                   {state === 'on' && tier.id === 'free' && <span className="block text-xs text-primary font-bold mt-1">(Limited Spots!)</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* --- Main Content Card --- */}
      <div className="bg-white rounded-lg border-2 border-black shadow-neobrutalism overflow-hidden">
        <div className="grid md:grid-cols-2">
          {/* Left Column: Testimonial, Price, Button - Increased Padding */}
          <div className="p-8 md:p-10 border-r-2 border-black"> 
            <div className="mb-8">
              <h3 className="text-xl font-bold text-black mb-3">Harrison Wells:</h3>
              <p className="text-gray-900 italic text-base leading-relaxed"> 
                "I built Reddit Opportunity Engine because I needed it for myself.
              </p>
              <p className="text-gray-900 italic text-base leading-relaxed mt-3"> 
                I was building applications without doing proper market validation and then was feeling discouraged when I didn't know how to market them or who my audience was supposed to be. This product single-handedly finds your audience and shows you how to target them all in one fell swoop."
              </p>
            </div>
            
            <div className="text-6xl font-extrabold text-black mb-8">
              {activeTier.priceLabel}
            </div>

            <Button 
              className="w-full py-4 text-xl bg-yellow-400 text-black border-2 border-black shadow-neobrutalism hover:bg-yellow-400/90 active:bg-yellow-400/80 hover:shadow-neobrutalism-hover active:shadow-neobrutalism-sm transition-all duration-150 ease-in-out font-bold"
              onClick={() => window.open("/sign-up", "_self")}
            >
              Buy Now →
            </Button>
          </div>
          
          {/* Right Column: Features - Increased Padding */}
          <div className="p-8 md:p-10">
            <h3 className="text-xl font-bold text-black mb-8">What you get:</h3>
            <ul className="space-y-5">
              <li className="flex items-start">
                <Check className="flex-shrink-0 h-6 w-6 text-primary mr-4 mt-0.5" />
                <span className="text-gray-900 text-base">MVP roadmap and PRD for use today in cursor — 2 weeks to deployment</span>
              </li>
              <li className="flex items-start">
                <Check className="flex-shrink-0 h-6 w-6 text-primary mr-4 mt-0.5" />
                <span className="text-gray-900 text-base">Full data back landing page copy</span>
              </li>
              <li className="flex items-start">
                 <Check className="flex-shrink-0 h-6 w-6 text-primary mr-4 mt-0.5" />
                <span className="text-gray-900 text-base">Full audience profile for marketing</span>
              </li>
              <li className="flex items-start">
                 <Check className="flex-shrink-0 h-6 w-6 text-primary mr-4 mt-0.5" />
                <span className="text-gray-900 text-base">Full Subtext AI voice based on what customers are asking for (to inform writing)</span>
              </li>
              <li className="flex items-start">
                 <Check className="flex-shrink-0 h-6 w-6 text-primary mr-4 mt-0.5" />
                <span className="text-gray-900 text-base font-bold">BONUS: Coming soon</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
} 