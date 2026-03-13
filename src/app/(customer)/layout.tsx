'use client'

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-portal="customer">
      {children}
    </div>
  )
}
