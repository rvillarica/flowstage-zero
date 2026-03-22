import type {
  Aesthetic,
  AestheticDetail,
  AestheticSummary,
  VideoEdit,
  CreateEditRequest,
  RenderProgress,
  UsageLimits,
} from './types'
import { FLOWSTAGE_API_URL } from '../config'

const BASE_URL = FLOWSTAGE_API_URL

export class FlowstageAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public detail?: string
  ) {
    super(message)
    this.name = 'FlowstageAPIError'
  }

  get isRevoked(): boolean {
    return this.statusCode === 401 && this.detail === 'API key has been revoked'
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401
  }
}

export class FlowstageClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const detail = body?.detail || body?.message || res.statusText
      throw new FlowstageAPIError(detail, res.status, body?.detail)
    }

    if (res.status === 204) {
      return undefined as T
    }

    return res.json()
  }

  async listAesthetics(): Promise<Aesthetic[]> {
    const data = await this.request<{ aesthetics: Aesthetic[] }>('/v1/aesthetics')
    return data.aesthetics
  }

  async getAestheticsSummary(): Promise<AestheticSummary[]> {
    const data = await this.request<{ aesthetics: AestheticSummary[] }>('/v1/aesthetics/summary')
    return data.aesthetics
  }

  async getAesthetic(aestheticId: string): Promise<AestheticDetail> {
    return this.request<AestheticDetail>(`/v1/aesthetics/${aestheticId}`)
  }

  async createVideoEdit(config: CreateEditRequest): Promise<{ video_edit_id: string; status: string; message: string }> {
    return this.request<{ video_edit_id: string; status: string; message: string }>('/v1/video-edits/draft', {
      method: 'POST',
      body: JSON.stringify(config),
    })
  }

  async getVideoEdit(editId: string): Promise<VideoEdit> {
    return this.request<VideoEdit>(`/v1/video-edits/${editId}`)
  }

  async getRenderProgress(editId: string): Promise<RenderProgress> {
    return this.request<RenderProgress>(`/v1/video-edits/${editId}/progress`)
  }

  async getLimits(): Promise<UsageLimits> {
    return this.request<UsageLimits>('/v1/limits')
  }
}
