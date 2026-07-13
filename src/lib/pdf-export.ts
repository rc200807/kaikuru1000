// 要素をA4複数ページのPDFに変換する共通ユーティリティ。
//
// 従来は「ページ全体を1枚の巨大canvasにして固定高さで機械スライス」していたため、
// 行やテーブルの途中でページが分割され文字が切れていた。
// ここでは DOM のブロック境界（カード/テーブル/セクション）で改ページするため、
// ブロックがページに収まらない場合だけ新ページへ送り、文字の途中では切らない。

export type PdfMode = 'save' | 'base64'

/**
 * 指定要素をA4 PDF化する。
 * @returns mode='base64' のとき data URI の base64 部分、mode='save' のとき null
 */
export async function elementToPdf(
  root: HTMLElement,
  opts: { mode: PdfMode; filename?: string }
): Promise<string | null> {
  const { default: jsPDF } = await import('jspdf')
  const { default: html2canvas } = await import('html2canvas-pro')
  try { await (document as any).fonts?.ready } catch { /* ignore */ }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 10
  const contentWidth = pageWidth - margin * 2      // mm
  const contentHeight = pageHeight - margin * 2     // mm
  const gap = 2                                     // ブロック間の余白(mm)

  // ルートの実描画幅(CSS px)を基準に、1ページに収まる最大ブロック高さ(CSS px)を算出
  const rootWidthCss = root.getBoundingClientRect().width || 1
  const cssPerMm = rootWidthCss / contentWidth
  const maxBlockCss = contentHeight * cssPerMm

  // ページ境界で分割してよいブロック群を収集（大きすぎる要素は子へ再帰）
  const blocks = collectBlocks(root, maxBlockCss)

  let cursorY = margin
  let hasContent = false

  const render = async (el: HTMLElement) => {
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
    if (canvas.width === 0 || canvas.height === 0) return
    const imgW = contentWidth
    const imgH = (canvas.height * imgW) / canvas.width

    if (imgH <= contentHeight) {
      // 1ページに収まる → はみ出すなら改ページしてから丸ごと配置（分断しない）
      if (hasContent && cursorY + imgH > margin + contentHeight) {
        pdf.addPage()
        cursorY = margin
      }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, cursorY, imgW, imgH)
      cursorY += imgH + gap
      hasContent = true
    } else {
      // 単一要素がページより高い（これ以上分割できない）→ この要素だけ従来同様スライス
      if (hasContent) { pdf.addPage(); cursorY = margin }
      let remaining = imgH
      let sourceY = 0
      let lastPrintH = 0
      while (remaining > 0) {
        const printH = Math.min(remaining, contentHeight)
        const sourceH = (printH / imgH) * canvas.height
        const pageCanvas = document.createElement('canvas')
        pageCanvas.width = canvas.width
        pageCanvas.height = sourceH
        const ctx = pageCanvas.getContext('2d')!
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceH, 0, 0, canvas.width, sourceH)
        pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, imgW, printH)
        remaining -= printH
        sourceY += sourceH
        lastPrintH = printH
        if (remaining > 0) pdf.addPage()
      }
      cursorY = margin + lastPrintH + gap
      hasContent = true
    }
  }

  for (const block of blocks) await render(block)

  if (opts.mode === 'save') {
    pdf.save(opts.filename || 'document.pdf')
    return null
  }
  return pdf.output('datauristring').split(',')[1]
}

/**
 * ページに収まる粒度までブロックを収集する。
 * 要素がページ最大高さを超え、かつ子要素を持つ場合は子へ再帰し、
 * 収まる or これ以上分割できない（子なし）ところで確定する。
 */
function collectBlocks(el: HTMLElement, maxCssHeight: number): HTMLElement[] {
  const height = el.getBoundingClientRect().height
  if (height <= maxCssHeight) return [el]
  const children = Array.from(el.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement
  )
  if (children.length === 0) return [el] // 分割不能 → スライスにフォールバック
  const out: HTMLElement[] = []
  for (const c of children) out.push(...collectBlocks(c, maxCssHeight))
  return out
}
