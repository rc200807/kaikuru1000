'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface BankItem {
  code: string
  name: string
  kana: string
  hira: string
  roma: string
  normalize?: { name?: string; kana?: string; hira?: string; roma?: string }
}

interface BranchItem {
  code: string
  name: string
  kana: string
  hira: string
  roma: string
}

interface BankSearchProps {
  bankName?: string
  branchName?: string
  onChange: (data: {
    bankName: string
    bankCode: string
    branchName: string
    branchCode: string
  }) => void
}

// In-memory cache for bank list
let banksCache: BankItem[] | null = null

export default function BankSearch({ bankName = '', branchName = '', onChange }: BankSearchProps) {
  const [bankQuery, setBankQuery] = useState(bankName)
  const [branchQuery, setBranchQuery] = useState(branchName)

  const [banks, setBanks] = useState<BankItem[]>([])
  const [branches, setBranches] = useState<BranchItem[]>([])

  const [loadingBanks, setLoadingBanks] = useState(false)
  const [loadingBranches, setLoadingBranches] = useState(false)

  const [selectedBank, setSelectedBank] = useState<BankItem | null>(null)
  const [selectedBranch, setSelectedBranch] = useState<BranchItem | null>(null)

  const [showBankDropdown, setShowBankDropdown] = useState(false)
  const [showBranchDropdown, setShowBranchDropdown] = useState(false)
  const [userCleared, setUserCleared] = useState(false) // ユーザーが手動でクリアした場合、pre-selectを無効化

  const [filteredBanks, setFilteredBanks] = useState<BankItem[]>([])
  const [filteredBranches, setFilteredBranches] = useState<BranchItem[]>([])

  const bankRef = useRef<HTMLDivElement>(null)
  const branchRef = useRef<HTMLDivElement>(null)
  const debounceTimerBank = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceTimerBranch = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch all banks (cached)
  useEffect(() => {
    if (banksCache) {
      setBanks(banksCache)
      return
    }
    setLoadingBanks(true)
    fetch('/api/zengin/banks')
      .then(res => res.json())
      .then((data: BankItem[]) => {
        banksCache = data
        setBanks(data)
      })
      .catch(() => setBanks([]))
      .finally(() => setLoadingBanks(false))
  }, [])

  // If bankName prop matches a known bank, pre-select it
  useEffect(() => {
    if (bankName && banks.length > 0 && !selectedBank && !userCleared) {
      const match = banks.find(b =>
        b.name === bankName ||
        b.normalize?.name === bankName ||
        (b.normalize?.name && bankName.includes(b.name))
      )
      if (match) {
        setSelectedBank(match)
        setBankQuery(match.normalize?.name || match.name)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankName, banks])

  // Fetch branches when bank is selected
  useEffect(() => {
    if (!selectedBank) {
      setBranches([])
      return
    }
    setLoadingBranches(true)
    fetch(`/api/zengin/branches?bankCode=${selectedBank.code}`)
      .then(res => res.json())
      .then((data: BranchItem[]) => {
        setBranches(data)
        // If branchName prop matches, pre-select
        if (branchName) {
          const match = data.find((b: BranchItem) =>
            b.name === branchName ||
            b.code === branchName ||
            branchName.includes(b.name)
          )
          if (match) {
            setSelectedBranch(match)
            setBranchQuery(match.name)
          } else {
            setBranchQuery(branchName)
          }
        }
      })
      .catch(() => setBranches([]))
      .finally(() => setLoadingBranches(false))
  }, [selectedBank])

  // Filter banks with debounce
  const handleBankQueryChange = useCallback(
    (q: string) => {
      setBankQuery(q)
      setShowBankDropdown(true)
      setUserCleared(true) // ユーザーが入力を変更したのでpre-selectを無効化
      if (selectedBank) {
        setSelectedBank(null)
        setSelectedBranch(null)
        setBranchQuery('')
        setBranches([])
      }
      if (debounceTimerBank.current) clearTimeout(debounceTimerBank.current)
      debounceTimerBank.current = setTimeout(() => {
        if (!q.trim()) {
          setFilteredBanks([])
          return
        }
        const lower = q.toLowerCase()
        const results = banks.filter(
          b =>
            b.name.includes(q) ||
            b.normalize?.name?.includes(q) ||
            b.kana?.toLowerCase().includes(lower) ||
            b.hira?.toLowerCase().includes(lower) ||
            b.normalize?.kana?.toLowerCase().includes(lower) ||
            b.normalize?.hira?.toLowerCase().includes(lower) ||
            b.code.includes(q)
        )
        setFilteredBanks(results.slice(0, 30))
      }, 300)
    },
    [banks, selectedBank]
  )

  // Filter branches with debounce
  const handleBranchQueryChange = useCallback(
    (q: string) => {
      setBranchQuery(q)
      setShowBranchDropdown(true)
      if (selectedBranch) {
        setSelectedBranch(null)
      }
      if (debounceTimerBranch.current) clearTimeout(debounceTimerBranch.current)
      debounceTimerBranch.current = setTimeout(() => {
        if (!q.trim()) {
          setFilteredBranches(branches)
          return
        }
        const lower = q.toLowerCase()
        const results = branches.filter(
          b =>
            b.name.includes(q) ||
            b.kana?.toLowerCase().includes(lower) ||
            b.hira?.toLowerCase().includes(lower) ||
            b.code.includes(q)
        )
        setFilteredBranches(results)
      }, 300)
    },
    [branches, selectedBranch]
  )

  // Select bank
  const selectBank = (bank: BankItem) => {
    setSelectedBank(bank)
    setBankQuery(bank.normalize?.name || bank.name)
    setShowBankDropdown(false)
    setSelectedBranch(null)
    setBranchQuery('')
    setUserCleared(false) // 新しい銀行を選択したのでフラグリセット
  }

  // Select branch
  const selectBranch = (branch: BranchItem) => {
    setSelectedBranch(branch)
    setBranchQuery(branch.name)
    setShowBranchDropdown(false)
    if (selectedBank) {
      onChange({
        bankName: selectedBank.normalize?.name || selectedBank.name,
        bankCode: selectedBank.code,
        branchName: branch.name,
        branchCode: branch.code,
      })
    }
  }

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bankRef.current && !bankRef.current.contains(e.target as Node)) {
        setShowBankDropdown(false)
      }
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) {
        setShowBranchDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const inputClass =
    'w-full px-4 py-3.5 bg-white/50 backdrop-blur-lg rounded-2xl border border-gray-300/70 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-red-400/70 focus:ring-2 focus:ring-red-200/40 focus:bg-white/60 transition-all disabled:opacity-50'

  const dropdownClass =
    'absolute z-50 mt-1 w-full max-h-52 overflow-y-auto bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-lg shadow-black/5'

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Bank search */}
      <div ref={bankRef} className="relative">
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">
          銀行名
        </label>
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-red-300/40 to-rose-300/40 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
          <div className="relative">
            <input
              type="text"
              className={inputClass}
              placeholder="銀行名を入力して検索"
              value={bankQuery}
              onChange={e => handleBankQueryChange(e.target.value)}
              onFocus={() => {
                if (bankQuery.trim() && !selectedBank) setShowBankDropdown(true)
              }}
            />
            {loadingBanks && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
          </div>
        </div>
        {showBankDropdown && bankQuery.trim() && !selectedBank && (
          <div className={dropdownClass}>
            {loadingBanks ? (
              <div className="px-4 py-3 text-sm text-gray-400">検索中...</div>
            ) : filteredBanks.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-400">該当なし</div>
            ) : (
              filteredBanks.map(bank => (
                <button
                  key={bank.code}
                  type="button"
                  onClick={() => selectBank(bank)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-red-50/60 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                >
                  <span className="font-medium">{bank.normalize?.name || bank.name}</span>
                  <span className="ml-2 text-xs text-gray-400">({bank.code})</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Branch search */}
      <div ref={branchRef} className="relative">
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">
          支店名
        </label>
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-red-300/40 to-rose-300/40 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
          <div className="relative">
            <input
              type="text"
              className={inputClass}
              placeholder={selectedBank ? '支店名を入力して検索' : '先に銀行を選択'}
              value={branchQuery}
              disabled={!selectedBank}
              onChange={e => handleBranchQueryChange(e.target.value)}
              onFocus={() => {
                if (selectedBank && !selectedBranch) {
                  setShowBranchDropdown(true)
                  if (!branchQuery.trim()) {
                    setFilteredBranches(branches)
                  }
                }
              }}
            />
            {loadingBranches && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
          </div>
        </div>
        {showBranchDropdown && selectedBank && !selectedBranch && (
          <div className={dropdownClass}>
            {loadingBranches ? (
              <div className="px-4 py-3 text-sm text-gray-400">検索中...</div>
            ) : filteredBranches.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-400">該当なし</div>
            ) : (
              filteredBranches.map(branch => (
                <button
                  key={branch.code}
                  type="button"
                  onClick={() => selectBranch(branch)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-red-50/60 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                >
                  <span className="font-medium">{branch.name}</span>
                  <span className="ml-2 text-xs text-gray-400">({branch.code})</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
