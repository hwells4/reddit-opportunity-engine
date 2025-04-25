"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { ArrowRightIcon, CheckIcon, XIcon, LoaderIcon } from "lucide-react"
import { validateSubredditFallback } from "@/utils/subreddit-validator"

export function RedditAnalyzerForm() {
  const [subreddit, setSubreddit] = useState("")
  const [focus, setFocus] = useState("")
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!subreddit || !email || !isSubredditValid) return

    setIsSubmitting(true)

    // Mock submission - would be replaced with actual API call
    setTimeout(() => {
      setIsSubmitting(false)
      alert(`Analysis requested for r/${subreddit}. Report will be sent to ${email}`)
      setSubreddit("")
      setFocus("")
      setEmail("")
      setIsSubredditValid(null)
      setValidationMessage("")
    }, 1500)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="subreddit" className="block font-medium">
          Target Subreddit <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <span className="text-gray-500">r/</span>
          </div>
          <input
            id="subreddit"
            type="text"
            value={subreddit}
            onChange={handleSubredditChange}
            className={`w-full pl-8 pr-10 py-2 border-2 border-black rounded-md shadow-neobrutalism hover:translate-y-[-2px] transition-transform focus:outline-none ${
              isSubredditValid === false ? "border-red-500" : ""
            }`}
            placeholder="googleanalytics"
            required
          />
          {isValidating && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              <LoaderIcon className="w-5 h-5 text-gray-500 animate-spin" />
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
          <p className={`text-sm ${isSubredditValid ? "text-green-600" : "text-red-500"}`}>{validationMessage}</p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="focus" className="block font-medium">
          Product / Category Focus (Optional)
        </label>
        <input
          id="focus"
          type="text"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          className="w-full px-4 py-2 border-2 border-black rounded-md shadow-neobrutalism hover:translate-y-[-2px] transition-transform focus:outline-none"
          placeholder="Analytics automation tools"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="email" className="block font-medium">
          Email Address <span className="text-red-500">*</span>
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-2 border-2 border-black rounded-md shadow-neobrutalism hover:translate-y-[-2px] transition-transform focus:outline-none"
          placeholder="your@email.com"
          required
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting || isValidating || isSubredditValid === false}
        className="w-full mt-6 px-6 py-3 bg-red-500 text-white rounded-md font-medium border-2 border-black shadow-neobrutalism hover:translate-y-[-2px] transition-transform disabled:opacity-70 disabled:hover:translate-y-0 flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <LoaderIcon className="w-5 h-5 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            Get Your Analysis Report
            <ArrowRightIcon className="w-5 h-5" />
          </>
        )}
      </button>

      <p className="text-center text-sm mt-4">Your report will be delivered within 24 hours</p>
    </form>
  )
}
