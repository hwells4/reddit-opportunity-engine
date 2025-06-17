"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { ArrowRightIcon, CheckIcon, XIcon, LoaderIcon, AlertTriangleIcon } from "lucide-react"
import { validateSubredditFallback } from "@/utils/subreddit-validator"
import { useToast } from "@/hooks/use-toast"
import { SuccessDialog } from "@/components/success-dialog"
import { motion, useAnimationControls } from "framer-motion"

// Add a global event listener for centering the form
if (typeof window !== 'undefined') {
  // Polyfill for CustomEvent in older browsers
  if (typeof window.CustomEvent !== 'function') {
    window.CustomEvent = function(event: string, params: any) {
      params = params || { bubbles: false, cancelable: false, detail: null };
      const evt = document.createEvent('CustomEvent');
      evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
      return evt;
    } as any;
  }

  // Add the function to the window object (we've added the type in types/global.d.ts)
  (window as any).centerRedditForm = () => {
    const event = new CustomEvent('centerRedditForm')
    document.dispatchEvent(event)
    return true // For debugging
  }
}

export function RedditAnalyzerForm() {
  const [subreddit, setSubreddit] = useState("")
  const [focus, setFocus] = useState("")
  const [email, setEmail] = useState("")
  const [postLimit, setPostLimit] = useState("75")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [pipelineId, setPipelineId] = useState<string | undefined>()
  const [runId, setRunId] = useState<string | undefined>()
  const [useEnhancedDiscovery, setUseEnhancedDiscovery] = useState(true)
  const { toast } = useToast()
  const formRef = useRef<HTMLDivElement>(null)
  const subredditInputRef = useRef<HTMLInputElement>(null)
  const controls = useAnimationControls()

  // Listen for center form events
  useEffect(() => {
    const handleCenterForm = () => {
      if (formRef.current) {
        // First scroll to the form
        formRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        
        // Then apply a subtle attention animation
        controls.start({
          scale: [1, 1.02, 1],
          boxShadow: [
            "6px 6px 0px 0px rgba(0,0,0,1)",
            "8px 8px 0px 0px rgba(0,0,0,1)",
            "6px 6px 0px 0px rgba(0,0,0,1)"
          ],
          transition: { duration: 0.5 }
        }).then(() => {
          // Focus the subreddit input after animation completes
          if (subredditInputRef.current) {
            subredditInputRef.current.focus()
          }
        })
      }
    }
    
    document.addEventListener('centerRedditForm', handleCenterForm)
    
    return () => {
      document.removeEventListener('centerRedditForm', handleCenterForm)
    }
  }, [controls])

  // Validation states
  const [isValidating, setIsValidating] = useState(false)
  const [isSubredditValid, setIsSubredditValid] = useState<boolean | null>(null)
  const [validationMessage, setValidationMessage] = useState("")
  const [debouncedSubreddit, setDebouncedSubreddit] = useState("")

  // Store form values for success dialog
  const [submittedValues, setSubmittedValues] = useState({
    subreddit: "",
    email: ""
  })

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
      let apiEndpoint = '/api/start-pipeline'
      let requestBody: any = {
        subreddit,
        focus,
        email,
        postLimit
      }

      // Use enhanced discovery if enabled
      if (useEnhancedDiscovery) {
        apiEndpoint = '/api/enhanced-subreddit-discovery'
        requestBody = {
          product_type: focus || 'General market research',
          problem_area: `Understanding discussions in r/${subreddit}`,
          target_audience: 'Reddit community members',
          additional_context: `Analyzing ${postLimit} posts from r/${subreddit} for ${email}`
        }
      }

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const responseData = await response.json();
        
        if (useEnhancedDiscovery) {
          // Handle enhanced discovery response
          toast({
            title: "Enhanced Discovery Complete!",
            description: `Found ${responseData.summary?.total_subreddits || 0} relevant subreddits using AI-powered discovery.`,
          });
          
          // You can handle the enhanced results here
          console.log('Enhanced Discovery Results:', responseData);
        } else {
          // Handle traditional pipeline response
          if (responseData.run_id) {
            setRunId(responseData.run_id);
          }
          
          if (responseData.saved_item_id) {
            setPipelineId(responseData.saved_item_id);
          }
          
          setSubmittedValues({
            subreddit,
            email
          });
          
          setShowSuccessDialog(true);
        }
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

  const handleDialogClose = (open: boolean) => {
    setShowSuccessDialog(open);
    
    // Only reset form when closing the dialog
    if (!open) {
      setSubreddit("")
      setFocus("")
      setEmail("")
      setPostLimit("75")
      setIsSubredditValid(null)
      setValidationMessage("")
    }
  }

  return (
    <>
      <motion.div 
        id="form" 
        ref={formRef}
        animate={controls}
        className="mx-auto w-full max-w-2xl bg-white rounded-xl border-2 border-black p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
      >
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
                ref={subredditInputRef}
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
                  <LoaderIcon className="h-5 w-5 text-gray-400 animate-spin" />
                </div>
              )}
              {isSubredditValid === true && !isValidating && (
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <CheckIcon className="h-5 w-5 text-green-500" />
                </div>
              )}
              {isSubredditValid === false && !isValidating && (
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <XIcon className="h-5 w-5 text-red-500" />
                </div>
              )}
            </div>
            {validationMessage && (
              <p className={`text-sm ${isSubredditValid ? "text-green-600" : "text-red-500"} mt-1`}>
                {validationMessage}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="focus" className="block text-base font-bold text-black">
              Business Focus <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="focus"
              type="text"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              className="w-full py-3 px-4 border-2 border-black rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
              placeholder="SaaS, E-commerce, Content, etc."
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="block text-base font-bold text-black">
              Your Email <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full py-3 px-4 border-2 border-black rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="postLimit" className="block text-base font-bold text-black">
              Posts Per Subreddit <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="postLimit"
              type="number"
              min="10"
              max="500"
              value={postLimit}
              onChange={(e) => setPostLimit(e.target.value)}
              className="w-full py-3 px-4 border-2 border-black rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
              placeholder="75"
            />
            <p className="text-xs text-gray-600">Higher values provide more data but may take longer to process.</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="enhancedDiscovery" className="block text-base font-bold text-black">
                Enhanced AI Discovery <span className="text-green-600 text-sm">(Recommended)</span>
              </label>
              <div className="relative inline-block w-12 h-6">
                <input
                  id="enhancedDiscovery"
                  type="checkbox"
                  checked={useEnhancedDiscovery}
                  onChange={(e) => setUseEnhancedDiscovery(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`block w-12 h-6 rounded-full border-2 border-black cursor-pointer transition-all ${
                    useEnhancedDiscovery ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                  onClick={() => setUseEnhancedDiscovery(!useEnhancedDiscovery)}
                >
                  <div
                    className={`w-4 h-4 bg-white border border-black rounded-full shadow-md transform transition-transform ${
                      useEnhancedDiscovery ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-600">
              {useEnhancedDiscovery 
                ? "🤖 AI-powered discovery finds multiple relevant subreddits using Claude 4 Sonnet + OpenAI o3 + Perplexity AI"
                : "📊 Basic analysis of the specified subreddit only (legacy mode)"
              }
            </p>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting || !subreddit || !email || isSubredditValid === false}
              className="w-full py-4 bg-red-500 text-white rounded-lg font-bold text-lg border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all flex justify-center items-center"
            >
              {isSubmitting ? (
                <>
                  <LoaderIcon className="animate-spin mr-2 h-5 w-5" />
                  Processing...
                </>
              ) : (
                <>
                  Get My Opportunity Report <ArrowRightIcon className="ml-2 h-5 w-5" />
                </>
              )}
            </button>
          </div>

          <div className="text-xs text-gray-600 text-center mt-4 flex items-center justify-center gap-1">
            <AlertTriangleIcon className="h-3 w-3" />
            Limited to 5 analyses per subreddit for data quality
          </div>
        </form>
      </motion.div>

      <SuccessDialog
        open={showSuccessDialog}
        onOpenChange={handleDialogClose}
        subreddit={submittedValues.subreddit}
        email={submittedValues.email}
        runId={runId}
        pipelineId={pipelineId}
      />
    </>
  )
}
