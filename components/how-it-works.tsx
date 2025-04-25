import { BrainCircuitIcon, FilterIcon, LightbulbIcon } from "lucide-react"

export function HowItWorks() {
  return (
    <section id="how-it-works" className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold mb-8 text-center">How We Find Your Next Product Opportunity</h2>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="bg-card text-card-foreground p-6 rounded-lg border">
          <div className="w-12 h-12 bg-primary text-primary-foreground rounded-md flex items-center justify-center mb-4">
            <FilterIcon className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Smart Filtering</h3>
          <p className="text-muted-foreground">
            We analyze 250+ recent posts to find actionable market signals.
          </p>
        </div>

        <div className="bg-card text-card-foreground p-6 rounded-lg border">
          <div className="w-12 h-12 bg-primary text-primary-foreground rounded-md flex items-center justify-center mb-4">
            <BrainCircuitIcon className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Pattern Recognition</h3>
          <p className="text-muted-foreground">
            We identify recurring problems and user language patterns.
          </p>
        </div>

        <div className="bg-card text-card-foreground p-6 rounded-lg border">
          <div className="w-12 h-12 bg-primary text-primary-foreground rounded-md flex items-center justify-center mb-4">
            <LightbulbIcon className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Product Blueprint</h3>
          <p className="text-muted-foreground">
            You get a complete MVP plan for the most promising opportunity.
          </p>
        </div>
      </div>
    </section>
  )
}
