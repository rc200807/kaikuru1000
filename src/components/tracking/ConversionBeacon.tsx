'use client'

// 完了画面（フォームのthanksページ / 問い合わせの受付完了画面）に置くと、
// 表示された時点で1回だけCVを計測サーバーへ送る。冪等なので二重計上されない。
import { useEffect } from 'react'
import { sendConversionBeacon } from '@/lib/track-conversion'

export default function ConversionBeacon({
  formSubmissionId,
  inquiryId,
}: {
  formSubmissionId?: string
  inquiryId?: string
}) {
  useEffect(() => {
    sendConversionBeacon({ formSubmissionId, inquiryId })
  }, [formSubmissionId, inquiryId])
  return null
}
