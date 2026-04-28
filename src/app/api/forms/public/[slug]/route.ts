import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** 公開フォーム定義の取得（認証不要、status=published のみ） */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const form = await prisma.form.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      schema: true,
      status: true,
      successMessage: true,
      recaptchaEnabled: true,
    },
  })
  if (!form || form.status !== 'published') {
    return NextResponse.json({ error: 'このフォームは公開されていません' }, { status: 404 })
  }
  return NextResponse.json(form)
}
