'use client'

import { useState } from 'react'

/**
 * 顧客ページ共通: すりガラス風フォーム入力
 * - ラベルはフォーム上部に配置
 * - フォーカス時に赤いグローエフェクト
 */
type GlassInputProps = {
  label: string
  type?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  rows?: number
}

export default function GlassInput({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  rows,
}: GlassInputProps) {
  const [showPw, setShowPw] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword && showPw ? 'text' : type

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-red-300/40 to-rose-300/40 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
        <div className="relative">
          {rows && rows > 1 ? (
            <textarea
              value={value}
              onChange={e => onChange(e.target.value)}
              required={required}
              disabled={disabled}
              placeholder={placeholder}
              rows={rows}
              className="w-full px-4 py-3.5 bg-white/50 backdrop-blur-lg rounded-2xl border border-white/60 shadow-inner shadow-white/30 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-red-300/60 focus:bg-white/60 transition-all resize-none disabled:opacity-50"
            />
          ) : (
            <input
              type={inputType}
              value={value}
              onChange={e => onChange(e.target.value)}
              required={required}
              disabled={disabled}
              placeholder={placeholder}
              className={`w-full px-4 py-3.5 bg-white/50 backdrop-blur-lg rounded-2xl border border-white/60 shadow-inner shadow-white/30 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-red-300/60 focus:bg-white/60 transition-all disabled:opacity-50 ${isPassword ? 'pr-12' : ''}`}
            />
          )}
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showPw ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
