// 会話録音の音声形式（Content-Type）の正規化。クライアント・サーバー共通。
//
// MediaRecorder の mimeType は "audio/webm;codecs=opus" のように codecs 付きになる。
// Vercel Blob の allowedContentTypes は付加情報まで含めて照合するため、そのままだと
// 許可リストに一致せずアップロードが拒否される。保存・解析には本体の型だけを使う。

export const ALLOWED_AUDIO_TYPES = [
  'audio/*',
  // 端末によっては音声だけの録音・ファイルでも video/* と報告される
  'video/webm', 'video/mp4', 'video/quicktime',
]

export function normalizeAudioContentType(type: string | null | undefined, fileName?: string | null): string {
  const base = (type ?? '').split(';')[0].trim().toLowerCase()
  if (base) return base
  const ext = (fileName?.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? '').toLowerCase()
  switch (ext) {
    case 'webm': return 'audio/webm'
    case 'ogg': case 'oga': return 'audio/ogg'
    case 'wav': return 'audio/wav'
    case 'mp3': return 'audio/mpeg'
    case 'aac': return 'audio/aac'
    case 'm4a': case 'mp4': return 'audio/mp4'
    default: return 'audio/mp4'
  }
}
