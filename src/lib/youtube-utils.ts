/**
 * YouTube URL からビデオIDを抽出する
 * 対応形式:
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *   https://youtube.com/watch?v=VIDEO_ID
 *   https://youtu.be/VIDEO_ID
 *   https://www.youtube.com/embed/VIDEO_ID
 *   https://www.youtube.com/shorts/VIDEO_ID
 *   https://www.youtube.com/live/VIDEO_ID
 *   https://m.youtube.com/watch?v=VIDEO_ID
 */
export function extractYoutubeVideoId(url: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url)

    // youtu.be/VIDEO_ID
    if (u.hostname === 'youtu.be' || u.hostname === 'www.youtu.be') {
      const id = u.pathname.slice(1).split('/')[0]
      return id || null
    }

    // youtube.com 系
    if (u.hostname.includes('youtube.com')) {
      // /watch?v=VIDEO_ID
      const v = u.searchParams.get('v')
      if (v) return v

      // /embed/VIDEO_ID, /shorts/VIDEO_ID, /live/VIDEO_ID
      const pathMatch = u.pathname.match(/^\/(embed|shorts|live|v)\/([^/?]+)/)
      if (pathMatch) return pathMatch[2]
    }

    return null
  } catch {
    return null
  }
}

/** YouTube動画の埋め込みURLを取得 */
export function getYoutubeEmbedUrl(url: string): string | null {
  const videoId = extractYoutubeVideoId(url)
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null
}

/** YouTube動画のサムネイルURLを取得 */
export function getYoutubeThumbnail(url: string, quality: 'default' | 'mqdefault' | 'hqdefault' | 'maxresdefault' = 'mqdefault'): string | null {
  const videoId = extractYoutubeVideoId(url)
  return videoId ? `https://img.youtube.com/vi/${videoId}/${quality}.jpg` : null
}
