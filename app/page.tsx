"use client"

import { RedditAnalyzerForm } from "@/components/reddit-analyzer-form"
import { Header } from "@/components/header"
import { PricingWidget } from "@/components/pricing-widget"
import { ChevronRight } from "lucide-react"
import Image from "next/image"

export default function Home() {
  const handleStartClick = (e: React.MouseEvent) => {
    e.preventDefault()
    
    // Use the global centerRedditForm function to center and focus the form
    if (typeof window !== 'undefined' && window.centerRedditForm) {
      window.centerRedditForm()
    }
  }
  
  return (
    <main className="min-h-screen w-full bg-white flex flex-col items-center relative overflow-x-hidden">
      <div className="w-full flex flex-col items-center">
        {/* Header section */}
        <Header />
        
        {/* Hero Section with Bold Background */}
        <div className="w-full bg-white relative z-20">
          <div className="container max-w-6xl mx-auto px-4 pt-16 pb-24">
            <section className="mb-20 text-center">
              <h1 className="text-4xl md:text-5xl lg:text-7xl font-black mb-6 text-black">
                Transform Reddit's Billions of Conversations Into Your Next Winning Product
              </h1>
              
              <p className="text-xl md:text-2xl text-gray-700 max-w-3xl mx-auto mb-12 font-medium">
                Turn the internet's most honest conversations into profitable products people are already begging for
              </p>
              
              <RedditAnalyzerForm />
            </section>

            {/* Why Reddit Section (Moved up and enhanced) */}
            <section className="mb-24 relative">
              <div className="h-1 w-32 bg-red-500 mx-auto mb-12"></div>
              <div className="text-center mb-10">
                <h2 className="text-4xl md:text-5xl font-black mb-6 text-black">
                  Why Reddit
                  <span className="relative">
                    <span className="block absolute -bottom-3 left-0 right-0 h-1.5 bg-red-500 transform -skew-x-12 rounded-sm"></span>
                  </span>
                </h2>
              </div>
              
              <div className="max-w-4xl mx-auto relative">
                {/* Background pattern */}
                <div className="absolute inset-0 -z-10 opacity-5">
                  <div className="absolute inset-0 bg-repeat" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23FF4500' fill-opacity='1' fill-rule='evenodd'%3E%3Ccircle cx='3' cy='3' r='3'/%3E%3Ccircle cx='13' cy='13' r='3'/%3E%3C/g%3E%3C/svg%3E\")" }}></div>
                </div>
                
                <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl border-2 border-black p-10 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transform hover:-translate-y-1 transition-transform duration-300">
                  <p className="text-2xl md:text-3xl text-gray-800 font-medium leading-relaxed text-center">
                    <span className="relative inline-block">
                      <span className="font-bold text-red-500">Reddit</span>
                      <span className="absolute bottom-0 left-0 right-0 h-1 bg-red-500/20 rounded-full"></span>
                    </span> is the last authentic corner of the internet—where people openly discuss their problems, frustrations, and wishes without marketing filters.
                  </p>
                  <p className="text-2xl md:text-3xl text-gray-800 font-medium mt-8 leading-relaxed text-center">
                    While others guess what customers want, you'll know <span className="font-bold">exactly</span> what they're asking for.
                  </p>
                </div>
              </div>
            </section>

            {/* How It Works Section with Bold Design */}
            <section className="mb-24 relative">
              <div className="h-1 w-32 bg-red-500 mx-auto mb-12"></div>
              <div className="pt-8">
                <h2 className="text-3xl font-black mb-16 text-center text-black">How We Find Your Next Product Opportunity</h2>
              
                <div className="grid md:grid-cols-3 gap-8">
                  <div className="bg-white rounded-xl border-2 border-black p-8 flex flex-col items-start shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 transition-transform">
                    <div className="w-16 h-16 bg-red-500 text-white rounded-lg flex items-center justify-center mb-6">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-filter"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                    </div>
                    <h3 className="text-2xl font-bold mb-3 text-black">Smart Filtering</h3>
                    <p className="text-gray-700 font-medium">
                      We analyze 250+ recent posts to find actionable market signals.
                    </p>
                    <div className="mt-auto pt-6">
                      <a href="#" className="text-red-500 inline-flex items-center text-base font-bold">
                        Learn more <ChevronRight className="ml-1 w-4 h-4" />
                      </a>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border-2 border-black p-8 flex flex-col items-start shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 transition-transform">
                    <div className="w-16 h-16 bg-red-500 text-white rounded-lg flex items-center justify-center mb-6">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-brain-circuit"><path d="M12 4.5a2.5 2.5 0 0 0-4.96-.46 2.5 2.5 0 0 0-1.98 3 2.5 2.5 0 0 0-1.32 4.24 3 3 0 0 0 .34 5.58 2.5 2.5 0 0 0 2.96 3.08 2.5 2.5 0 0 0 4.91.05L12 20V4.5Z"/><path d="M16 8V5c0-1.1.9-2 2-2"/><path d="M12 13h4"/><path d="M12 18h6a2 2 0 0 1 2 2v1"/><path d="M12 8h8"/><path d="M20.5 8a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Z"/><path d="M16.5 13a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Z"/><path d="M20.5 21a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Z"/><path d="M18.5 3a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Z"/></svg>
                    </div>
                    <h3 className="text-2xl font-bold mb-3 text-black">Pattern Recognition</h3>
                    <p className="text-gray-700 font-medium">
                      We identify recurring problems and user language patterns.
                    </p>
                    <div className="mt-auto pt-6">
                      <a href="#" className="text-red-500 inline-flex items-center text-base font-bold">
                        Learn more <ChevronRight className="ml-1 w-4 h-4" />
                      </a>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border-2 border-black p-8 flex flex-col items-start shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 transition-transform">
                    <div className="w-16 h-16 bg-red-500 text-white rounded-lg flex items-center justify-center mb-6">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-lightbulb"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
                    </div>
                    <h3 className="text-2xl font-bold mb-3 text-black">Product Blueprint</h3>
                    <p className="text-gray-700 font-medium">
                      You get a complete MVP plan for the most promising opportunity.
                    </p>
                    <div className="mt-auto pt-6">
                      <a href="#" className="text-red-500 inline-flex items-center text-base font-bold">
                        Learn more <ChevronRight className="ml-1 w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Pricing Section */}
            <section className="mb-24 relative">
              <div className="h-1 w-32 bg-red-500 mx-auto mb-12"></div>
              <PricingWidget />
            </section>

            {/* Call to Action Section */}
            <section className="mb-16">
              <div className="bg-red-500 p-12 rounded-xl border-2 border-black text-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <h2 className="text-3xl md:text-4xl font-black mb-4 text-white">Ready to Discover Your Next Product?</h2>
                <p className="text-xl mb-8 text-white/90 max-w-2xl mx-auto font-medium">Build what users actually want</p>
                <button 
                  onClick={handleStartClick}
                  className="px-8 py-4 bg-yellow-400 text-black rounded-lg font-bold text-xl border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.8)] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.8)] transition-all inline-flex items-center"
                >
                  Start Now <ChevronRight className="ml-2 w-5 h-5" />
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
