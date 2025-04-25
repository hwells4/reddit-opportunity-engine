import * as React from "react"

import { cn } from "@/lib/utils"

// Add the shadow class name for reuse
const inputShadowClass = "shadow-neobrutalism"
const focusVisibleStyles = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  (props: React.ComponentProps<"input">, ref: React.ForwardedRef<HTMLInputElement>) => {
    const { className, type, ...rest } = props
    return (
      <input
        type={type}
        className={cn(
          `flex h-10 w-full rounded-md border-2 border-foreground ${inputShadowClass} bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground ${focusVisibleStyles} disabled:cursor-not-allowed disabled:opacity-50 md:text-sm`,
          className
        )}
        ref={ref}
        {...rest}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
