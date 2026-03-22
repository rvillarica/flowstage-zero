export interface Aesthetic {
  id: string
  name: string
  description?: string
  thumbnail?: string
  created_at: string
}

export interface AestheticDetail {
  id: string
  name: string
  description?: string
  thumbnail?: string
  created_at: string
  video_preset_names: string[]
  slideshow_preset_names: string[]
  videos: Video[]
  audios: Audio[]
  hooks: Hook[]
}

export interface Video {
  id: string
  name: string
  url: string
  thumbnail?: string
  duration: number
  created_at: string
}

export interface Audio {
  id: string
  name: string
  url: string
  duration: number
  created_at: string
  sections: AudioSection[]
}

export interface AudioSection {
  id: string
  name: string
  start_time: number
  end_time: number
}

export interface Hook {
  id: string
  text: string
  created_at: string
}

export interface VideoEdit {
  id: string
  status: string
  render_status: string
  render_progress: number
  render_url: string | null
  duration: number
  created_at: string
}

export interface RenderProgress {
  edit_id: string
  status: 'pending' | 'processing' | 'done' | 'error'
  progress: number
  url: string | null
  message: string
  error: string | null
}

export interface CreateEditRequest {
  aesthetic_id: string
  audio_id: string
  section_start_time: number
  section_end_time: number
  preset_name?: string
  hook?: string
  name?: string
  render?: boolean
  videos?: Array<{
    video_id: string
    start_time: number
    end_time: number
  }>
  is_flipbook?: boolean
}

export interface UsageLimits {
  periodStart: string
  periodEnd: string
  limits: {
    posts_per_month: number
    audios_uploaded_per_month: number
    video_edits_per_month: number
    slideshow_edits_per_month: number
  }
  usage: {
    posts_per_month: number
    audios_uploaded_per_month: number
    video_edits_per_month: number
    slideshow_edits_per_month: number
  }
}

export interface AestheticSummary {
  id: string
  name: string
  description?: string
  thumbnail?: string
  created_at: string
  video_count: number
  audio_count: number
  photo_count: number
  hook_count: number
  video_preset_names: string[]
  slideshow_preset_names: string[]
  video_thumbnails: string[]
}
