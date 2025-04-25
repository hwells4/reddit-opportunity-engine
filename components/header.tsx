import Link from "next/link"
import { RocketIcon } from "lucide-react"

export function Header() {
  return (
    <header className="w-full max-w-4xl mx-auto mb-8 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-red-500 rounded-md flex items-center justify-center border-2 border-black shadow-neobrutalism">
          <RocketIcon className="w-6 h-6 text-white" />
        </div>
        <span className="font-bold text-xl">Reddit Analyzer</span>
      </div>
      <nav>
        <Link
          href="#"
          className="px-4 py-2 bg-yellow-400 rounded-md font-medium border-2 border-black shadow-neobrutalism hover:translate-y-[-2px] transition-transform"
        >
          Sign In
        </Link>
      </nav>
    </header>
  )
}
