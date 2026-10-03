import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border-0 text-[13px] font-medium whitespace-nowrap transition-[background-color,filter,box-shadow,color] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary font-semibold text-primary-foreground hover:brightness-110 active:brightness-95",
        secondary:
          "bg-raised text-label shadow-[0_0_0_0.5px_var(--separator-strong),0_1px_2px_rgb(0_0_0/0.06)] hover:bg-fill-2 aria-expanded:bg-fill-2",
        outline:
          "bg-transparent text-label shadow-[inset_0_0_0_0.5px_var(--separator-strong)] hover:bg-fill-2 aria-expanded:bg-fill-2",
        ghost: "bg-transparent text-label-2 hover:bg-fill-2 hover:text-label aria-expanded:bg-fill-2 aria-expanded:text-label",
        tinted: "bg-primary-soft font-semibold text-primary hover:bg-primary/18",
        needs: "bg-needs-bg font-semibold text-needs-fg hover:brightness-95",
        destructive:
          "bg-raised text-problem-fg shadow-[0_0_0_0.5px_var(--separator-strong)] hover:bg-problem-bg focus-visible:ring-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-md px-2.5 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 rounded-[10px] px-[18px] text-[15px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8 text-label-2 [&_svg:not([class*='size-'])]:size-[17px]",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-md",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
