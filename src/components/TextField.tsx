'use client'

import { useState, useId } from 'react'

type TextFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'email' | 'password' | 'tel' | 'number' | 'date' | 'datetime-local' | 'url' | 'time'
  placeholder?: string
  error?: string
  helper?: string
  required?: boolean
  disabled?: boolean
  leadingIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
  className?: string
  rows?: number // >0 で textarea に変化
  onBlur?: () => void
  autoComplete?: string // ブラウザの自動補完制御（'off' で抑止）
  name?: string         // 任意 — autofill 識別子。指定しなければ補完されにくくなる
  step?: number         // number/time/date 入力の刻み幅（例: time で 1800 = 30分）
}

export default function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  helper,
  required = false,
  disabled = false,
  leadingIcon,
  trailingIcon,
  className = '',
  rows,
  onBlur,
  autoComplete,
  name,
  step,
}: TextFieldProps) {
  const id = useId()
  const [focused, setFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const hasValue = value.length > 0
  const hasNativeUI = type === 'date' || type === 'time' || type === 'datetime-local'
  const isFloating = focused || hasValue || !!placeholder || hasNativeUI
  const isPassword = type === 'password'
  const inputType = isPassword && showPassword ? 'text' : type

  // Vercel shadow-as-border + focus ring
  const borderShadow = error
    ? 'rgb(239,68,68) 0px 0px 0px 1px'
    : focused
      ? 'hsla(212, 100%, 48%, 1) 0px 0px 0px 2px'
      : 'rgb(235,235,235) 0px 0px 0px 1px'

  const labelColor = error
    ? 'text-[var(--md-sys-color-error)]'
    : focused
      ? 'text-[hsla(212,100%,48%,1)]'
      : 'text-[var(--md-sys-color-on-surface-variant)]'

  const sharedInputClass = `
    w-full bg-transparent text-sm text-[var(--md-sys-color-on-surface)]
    placeholder:text-[#a3a3a3]
    focus:outline-none disabled:opacity-50
    ${leadingIcon ? 'pl-10' : 'pl-3.5'}
    ${(trailingIcon || isPassword) ? 'pr-10' : 'pr-3.5'}
  `

  return (
    <div className={`relative ${className}`}>
      {/* Floating label */}
      <label
        htmlFor={id}
        className={`
          absolute left-3 transition-all duration-200 pointer-events-none z-10
          ${isFloating
            ? `-top-2.5 text-xs px-1 bg-[var(--md-sys-color-surface-container-lowest,#fff)] ${labelColor}`
            : `top-3 text-[13px] font-medium ${labelColor}`
          }
          ${leadingIcon && !isFloating ? 'left-10' : 'left-3'}
        `}
      >
        {label}{required && <span className="text-[var(--md-sys-color-error)] ml-0.5">*</span>}
      </label>

      <div
        className="relative rounded-[6px] bg-[var(--md-sys-color-surface-container-lowest,#fff)] transition-shadow duration-200"
        style={{ boxShadow: borderShadow }}
      >
        {/* Leading icon */}
        {leadingIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-on-surface-variant)]">
            {leadingIcon}
          </span>
        )}

        {/* Input / Textarea */}
        {rows && rows > 0 ? (
          <textarea
            id={id}
            name={name}
            autoComplete={autoComplete}
            value={value}
            onChange={e => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); onBlur?.() }}
            disabled={disabled}
            placeholder={isFloating ? placeholder : undefined}
            rows={rows}
            className={`${sharedInputClass} pt-3.5 pb-2 resize-y min-h-[80px]`}
          />
        ) : (
          <input
            id={id}
            name={name}
            autoComplete={autoComplete}
            type={inputType}
            step={step}
            value={value}
            onChange={e => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); onBlur?.() }}
            disabled={disabled}
            placeholder={isFloating ? placeholder : undefined}
            className={`${sharedInputClass} h-12`}
          />
        )}

        {/* Trailing icon / Password toggle */}
        {isPassword ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]"
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.092 1.092a4 4 0 00-5.558-5.558z" clipRule="evenodd" />
                <path d="M10.748 13.93l2.523 2.523A9.987 9.987 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 014.09 5.12L6.38 7.41a4 4 0 004.368 6.52z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        ) : trailingIcon ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-on-surface-variant)]">
            {trailingIcon}
          </span>
        ) : null}
      </div>

      {/* Helper / Error text */}
      {(error || helper) && (
        <p className={`mt-1 text-xs px-3.5 ${error ? 'text-[var(--md-sys-color-error)]' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
          {error || helper}
        </p>
      )}
    </div>
  )
}
