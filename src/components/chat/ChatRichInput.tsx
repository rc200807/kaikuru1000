'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Mention from '@tiptap/extension-mention'
import type { SuggestionOptions, SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChatAvatar from './ChatAvatar'
import type { Participant } from './types'

type MentionUi = {
  open: boolean
  items: Participant[]
  index: number
  rect: DOMRect | null
}

export default function ChatRichInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'メッセージを入力…',
  participants = [],
  accent,
  autoFocus = false,
  minHeight = 40,
}: {
  value: string
  onChange: (html: string) => void
  onSubmit: () => void
  placeholder?: string
  participants?: Participant[]
  accent: string
  autoFocus?: boolean
  minHeight?: number
}) {
  const [mention, setMention] = useState<MentionUi>({ open: false, items: [], index: 0, rect: null })

  // suggestion コールバック（エディタ生成時に1度だけ構築）から最新値へアクセスするための ref 群
  const participantsRef = useRef(participants)
  participantsRef.current = participants
  const onSubmitRef = useRef(onSubmit)
  onSubmitRef.current = onSubmit
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const editorRef = useRef<Editor | null>(null)

  // メンションポップアップの命令的API（suggestion.render から呼ぶ）
  const itemsRef = useRef<Participant[]>([])
  const indexRef = useRef(0)
  const commandRef = useRef<((p: Participant) => void) | null>(null)
  const openRef = useRef(false)
  const popup = useRef({
    show: (items: Participant[], rect: DOMRect | null, command: (p: Participant) => void) => {
      itemsRef.current = items
      indexRef.current = 0
      commandRef.current = command
      openRef.current = items.length > 0
      setMention({ open: items.length > 0, items, index: 0, rect })
    },
    update: (items: Participant[], rect: DOMRect | null, command: (p: Participant) => void) => {
      itemsRef.current = items
      commandRef.current = command
      indexRef.current = Math.min(indexRef.current, Math.max(0, items.length - 1))
      openRef.current = items.length > 0
      setMention({ open: items.length > 0, items, index: indexRef.current, rect })
    },
    hide: () => {
      openRef.current = false
      setMention((m) => ({ ...m, open: false }))
    },
    move: (dir: 1 | -1) => {
      const n = itemsRef.current.length
      if (!n) return
      indexRef.current = (indexRef.current + dir + n) % n
      setMention((m) => ({ ...m, index: indexRef.current }))
    },
    select: (): boolean => {
      const it = itemsRef.current[indexRef.current]
      if (it && commandRef.current) {
        commandRef.current(it)
        return true
      }
      return false
    },
  })

  const suggestion = useMemo<Omit<SuggestionOptions<Participant>, 'editor'>>(
    () => ({
      char: '@',
      items: ({ query }) => {
        const q = query.trim().toLowerCase()
        const list = participantsRef.current
        const filtered = q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list
        return filtered.slice(0, 8)
      },
      command: ({ editor, range, props }) => {
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: 'mention', attrs: { id: (props as { id: string }).id, label: (props as { label: string }).label } },
            { type: 'text', text: ' ' },
          ])
          .run()
      },
      render: () => ({
        onStart: (props: SuggestionProps<Participant>) => {
          popup.current.show(props.items, props.clientRect?.() ?? null, (item) =>
            props.command({ id: `${item.type}:${item.id}`, label: item.name } as unknown as Participant),
          )
        },
        onUpdate: (props: SuggestionProps<Participant>) => {
          popup.current.update(props.items, props.clientRect?.() ?? null, (item) =>
            props.command({ id: `${item.type}:${item.id}`, label: item.name } as unknown as Participant),
          )
        },
        onKeyDown: (props: SuggestionKeyDownProps): boolean => {
          const key = props.event.key
          if (key === 'ArrowUp') { popup.current.move(-1); return true }
          if (key === 'ArrowDown') { popup.current.move(1); return true }
          if (key === 'Enter' || key === 'Tab') { return popup.current.select() }
          if (key === 'Escape') { popup.current.hide(); return true }
          return false
        },
        onExit: () => popup.current.hide(),
      }),
    }),
    [],
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // StarterKit v3 には Underline / Link が同梱されるため個別追加はしない（重複回避）
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { class: 'chat-link' },
        },
      }),
      Placeholder.configure({ placeholder }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion,
      }),
    ],
    content: value || '',
    autofocus: autoFocus,
    onUpdate: ({ editor }) => onChangeRef.current(editor.getHTML()),
    editorProps: {
      attributes: { class: 'chat-tiptap' },
      handleKeyDown(_view, event) {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          // メンション候補が開いているときは suggestion 側に委ねる
          if (openRef.current) return false
          const ed = editorRef.current
          // リスト/引用/コードブロック内は改行・項目追加を優先（送信しない）
          if (ed && (ed.isActive('listItem') || ed.isActive('blockquote') || ed.isActive('codeBlock'))) {
            return false
          }
          event.preventDefault()
          onSubmitRef.current()
          return true
        }
        return false
      },
    },
  })

  editorRef.current = editor

  // 親からの value 変更（送信後クリア等）をエディタへ反映（自分の onUpdate 由来は一致するのでスキップ）
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if ((value || '') !== current) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
  }, [value, editor])

  const toggleLink = useCallback(() => {
    if (!editor) return
    if (editor.isActive('link')) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    const prev = editor.getAttributes('link')?.href as string | undefined
    const url = window.prompt('リンクURLを入力してください', prev || 'https://')
    if (url === null) return
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }, [editor])

  if (!editor) return null

  return (
    <div style={{ position: 'relative' }}>
      {/* Slack風ツールバー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          padding: '4px 6px',
          borderBottom: '1px solid var(--md-sys-color-outline-variant)',
        }}
      >
        <TbBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="太字">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" /></svg>
        </TbBtn>
        <TbBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="斜体">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" /></svg>
        </TbBtn>
        <TbBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="下線">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z" /></svg>
        </TbBtn>
        <TbBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="取り消し線">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z" /></svg>
        </TbBtn>

        <Divider />

        <TbBtn active={editor.isActive('link')} onClick={toggleLink} title="リンク">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" /></svg>
        </TbBtn>

        <Divider />

        <TbBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="箇条書き">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" /></svg>
        </TbBtn>
        <TbBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="番号付きリスト">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" /></svg>
        </TbBtn>
        <TbBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="引用">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" /></svg>
        </TbBtn>
        <TbBtn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="コード">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" /></svg>
        </TbBtn>
        <TbBtn active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="コードブロック">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 9l-2 3 2 3M16 9l2 3-2 3" /></svg>
        </TbBtn>
      </div>

      {/* 編集領域 */}
      <div
        style={{
          maxHeight: 200,
          overflowY: 'auto',
          padding: '8px 12px',
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* メンション候補ポップアップ（キャレット直上に表示） */}
      {mention.open && mention.rect && mention.items.length > 0 && (
        <div
          role="listbox"
          style={{
            position: 'fixed',
            left: Math.max(8, mention.rect.left),
            bottom: Math.max(8, window.innerHeight - mention.rect.top + 6),
            zIndex: 1000,
            minWidth: 220,
            maxWidth: 320,
            maxHeight: 260,
            overflowY: 'auto',
            padding: 6,
            borderRadius: 12,
            background: 'var(--md-sys-color-surface-container-highest)',
            border: '1px solid var(--md-sys-color-outline-variant)',
            boxShadow: '0 8px 28px rgba(0,0,0,0.28)',
          }}
        >
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--md-sys-color-on-surface-variant)', padding: '2px 8px 4px' }}>
            メンション
          </div>
          {mention.items.map((it, i) => (
            <button
              key={`${it.type}:${it.id}`}
              type="button"
              role="option"
              aria-selected={i === mention.index}
              onMouseDown={(e) => {
                e.preventDefault()
                commandRef.current?.(it)
              }}
              onMouseEnter={() => { indexRef.current = i; setMention((m) => ({ ...m, index: i })) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                borderRadius: 8,
                cursor: 'pointer',
                background: i === mention.index ? `color-mix(in srgb, ${accent} 16%, transparent)` : 'transparent',
              }}
            >
              <ChatAvatar name={it.name} authorType={it.type} accent={accent} avatarUrl={it.avatar} size={26} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--md-sys-color-on-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {it.name}
              </span>
              {it.type === 'admin' && (
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: accent, color: '#fff', flexShrink: 0 }}>本部</span>
              )}
            </button>
          ))}
        </div>
      )}

      <style jsx global>{`
        .chat-tiptap {
          outline: none;
          min-height: ${minHeight}px;
          color: var(--md-sys-color-on-surface);
          font-size: 14px;
          line-height: 1.5;
          word-break: break-word;
        }
        .chat-tiptap p { margin: 0.15rem 0; }
        .chat-tiptap p:first-child { margin-top: 0; }
        .chat-tiptap p:last-child { margin-bottom: 0; }
        .chat-tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--md-sys-color-on-surface-variant);
          opacity: 0.7;
          pointer-events: none;
          height: 0;
        }
        .chat-tiptap ul, .chat-tiptap ol { padding-left: 1.4rem; margin: 0.3rem 0; }
        .chat-tiptap ul { list-style: disc; }
        .chat-tiptap ol { list-style: decimal; }
        .chat-tiptap li { margin: 0.1rem 0; }
        .chat-tiptap li p { margin: 0; }
        .chat-tiptap blockquote {
          border-left: 3px solid var(--md-sys-color-outline);
          padding-left: 0.75rem;
          margin: 0.35rem 0;
          color: var(--md-sys-color-on-surface-variant);
        }
        .chat-tiptap code {
          background: var(--md-sys-color-surface-container-high);
          border-radius: 4px;
          padding: 0.1em 0.35em;
          font-size: 0.9em;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .chat-tiptap pre {
          background: var(--md-sys-color-surface-container-high);
          border-radius: 8px;
          padding: 0.6rem 0.8rem;
          margin: 0.35rem 0;
          overflow-x: auto;
        }
        .chat-tiptap pre code { background: none; padding: 0; }
        .chat-tiptap a.chat-link { color: #3b82f6; text-decoration: underline; cursor: pointer; }
        .chat-tiptap .mention {
          background: color-mix(in srgb, ${accent} 18%, transparent);
          color: ${accent};
          font-weight: 600;
          border-radius: 5px;
          padding: 0 3px;
          box-decoration-break: clone;
        }
      `}</style>
    </div>
  )
}

function TbBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="chat-icon-btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        borderRadius: 7,
        cursor: 'pointer',
        color: active ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)',
        background: active ? 'var(--md-sys-color-secondary-container)' : 'transparent',
      }}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span style={{ width: 1, height: 18, background: 'var(--md-sys-color-outline-variant)', margin: '0 4px' }} />
}
