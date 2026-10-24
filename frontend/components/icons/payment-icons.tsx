import React from "react"

export interface PaymentIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string
  size?: number
}

/**
 * SVGL-styled official UPI (Unified Payments Interface) Logo
 */
export function SvglUpi({ className, size = 24, ...props }: PaymentIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        d="M58.7 15L34 85h17.3l24.7-70H58.7z"
        fill="#097939"
      />
      <path
        d="M41.3 15L16.6 85h17.3L58.6 15H41.3z"
        fill="#ED752E"
      />
      <path
        d="M66 50l12-35H60.7L48.7 50H66z"
        fill="#097939"
      />
    </svg>
  )
}

/**
 * SVGL official Google Logo (from https://svgl.app/library/google.svg)
 */
export function SvglGoogle({ className, size = 24, ...props }: PaymentIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  )
}

/**
 * SVGL-styled Google Pay Logo Badge
 */
export function SvglGooglePay({ className, size = 24, ...props }: PaymentIconProps) {
  return (
    <svg
      viewBox="0 0 120 48"
      width={size * 2.5}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Google G */}
      <g transform="translate(6, 12)">
        <path
          d="M11.5 5.8c0-.4-.03-.8-.1-1.2H5.8v2.3h3.2c-.1.7-.5 1.4-1.2 1.8v1.5h1.9c1.1-1 1.8-2.6 1.8-4.4z"
          fill="#4285F4"
        />
        <path
          d="M5.8 11.6c1.6 0 2.9-.5 3.8-1.4L7.7 8.7c-.5.3-1.2.6-1.9.6-1.5 0-2.7-1-3.2-2.3H.7v1.5c1 1.9 2.9 3.1 5.1 3.1z"
          fill="#34A853"
        />
        <path
          d="M2.6 7c-.1-.3-.2-.7-.2-1.1 0-.4.1-.8.2-1.1V3.3H.7C.3 4.1 0 5 0 5.9s.3 1.8.7 2.6L2.6 7z"
          fill="#FBBC05"
        />
        <path
          d="M5.8 2.4c.9 0 1.6.3 2.2.9L9.7 1.6C8.7.7 7.4.1 5.8.1 3.6.1 1.7 1.3.7 3.3l1.9 1.5c.5-1.4 1.7-2.4 3.2-2.4z"
          fill="#EA4335"
        />
      </g>
      {/* Pay Text */}
      <text
        x="36"
        y="32"
        fill="currentColor"
        fontSize="22"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="600"
        letterSpacing="-0.5"
      >
        Pay
      </text>
    </svg>
  )
}

/**
 * SVGL-styled PhonePe official vector logo
 */
export function SvglPhonePe({ className, size = 24, ...props }: PaymentIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Purple circular rounded background */}
      <rect width="100" height="100" rx="50" fill="#5F259F" />
      {/* Official PhonePe Pe glyph */}
      <path
        d="M59.3 22H38.5c-2.5 0-4.5 2-4.5 4.5v47c0 2.5 2 4.5 4.5 4.5s4.5-2 4.5-4.5V59h16.3c11.6 0 21-9.4 21-21s-9.4-16-21-16zm0 28H43V31h16.3c6.1 0 11 4.9 11 11s-4.9 8-11 8z"
        fill="#ffffff"
      />
      <path
        d="M62 43L47 78h9l15-35h-9z"
        fill="#ffffff"
      />
    </svg>
  )
}

/**
 * SVGL-styled Paytm official vector wordmark / icon
 */
export function SvglPaytm({ className, size = 24, ...props }: PaymentIconProps) {
  return (
    <svg
      viewBox="0 0 130 42"
      width={size * 2.8}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* "Pay" in Navy Blue */}
      <path
        d="M17.4 11.5c-4 0-6.8 2.4-7.4 6.1h6.6c1.6 0 2.7.9 2.7 2.3 0 1.5-1.2 2.3-2.7 2.3h-6.7v10.3H3.7V9h13.7c4.6 0 7.8 2.8 7.8 6.7 0 3.7-2.9 6.5-7.8 6.5zm-7.5 1.5v4.2h6.8c1.5 0 2.5-.9 2.5-2.1s-1-2.1-2.5-2.1H9.9z"
        fill="#002970"
      />
      <path
        d="M34.8 24.3c0-3.3 2.3-5.4 5.9-5.4 3.5 0 5.8 2.1 5.8 5.4v8.2h-5.8v-1.7c-.9 1.3-2.5 2-4.2 2-3.3 0-5.8-2.2-5.8-5.3 0-3.2 2.5-5.2 6.5-5.4l3.5-.2v-.9c0-1.1-.9-1.9-2.2-1.9-1.3 0-2.1.7-2.2 1.8h-5.5v-1.5zm7.8 4.2l-2.4.2c-1.5.1-2.4.9-2.4 2 0 1.2 1 2 2.3 2 1.4 0 2.5-.9 2.5-2.2v-2z"
        fill="#002970"
      />
      <path
        d="M58.3 19.2l5.7 13.3h-6.4l-2.6-6.6-2.5 6.6h-6.3l5.8-13.3-5.3-10.2h6.5l2.4 5.4 2.4-5.4h6.5l-6.2 10.2z"
        fill="#002970"
      />
      {/* "tm" in Cyan Blue */}
      <path
        d="M74.8 13.8v5.4h5.2v4.8h-5.2v8.5h-5.8v-8.5h-3.4v-4.8h3.4v-5.4h5.8z"
        fill="#00B9F5"
      />
      <path
        d="M84.2 19.2h5.7v2c1-1.5 2.7-2.3 4.5-2.3 2.1 0 3.8 1 4.5 2.7 1.1-1.7 3-2.7 5.1-2.7 3.3 0 5.6 2.1 5.6 5.6v8h-5.8v-7.1c0-1.3-.8-2-1.9-2-1.2 0-2.1.8-2.1 2.1v7h-5.8v-7.1c0-1.3-.8-2-1.9-2-1.2 0-2.1.8-2.1 2.1v7h-5.8v-13.3z"
        fill="#00B9F5"
      />
    </svg>
  )
}

/**
 * SVGL-styled BHIM UPI Logo Badge
 */
export function SvglBhim({ className, size = 24, ...props }: PaymentIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <rect width="100" height="100" rx="20" fill="#0b5c0b" />
      <path
        d="M25 75L50 25l25 50-25-15L25 75z"
        fill="#FF9933"
      />
      <path
        d="M37 68l13-26 13 26-13-8-13 8z"
        fill="#FFFFFF"
      />
      <path
        d="M45 63l5-10 5 10-5-3-5 3z"
        fill="#138808"
      />
    </svg>
  )
}

/**
 * SVGL-styled Cash Counter / Currency Notes Icon
 */
export function SvglCash({ className, size = 24, ...props }: PaymentIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  )
}

/**
 * SVGL-styled Paytm square app icon badge
 */
export function SvglPaytmIcon({ className, size = 24, ...props }: PaymentIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <rect width="100" height="100" rx="24" fill="#002970" />
      <text
        x="50"
        y="62"
        textAnchor="middle"
        fontSize="34"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        <tspan fill="#ffffff">P</tspan>
        <tspan fill="#00B9F5">tm</tspan>
      </text>
    </svg>
  )
}

/**
 * SVGL official PayPal Logo (from https://svgl.app/library/paypal.svg)
 */
export function SvglPaypal({ className, size = 24, ...props }: PaymentIconProps) {
  return (
    <svg
      viewBox="0 0 45 48"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        fill="#002991"
        d="M38.914 13.35c0 5.574-5.144 12.15-12.927 12.15H18.49l-.368 2.322L16.373 39H7.056l5.605-36h15.095c5.083 0 9.082 2.833 10.555 6.77a9.687 9.687 0 0 1 .603 3.58z"
      />
      <path
        fill="#0079C1"
        d="M44.414 19.35c0 5.574-5.144 12.15-12.927 12.15H23.99l-.368 2.322L21.873 45H12.556l5.605-36h15.095c5.083 0 9.082 2.833 10.555 6.77a9.687 9.687 0 0 1 .603 3.58z"
      />
    </svg>
  )
}

/**
 * SVGL official Stripe Logo (from https://svgl.app/library/stripe.svg)
 */
export function SvglStripe({ className, size = 24, ...props }: PaymentIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <rect width="24" height="24" rx="4" fill="#635BFF" />
      <path
        fill="#ffffff"
        d="M13.8 9.2c0-.7-.6-1.1-1.6-1.1-1.3 0-2.8.5-4 1.2V6.6c1.3-.6 2.8-.8 4.2-.8 3.5 0 5.6 1.7 5.6 4.7 0 4.6-6.4 3.9-6.4 5.9 0 .8.8 1.1 1.9 1.1 1.6 0 3.3-.6 4.6-1.4v2.7c-1.5.7-3.2 1-4.8 1-3.6 0-6-1.7-6-4.8-.1-4.7 6.5-4 6.5-6.2z"
      />
    </svg>
  )
}

