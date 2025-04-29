"use client"

import { useState, useEffect } from "react"
import { CheckCircle, Loader2, ClipboardCheck, Mail } from "lucide-react"
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"

export type SuccessDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  subreddit: string
  email: string
  runId?: string
  pipelineId?: string
}

export function SuccessDialog({ 
  open, 
  onOpenChange,
  subreddit,
  email,
  runId,
  pipelineId
}: SuccessDialogProps) {
  const [progress, setProgress] = useState(10)
  const [statusMessage, setStatusMessage] = useState("Starting analysis...")
  const [useSimulation, setUseSimulation] = useState(false)
  
  // Initialize and check if we should use simulation or real API
  useEffect(() => {
    if (!open) return
    
    // Reset state
    setProgress(10)
    setStatusMessage("Starting analysis...")
    
    // Determine if we should use simulation
    // We need runId for the real API call
    setUseSimulation(!runId)
  }, [open, runId])
  
  // Simulation mode - for when no runId is available
  useEffect(() => {
    if (!open || !useSimulation) return
    
    // Simulate progress updates
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval)
          setStatusMessage("Analysis complete! Report being prepared...")
          return 100
        }
        
        // Update status message based on progress
        if (prev < 30) {
          setStatusMessage("Collecting data from r/" + subreddit + "...")
        } else if (prev < 50) {
          setStatusMessage("Analyzing post engagement patterns...")
        } else if (prev < 70) {
          setStatusMessage("Identifying product opportunities...")
        } else if (prev < 90) {
          setStatusMessage("Generating opportunity report...")
        }
        
        return prev + 10
      })
    }, 2000)
    
    return () => clearInterval(interval)
  }, [open, useSimulation, subreddit])

  // Real API mode - for when runId is available
  useEffect(() => {
    if (!open || useSimulation || !runId) return
    
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/check-status?runId=${runId}`)
        
        if (!response.ok) {
          console.error("Error checking pipeline status, falling back to simulation")
          setUseSimulation(true)
          return
        }
        
        const data = await response.json()
        
        // Log the API response data for debugging
        console.log("Gumloop status response:", data)
        
        setProgress(data.progress)
        setStatusMessage(data.status)
        
        // If not complete, check again in 5 seconds
        if (!data.finished) {
          setTimeout(checkStatus, 5000)
        }
      } catch (error) {
        console.error("Error checking pipeline status:", error)
        setUseSimulation(true)
      }
    }
    
    // Start checking status
    checkStatus()
  }, [open, useSimulation, runId])
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] bg-white border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
        <DialogHeader className="mb-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 mb-5">
            <CheckCircle className="h-7 w-7 text-green-600" />
          </div>
          <DialogTitle className="text-2xl text-center">Success!</DialogTitle>
          <DialogDescription className="text-center text-base mt-2">
            Your Reddit opportunity blueprint for r/{subreddit} is being generated
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-5">
          <div className="mb-8">
            <div className="flex justify-between mb-3">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-3 bg-gray-200" />
          </div>
          
          <div className="flex items-center gap-3 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            {progress < 100 ? (
              <Loader2 className="h-5 w-5 text-red-500 animate-spin" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-600" />
            )}
            <span className="text-sm">{statusMessage}</span>
          </div>
          
          <p className="text-sm text-gray-600 mb-6">
            You'll receive your complete report at <strong>{email}</strong> within 24 hours.
          </p>
        </div>
        
        <DialogFooter className="flex flex-col gap-4 sm:flex-col">
          <Button 
            className="w-full py-4 bg-red-500 text-white rounded-lg font-bold text-base border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all"
            onClick={() => window.open("https://newsletter.reddit-opportunity-engine.com", "_blank")}
          >
            <Mail className="mr-2 h-4 w-4" />
            Subscribe to Our Newsletter
          </Button>
          
          <Button 
            variant="outline"
            className="w-full py-4 bg-white text-black rounded-lg font-bold text-base border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all"
            onClick={() => onOpenChange(false)}
          >
            <ClipboardCheck className="mr-2 h-4 w-4" />
            Return to Form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 