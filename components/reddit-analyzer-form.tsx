"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { ArrowRightIcon, CheckIcon, XIcon, LoaderIcon, AlertTriangleIcon } from "lucide-react"
import { validateSubredditFallback } from "@/utils/subreddit-validator"
import { useToast } from "@/hooks/use-toast"

export function RedditAnalyzerForm() {
  const [subreddit, setSubreddit] = useState("")
  const [focus, setFocus] = useState("")
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  // Validation states
  const [isValidating, setIsValidating] = useState(false)
  const [isSubredditValid, setIsSubredditValid] = useState<boolean | null>(null)
  const [validationMessage, setValidationMessage] = useState("")
  const [debouncedSubreddit, setDebouncedSubreddit] = useState("")

  // Debounce subreddit input to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      if (subreddit && subreddit !== debouncedSubreddit) {
        setDebouncedSubreddit(subreddit)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [subreddit, debouncedSubreddit])

  // Validate subreddit when debounced value changes
  useEffect(() => {
    async function validateSubreddit() {
      if (!debouncedSubreddit) {
        setIsSubredditValid(null)
        setValidationMessage("")
        return
      }

      setIsValidating(true)
      try {
        // Try direct Reddit API first
        const response = await fetch(`https://www.reddit.com/r/${debouncedSubreddit}/about.json`)

        if (response.ok) {
          const data = await response.json()
          if (data.kind === "t5") {
            setIsSubredditValid(true)
            setValidationMessage(
              `r/${debouncedSubreddit} exists with ${data.data.subscribers.toLocaleString()} subscribers`,
            )
          } else {
            setIsSubredditValid(false)
            setValidationMessage(`r/${debouncedSubreddit} doesn't exist`)
          }
        } else {
          // If direct API fails, use fallback validation
          const fallbackResult = await validateSubredditFallback(debouncedSubreddit)
          setIsSubredditValid(fallbackResult.exists)
          setValidationMessage(fallbackResult.message)
        }
      } catch (error) {
        // If any error occurs, use fallback validation
        const fallbackResult = await validateSubredditFallback(debouncedSubreddit)
        setIsSubredditValid(fallbackResult.exists)
        setValidationMessage(fallbackResult.message)
      } finally {
        setIsValidating(false)
      }
    }

    if (debouncedSubreddit) {
      validateSubreddit()
    }
  }, [debouncedSubreddit])

  const handleSubredditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim()
    setSubreddit(value)

    if (!value) {
      setIsSubredditValid(null)
      setValidationMessage("")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subreddit || !email || !isSubredditValid) return

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/start-pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subreddit,
          focus,
          email
        }),
      });

      if (response.ok) {
        toast({
          title: "Success!",
          description: `Analysis requested for r/${subreddit}. Report will be sent to ${email}`,
        })
        
        // Reset form
        setSubreddit("")
        setFocus("")
        setEmail("")
        setIsSubredditValid(null)
        setValidationMessage("")
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.error || "Failed to process your request. Please try again.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again later.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div id="form" className="mx-auto w-full max-w-2xl bg-white rounded-xl border-2 border-black p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="subreddit" className="block text-base font-bold text-black">
            Target Subreddit <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <span className="text-gray-500 font-medium">r/</span>
            </div>
            <input
              id="subreddit"
              type="text"
              value={subreddit}
              onChange={handleSubredditChange}
              className={`w-full pl-8 pr-10 py-3 border-2 ${
                isSubredditValid === false 
                  ? "border-red-500" 
                  : isSubredditValid === true 
                  ? "border-green-500" 
                  : "border-black"
              } rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all`}
              placeholder="googleanalytics"
              required
            />
            {isValidating && (
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <LoaderIcon className="w-5 h-5 text-gray-600 animate-spin" />
              </div>
            )}
            {!isValidating && isSubredditValid === true && (
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <CheckIcon className="w-5 h-5 text-green-500" />
              </div>
            )}
            {!isValidating && isSubredditValid === false && (
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <XIcon className="w-5 h-5 text-red-500" />
              </div>
            )}
          </div>
          {validationMessage && (
            <p className={`text-sm font-medium ${isSubredditValid ? "text-green-600" : "text-red-500"}`}>{validationMessage}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="focus" className="block text-base font-bold text-black">
            Product / Category Focus (Optional)
          </label>
          <input
            id="focus"
            type="text"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            className="w-full px-4 py-3 border-2 border-black rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
            placeholder="Analytics automation tools"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="block text-base font-bold text-black">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 border-2 border-black rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
            placeholder="your@email.com"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || isValidating || isSubredditValid === false}
          className="w-full py-4 bg-red-500 text-white rounded-lg font-bold text-xl border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <LoaderIcon className="w-6 h-6 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              Receive Your Product Opportunity Blueprint
              <ArrowRightIcon className="w-6 h-6" />
            </>
          )}
        </button>

        <div className="flex items-start gap-2 mt-4 text-sm text-gray-600 font-medium">
          <AlertTriangleIcon className="w-4 h-4 mt-0.5" />
          <p>Your report will be delivered within 24 hours to your email address</p>
        </div>
      </form>
    </div>
  )
}
