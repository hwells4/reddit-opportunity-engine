import { BrainCircuitIcon, FilterIcon, LightbulbIcon } from "lucide-react"

export function HowItWorks() {
  return (
    <section id="how-it-works" className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold mb-8 text-center">How It Works (The 3-Step Analysis Engine)</h2>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-md border-2 border-black shadow-neobrutalism hover:translate-y-[-2px] transition-transform">
          <div className="w-12 h-12 bg-blue-500 rounded-md flex items-center justify-center mb-4 border-2 border-black shadow-neobrutalism-sm">
            <FilterIcon className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-bold mb-3">1. Intelligent Post-Qualification</h3>
          <p>
            Each post is classified based on its relevance and actionability for building a new software product,
            filtering out irrelevant content.
          </p>
        </div>

        <div className="bg-white p-6 rounded-md border-2 border-black shadow-neobrutalism hover:translate-y-[-2px] transition-transform">
          <div className="w-12 h-12 bg-yellow-400 rounded-md flex items-center justify-center mb-4 border-2 border-black shadow-neobrutalism-sm">
            <BrainCircuitIcon className="w-6 h-6 text-black" />
          </div>
          <h3 className="text-xl font-bold mb-3">2. Cross-Post Synthesis</h3>
          <p>
            Findings from all relevantly classified posts are aggregated and synthesized, looking for recurring pain
            points and common user terminology.
          </p>
        </div>

        <div className="bg-white p-6 rounded-md border-2 border-black shadow-neobrutalism hover:translate-y-[-2px] transition-transform">
          <div className="w-12 h-12 bg-red-500 rounded-md flex items-center justify-center mb-4 border-2 border-black shadow-neobrutalism-sm">
            <LightbulbIcon className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-bold mb-3">3. Opportunity Identification</h3>
          <p>
            Based on the synthesized data, the system identifies the top 3-5 most promising product opportunities and
            generates a detailed MVP plan.
          </p>
        </div>
      </div>
    </section>
  )
}
