import { RedditAnalyzerForm } from "@/components/reddit-analyzer-form"
import { HowItWorks } from "@/components/how-it-works"
import { Header } from "@/components/header"

export default function Home() {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center py-8 px-4">
      <Header />
      <div className="w-full max-w-4xl mx-auto">
        <section className="mb-16">
          <div className="bg-white rounded-lg shadow-md p-8 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-center mb-2">Uncover Opportunities from Reddit Data</h1>
            <p className="text-center mb-6">
              Automate your market research by analyzing Reddit communities to identify unmet user needs, pain points,
              and actionable product opportunities.
            </p>
            <RedditAnalyzerForm />
          </div>
        </section>

        <HowItWorks />
      </div>
    </main>
  )
}
