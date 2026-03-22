import { useState, useEffect, useRef, useCallback } from 'react'
import { LogOut, Play, Loader2, ChevronDown, Shuffle, CheckCircle2, Circle, Film, ChevronLeft, ChevronRight, HelpCircle, X, Plus, Download, RefreshCw, Info } from 'lucide-react'
import { FlowstageClient, FlowstageAPIError } from '../api/flowstage'
import { useSearchParams } from 'react-router-dom'
import useEmblaCarousel from 'embla-carousel-react'
import type { Aesthetic, AestheticSummary } from '../api/types'
import type { Profile } from '../utils/profiles'
import { loadProfiles, saveProfiles } from '../utils/profiles'
import {
  FLOWSTAGE_AUTH_URL,
  SECURITY_CONFIG,
  isValidApiKeyFormat,
  isAllowedOrigin,
  sanitizeApiKey
} from '../config'
import AboutDialog from '../components/AboutDialog'

interface DashboardProps {
  apiKey: string
  activeProfile: Profile
  onSignOut: () => void
  onSetApiKey: (newApiKey: string) => void
}

type EditStatus = 'idle' | 'creating' | 'rendering' | 'done' | 'error'

export default function Dashboard({ apiKey, activeProfile, onSignOut, onSetApiKey }: DashboardProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedAestheticId, setSelectedAestheticId] = useState<string | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [hookText, setHookText] = useState('')
  const [createdEditId, setCreatedEditId] = useState<string | null>(searchParams.get('edit_id'))

  // Manual state management (no TanStack Query)
  const [aesthetics, setAesthetics] = useState<Aesthetic[]>([])
  const [loadingAesthetics, setLoadingAesthetics] = useState(true)
  const [aestheticsSummaries, setAestheticsSummaries] = useState<Record<string, AestheticSummary>>({})
  const [aesthetic, setAesthetic] = useState<any>(null)
  const [loadingAesthetic, setLoadingAesthetic] = useState(false)
  const [limits, setLimits] = useState<any>(null)
  const [loadingLimits, setLoadingLimits] = useState(true)
  const [apiKeyRevoked, setApiKeyRevoked] = useState(false)

  // Carousel state
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'start',
    containScroll: 'trimSnaps',
    dragFree: true,
  })
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  // Video edit creation state
  const [editStatus, setEditStatus] = useState<EditStatus>('idle')
  const [renderProgress, setRenderProgress] = useState(0)
  const [animatedProgress, setAnimatedProgress] = useState(0)
  const [renderUrl, setRenderUrl] = useState<string | null>(null)
  const [videoEdit, setVideoEdit] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingExistingEdit, setLoadingExistingEdit] = useState(false)

  // Help popup states
  const [showPresetsHelp, setShowPresetsHelp] = useState(false)
  const [showAudioHelp, setShowAudioHelp] = useState(false)
  const [showSectionsHelp, setShowSectionsHelp] = useState(false)
  const [showAestheticHelp, setShowAestheticHelp] = useState(false)
  const [showAbout, setShowAbout] = useState(false)

  const abortRef = useRef(false)
  const hasLoadedEditFromUrl = useRef(false)
  const clientRef = useRef(new FlowstageClient(apiKey))

  // Update client when API key changes
  useEffect(() => {
    clientRef.current = new FlowstageClient(apiKey)
  }, [apiKey])

  // Animate progress bar from 0 when status changes
  useEffect(() => {
    if (editStatus === 'creating') {
      // Start at 0, then animate to 33%
      setAnimatedProgress(0)
      const timer = setTimeout(() => setAnimatedProgress(33), 50)
      return () => clearTimeout(timer)
    } else if (editStatus === 'rendering') {
      // Animate from 33% to the actual render progress
      setAnimatedProgress(33 + (renderProgress * 67))
    } else if (editStatus === 'idle' || editStatus === 'done' || editStatus === 'error') {
      setAnimatedProgress(0)
    }
  }, [editStatus, renderProgress])

  // Update embla scroll buttons
  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setCanScrollPrev(emblaApi.canScrollPrev())
    setCanScrollNext(emblaApi.canScrollNext())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    onSelect()
    emblaApi.on('select', onSelect)
    emblaApi.on('reInit', onSelect)
  }, [emblaApi, onSelect])

  // Update URL when edit ID changes
  useEffect(() => {
    if (createdEditId) {
      setSearchParams({ edit_id: createdEditId })
    } else {
      setSearchParams({})
    }
  }, [createdEditId, setSearchParams])

  // Load edit from URL param on mount
  useEffect(() => {
    const editIdFromUrl = searchParams.get('edit_id')
    if (editIdFromUrl && !hasLoadedEditFromUrl.current) {
      hasLoadedEditFromUrl.current = true
      loadEditFromUrl(editIdFromUrl)
    }
  }, [])

  const loadEditFromUrl = async (editId: string) => {
    setLoadingExistingEdit(true)
    setCreatedEditId(editId)

    try {
      // First check progress
      const progress = await clientRef.current.getRenderProgress(editId)
      setRenderProgress(progress.progress)

      if (progress.status === 'done') {
        // Already done, fetch full details
        setRenderUrl(progress.url)
        setEditStatus('done')
        const edit = await clientRef.current.getVideoEdit(editId)
        setVideoEdit(edit)
      } else if (progress.status === 'error') {
        setError(progress.error ?? 'Render failed')
        setEditStatus('error')
      } else if (progress.status === 'pending' || progress.status === 'processing') {
        // Still processing, resume polling
        setEditStatus('rendering')
        await pollRender(editId)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load edit')
      setEditStatus('error')
    } finally {
      setLoadingExistingEdit(false)
    }
  }

  // Fetch limits on mount (aesthetics are loaded by apiKey useEffect)
  useEffect(() => {
    const loadLimits = async () => {
      setLoadingLimits(true)
      try {
        const data = await clientRef.current.getLimits()
        setLimits(data)
      } catch (err) {
        console.error('Failed to load limits:', err)
        setLimits(null)
      } finally {
        setLoadingLimits(false)
      }
    }

    loadLimits()
  }, [])

  // Track if we should auto-randomize when aesthetic loads
  const shouldAutoRandomize = useRef(false)

  // Fetch aesthetic details when selected
  useEffect(() => {
    if (!selectedAestheticId) {
      setAesthetic(null)
      return
    }

    setLoadingAesthetic(true)
    shouldAutoRandomize.current = true
    clientRef.current.getAesthetic(selectedAestheticId)
      .then(data => setAesthetic(data))
      .catch(() => setAesthetic(null))
      .finally(() => setLoadingAesthetic(false))
  }, [selectedAestheticId])

  // Auto-randomize when aesthetic details are loaded
  useEffect(() => {
    if (!aesthetic || !shouldAutoRandomize.current) return
    shouldAutoRandomize.current = false

    // Randomize preset
    const presets = aesthetic.video_preset_names || []
    const randomPreset = presets.length > 0 ? presets[Math.floor(Math.random() * presets.length)] : null
    setSelectedPreset(randomPreset)

    // Randomize audio
    const audios = aesthetic.audios || []
    const randomAudio = audios.length > 0 ? audios[Math.floor(Math.random() * audios.length)] : null
    setSelectedAudioId(randomAudio?.id || null)

    // Randomize section from the selected audio
    const sections = randomAudio?.sections || []
    const randomSection = sections.length > 0 ? sections[Math.floor(Math.random() * sections.length)] : null
    setSelectedSectionId(randomSection?.id || null)

    // Randomize hook from aesthetic hooks if available
    const hooks = aesthetic.hooks || []
    const randomHook = hooks.length > 0 ? hooks[Math.floor(Math.random() * hooks.length)] : ''
    setHookText(randomHook?.text || randomHook || '')
  }, [aesthetic])

  const handleAestheticSelect = (aestheticId: string) => {
    setSelectedAestheticId(aestheticId)
    setCreatedEditId(null)
    setEditStatus('idle')
    setError(null)

    // Note: We still need to load the full aesthetic details for audios, sections, and hooks
    // The summary only gives us thumbnails and counts, not the actual data
    // Auto-randomization will happen after the full aesthetic loads in the useEffect
  }

  const handlePresetSelect = (presetName: string) => {
    setSelectedPreset(presetName)
    setCreatedEditId(null)
    setEditStatus('idle')
    setError(null)
  }

  const handleAudioSelect = (audioId: string) => {
    setSelectedAudioId(audioId)
    setSelectedSectionId(null)
    setCreatedEditId(null)
    setEditStatus('idle')
    setError(null)
  }

  const handleSectionSelect = (sectionId: string) => {
    setSelectedSectionId(sectionId)
    setCreatedEditId(null)
    setEditStatus('idle')
    setError(null)
  }

  // Manual polling function (exactly like tripflow-digital)
  const pollRender = useCallback(async (editId: string) => {
    for (let attempt = 0; attempt < 120 && !abortRef.current; attempt++) {
      await new Promise((r) => setTimeout(r, 2000)) // Poll every 2 seconds

      try {
        const progress = await clientRef.current.getRenderProgress(editId)
        setRenderProgress(progress.progress)

        if (progress.status === 'done') {
          setRenderUrl(progress.url)
          setEditStatus('done')

          // Fetch full video edit details
          const edit = await clientRef.current.getVideoEdit(editId)
          setVideoEdit(edit)

          // Optimistically decrement the remaining edits count
          if (limits) {
            setLimits({
              ...limits,
              usage: {
                ...limits.usage,
                video_edits_per_month: (limits.usage.video_edits_per_month ?? 0) + 1
              }
            })
          }

          return true
        }

        if (progress.status === 'error') {
          setError(progress.error ?? 'Render failed')
          setEditStatus('error')
          return false
        }
      } catch (err) {
        // transient error, keep polling
      }
    }

    // Timeout
    if (!abortRef.current) {
      setError('Render timeout')
      setEditStatus('error')
    }
    return false
  }, [])

  const handleCreateEdit = useCallback(async () => {
    if (!selectedAestheticId || !selectedPreset || !selectedAudioId || !selectedSectionId) {
      setError('Please select aesthetic, preset, audio, and section')
      return
    }

    // Find the selected audio and section
    const audio = aesthetic?.audios.find((a: any) => a.id === selectedAudioId)
    const section = audio?.sections.find((s: any) => s.id === selectedSectionId)

    if (!section) {
      setError('Section not found')
      return
    }

    // Reset state
    abortRef.current = false
    setError(null)
    setRenderProgress(0)
    setRenderUrl(null)
    setVideoEdit(null)

    // PHASE 1: Create draft
    setEditStatus('creating')

    try {
      const result = await clientRef.current.createVideoEdit({
        aesthetic_id: selectedAestheticId,
        audio_id: selectedAudioId,
        section_start_time: section.start_time,
        section_end_time: section.end_time,
        preset_name: selectedPreset,
        hook: hookText.trim() || ' ',  // Pass space string if empty
      })

      setCreatedEditId(result.video_edit_id)

      // PHASE 2: Poll render progress
      setEditStatus('rendering')
      await pollRender(result.video_edit_id)

    } catch (err: any) {
      setError(err.message)
      setEditStatus('error')
    }
  }, [
    selectedAestheticId,
    selectedPreset,
    selectedAudioId,
    selectedSectionId,
    hookText,
    aesthetic,
    pollRender
  ])

  // Randomize functions
  const randomizeAudio = () => {
    const audios = aesthetic?.audios || []
    if (audios.length === 0) return
    const randomAudio = audios[Math.floor(Math.random() * audios.length)]
    setSelectedAudioId(randomAudio.id)
    setSelectedSectionId(null)
  }

  const randomizeSection = () => {
    const audio = aesthetic?.audios.find((a: any) => a.id === selectedAudioId)
    const sections = audio?.sections || []
    if (sections.length === 0) return
    const randomSection = sections[Math.floor(Math.random() * sections.length)]
    setSelectedSectionId(randomSection.id)
  }

  const rerollAll = () => {
    if (!aesthetic) return

    // Randomize preset
    const presets = aesthetic.video_preset_names || []
    const randomPreset = presets.length > 0 ? presets[Math.floor(Math.random() * presets.length)] : null
    setSelectedPreset(randomPreset)

    // Randomize audio
    const audios = aesthetic.audios || []
    const randomAudio = audios.length > 0 ? audios[Math.floor(Math.random() * audios.length)] : null
    setSelectedAudioId(randomAudio?.id || null)

    // Randomize section from the selected audio
    const sections = randomAudio?.sections || []
    const randomSection = sections.length > 0 ? sections[Math.floor(Math.random() * sections.length)] : null
    setSelectedSectionId(randomSection?.id || null)

    // Randomize hook from aesthetic hooks if available
    const hooks = aesthetic.hooks || []
    const randomHook = hooks.length > 0 ? hooks[Math.floor(Math.random() * hooks.length)] : ''
    setHookText(randomHook?.text || randomHook || '')
  }

  // Listen for reconnection postMessage with enhanced security
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Security: Only accept messages from allowed origins
      if (!isAllowedOrigin(event.origin)) {
        if (event.data?.type && SECURITY_CONFIG.LOG_SECURITY_EVENTS) {
          console.warn('[Security] Rejected postMessage from unauthorized origin:', event.origin)
        }
        return
      }

      if (event.data?.type === 'FLOWSTAGE_AUTH_SUCCESS') {
        const { apiKey: newApiKey } = event.data

        if (!newApiKey) {
          console.error('[Auth] No API key provided in postMessage')
          return
        }

        // Security: Validate API key format
        if (!isValidApiKeyFormat(newApiKey)) {
          console.error('[Security] Invalid API key format received')
          setError('Received an invalid API key format. Please try again.')
          return
        }

        if (SECURITY_CONFIG.LOG_SECURITY_EVENTS) {
          console.log('[Auth] Valid API key received for reconnection:', sanitizeApiKey(newApiKey))
        }

        try {
          // Update the current active profile's API key
          const profiles = loadProfiles()
          const updatedProfiles = profiles.map(p =>
            p.name === activeProfile.name ? { ...p, apiKey: newApiKey } : p
          )
          saveProfiles(updatedProfiles)

          // Update the API key in parent component
          onSetApiKey(newApiKey)

          // Clear any auth errors
          setApiKeyRevoked(false)
          setError(null)

          console.log('[Auth] Reconnected successfully')
        } catch (err) {
          console.error('[Auth] Failed to update API key:', err)
          setError('Failed to update API key. Please try again.')
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [activeProfile.name, onSetApiKey])

  // Reload aesthetics when API key changes (e.g., after reconnection)
  useEffect(() => {
    const loadAesthetics = async () => {
      setLoadingAesthetics(true)
      setApiKeyRevoked(false)
      try {
        const summaries = await clientRef.current.getAestheticsSummary()

        const aestheticsList: Aesthetic[] = summaries.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          thumbnail: s.thumbnail,
          created_at: s.created_at,
        }))
        setAesthetics(aestheticsList)

        const summariesMap: Record<string, AestheticSummary> = {}
        summaries.forEach(summary => {
          summariesMap[summary.id] = summary
        })
        setAestheticsSummaries(summariesMap)
      } catch (err) {
        if (err instanceof FlowstageAPIError && err.isRevoked) {
          setApiKeyRevoked(true)
        }
        setAesthetics([])
      } finally {
        setLoadingAesthetics(false)
      }
    }

    loadAesthetics()
  }, [apiKey]) // Reload when apiKey changes

  const handleReauthorize = () => {
    const authUrl = `${FLOWSTAGE_AUTH_URL}?app=flowstage-zero`
    window.open(authUrl, '_blank', 'width=600,height=700')
  }

  const selectedAesthetic = aesthetics.find(a => a.id === selectedAestheticId)

  // Calculate remaining video edits
  const remainingEdits = limits
    ? Math.max(0, (limits.limits.video_edits_per_month ?? 0) - (limits.usage.video_edits_per_month ?? 0))
    : null

  const isOverLimit = remainingEdits !== null && remainingEdits === 0

  return (
    <div className="min-h-screen bg-black text-white animate-[fadeIn_0.3s_ease-out]">
      {/* Fixed gradients */}
      <div className="fixed top-0 left-0 right-0 h-20 bg-gradient-to-b from-black to-transparent pointer-events-none z-40" />
      <div className="fixed bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black to-transparent pointer-events-none z-40" />

      {/* Header */}
      <header className="relative z-50 bg-black/80 backdrop-blur-md border-b border-gray-800 sticky top-0">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <a
            href="https://theflowstage.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img src="/flowstage-logo.svg" alt="Flowstage" className="h-6 w-auto" style={{ filter: 'invert(1)' }} />
            <h1 className="text-md font-light text-white font-serif">
              z e r o .
            </h1>
          </a>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowAbout(true)}
              className="p-2 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-all"
              title="About Flowstage Zero"
            >
              <Info className="w-5 h-5" />
            </button>
            <button
              onClick={onSignOut}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Aesthetic Carousel */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">Select aesthetic</h2>
              <button
                onClick={() => setShowAestheticHelp(true)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs text-purple-300 bg-purple-900/30 border border-purple-700/50 rounded-lg hover:bg-purple-900/50 hover:border-purple-600 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Make your own</span>
              </button>
            </div>
            {!loadingAesthetics && aesthetics.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => emblaApi?.scrollPrev()}
                  disabled={!canScrollPrev}
                  className="p-2 rounded-lg bg-gray-800/50 border border-gray-700 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-5 h-5 text-white" />
                </button>
                <button
                  onClick={() => emblaApi?.scrollNext()}
                  disabled={!canScrollNext}
                  className="p-2 rounded-lg bg-gray-800/50 border border-gray-700 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-5 h-5 text-white" />
                </button>
              </div>
            )}
          </div>

          {loadingAesthetics ? (
            <div className="overflow-hidden py-2" ref={emblaRef}>
              <div className="flex gap-4 px-2">
                {/* Show 3-5 skeleton cards while loading */}
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="flex-[0_0_180px] animate-pulse"
                  >
                    <div className="bg-gradient-to-br from-gray-900/80 to-gray-900/40 backdrop-blur-md rounded-2xl border-2 border-gray-800/50 overflow-hidden">
                      {/* Skeleton thumbnail grid */}
                      <div className="aspect-square bg-gray-900">
                        <div className="grid grid-cols-2 grid-rows-2 h-full w-full">
                          {Array.from({ length: 4 }).map((_, j) => (
                            <div key={j} className="bg-gray-800 border border-gray-700/30">
                              <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-700/50" />
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Skeleton name */}
                      <div className="p-3 border-t border-gray-800">
                        <div className="h-4 bg-gray-700 rounded animate-pulse" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : aesthetics.length === 0 ? (
            apiKeyRevoked ? (
              <div className="bg-gradient-to-br from-gray-900/50 to-gray-900/20 rounded-3xl border-2 border-dashed border-gray-700 p-12 text-center">
                <RefreshCw className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-white mb-2">Authorization expired</h3>
                <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto">
                  Your connection to Flowstage has expired. Reconnect to continue creating videos.
                </p>
                <button
                  onClick={handleReauthorize}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-black hover:bg-gray-200 rounded-xl transition-all shadow-lg hover:shadow-xl font-medium"
                >
                  <RefreshCw className="w-5 h-5" />
                  <span>Reconnect</span>
                </button>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-gray-900/50 to-gray-900/20 rounded-3xl border-2 border-dashed border-gray-700 p-12 text-center">
                <Film className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No aesthetics available</p>
              </div>
            )
          ) : (
            <div className="overflow-hidden py-2" ref={emblaRef}>
              <div className="flex gap-4 px-2">
                {aesthetics.map((aes) => (
                  <div
                    key={aes.id}
                    onClick={() => handleAestheticSelect(aes.id)}
                    className={`flex-[0_0_180px] cursor-pointer transition-all duration-300 ${
                      selectedAestheticId === aes.id
                        ? 'scale-105'
                        : 'scale-100 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className={`bg-gradient-to-br from-gray-900/80 to-gray-900/40 backdrop-blur-md rounded-2xl border-2 overflow-hidden transition-all duration-300 ${
                      selectedAestheticId === aes.id
                        ? 'border-white/40 shadow-lg shadow-white/10'
                        : 'border-gray-800/50 hover:border-gray-700'
                    }`}>
                      {/* Thumbnail Grid - preloaded from summary endpoint - 2x2 grid */}
                      <div className="aspect-square bg-gray-900">
                        {aestheticsSummaries[aes.id]?.video_thumbnails ? (
                          <div className="grid grid-cols-2 grid-rows-2 h-full w-full">
                            {aestheticsSummaries[aes.id].video_thumbnails.slice(0, 4).map((thumbnail: string, i: number) => (
                              <div key={i} className="relative overflow-hidden bg-gray-800 border border-gray-700/30">
                                {thumbnail ? (
                                  <img
                                    src={thumbnail}
                                    alt="Video thumbnail"
                                    className="absolute inset-0 w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <Film className="w-6 h-6 text-gray-600" />
                                  </div>
                                )}
                              </div>
                            ))}
                            {/* Fill empty slots if less than 4 thumbnails */}
                            {Array.from({ length: Math.max(0, 4 - (aestheticsSummaries[aes.id].video_thumbnails?.length || 0)) }).map((_, i) => (
                              <div key={`empty-${i}`} className="bg-gray-900 border border-gray-700/30" />
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
                          </div>
                        )}
                      </div>

                      {/* Aesthetic Name Only */}
                      <div className="p-3 border-t border-gray-800">
                        <h3 className="font-semibold text-white text-sm text-center">{aes.name}</h3>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rest of the form - only show if aesthetic is selected */}
        {selectedAestheticId && (
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 transition-opacity duration-300 ${loadingAesthetic ? 'opacity-75' : 'opacity-100'}`}>
            {/* Left Column - Configuration Form */}
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-gray-900/80 to-gray-900/40 backdrop-blur-md rounded-3xl border border-gray-800/50 p-8">
                {loadingAesthetic ? (
                  /* Skeleton loader for the form while loading aesthetic details */
                  <div className="space-y-6">
                    <div className="flex items-center justify-between mb-6">
                      <div className="h-6 w-40 bg-gray-700 rounded animate-pulse" />
                      <div className="h-10 w-24 bg-gray-700 rounded-lg animate-pulse" />
                    </div>

                    {/* Skeleton for dropdown fields */}
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i}>
                        <div className="h-4 w-20 bg-gray-700 rounded mb-2 animate-pulse" />
                        <div className="h-12 w-full bg-gray-800 rounded-lg animate-pulse" />
                      </div>
                    ))}

                    {/* Skeleton for textarea */}
                    <div>
                      <div className="h-4 w-24 bg-gray-700 rounded mb-2 animate-pulse" />
                      <div className="h-32 w-full bg-gray-800 rounded-lg animate-pulse" />
                      <div className="h-3 w-32 bg-gray-700 rounded mt-2 animate-pulse" />
                    </div>
                  </div>
                ) : aesthetic ? (
                  <>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-lg font-semibold text-white">Configure edit</h2>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={rerollAll}
                          className="flex items-center gap-2 px-4 py-2 sm:px-4 sm:py-2 bg-gray-800/50 border border-gray-700 rounded-lg hover:bg-gray-800 transition-all text-sm text-white font-medium"
                          title="Reroll all"
                        >
                          <Shuffle className="w-4 h-4" />
                          <span className="hidden sm:inline">Reroll all</span>
                        </button>
                      </div>
                    </div>

                <div className="space-y-6">
                  {/* Preset Dropdown */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-300">
                        Preset
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPresetsHelp(true)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>How to manage presets</span>
                      </button>
                    </div>
                    <div className="relative">
                      <select
                        value={selectedPreset || ''}
                        onChange={(e) => handlePresetSelect(e.target.value)}
                        disabled={loadingAesthetic}
                        className="w-full px-4 py-3 pr-10 bg-gray-900 border border-gray-700 rounded-lg appearance-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all disabled:bg-gray-900/50 disabled:text-gray-500 text-white"
                      >
                        <option value="">
                          {loadingAesthetic ? 'Loading presets...' : 'Select a preset'}
                        </option>
                        {(aesthetic?.video_preset_names || []).map((presetName: any) => (
                          <option key={presetName} value={presetName}>
                            {presetName}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                    </div>
                    {selectedPreset && (
                      <button
                        onClick={() => {
                          randomizeAudio()
                          setTimeout(randomizeSection, 50)
                        }}
                        className="mt-2 flex items-center gap-2 text-sm text-white/70 hover:text-white font-medium transition-colors"
                      >
                        <Shuffle className="w-4 h-4" />
                        Randomize audio & section
                      </button>
                    )}
                  </div>

                  {/* Audio Dropdown */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-300">
                        Audio
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowAudioHelp(true)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>How to manage audio</span>
                      </button>
                    </div>
                    <div className="relative">
                      <select
                        value={selectedAudioId || ''}
                        onChange={(e) => handleAudioSelect(e.target.value)}
                        disabled={loadingAesthetic}
                        className="w-full px-4 py-3 pr-10 bg-gray-900 border border-gray-700 rounded-lg appearance-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all disabled:bg-gray-900/50 disabled:text-gray-500 text-white"
                      >
                        <option value="">
                          {loadingAesthetic ? 'Loading audio...' : 'Select audio'}
                        </option>
                        {(aesthetic?.audios || []).map((audio: any) => (
                          <option key={audio.id} value={audio.id}>
                            {audio.name} ({audio.duration.toFixed(1)}s)
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                    </div>
                    {selectedAudioId && (
                      <button
                        onClick={randomizeSection}
                        className="mt-2 flex items-center gap-2 text-sm text-white/70 hover:text-white font-medium transition-colors"
                      >
                        <Shuffle className="w-4 h-4" />
                        Randomize section
                      </button>
                    )}
                  </div>

                  {/* Section Dropdown */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-300">
                        Audio section
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowSectionsHelp(true)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>How to manage sections</span>
                      </button>
                    </div>
                    <div className="relative">
                      <select
                        value={selectedSectionId || ''}
                        onChange={(e) => handleSectionSelect(e.target.value)}
                        disabled={!selectedAudioId}
                        className="w-full px-4 py-3 pr-10 bg-gray-900 border border-gray-700 rounded-lg appearance-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all disabled:bg-gray-900/50 disabled:text-gray-500 text-white"
                      >
                        <option value="">
                          {!selectedAudioId ? 'Select audio first' : 'Select section'}
                        </option>
                        {(aesthetic?.audios.find((a: any) => a.id === selectedAudioId)?.sections || []).map((section: any) => (
                          <option key={section.id} value={section.id}>
                            {section.name} ({section.start_time.toFixed(1)}s - {section.end_time.toFixed(1)}s)
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                    </div>
                  </div>

                  {/* Hook Text Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Hook text <span className="text-gray-500 font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={hookText}
                      onChange={(e) => setHookText(e.target.value)}
                      placeholder="Enter your hook text here (leave blank for no hook)..."
                      rows={5}
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all resize-none text-white placeholder-gray-500"
                    />
                    <p className="mt-2 text-xs text-gray-500">
                      {hookText.length} characters
                    </p>
                    <div className="mt-3 bg-black/40 border border-gray-700/50 rounded-lg p-3">
                      <p className="text-xs text-gray-300">
                        <strong>Note:</strong> If your selected preset doesn't include a hook field in its configuration, the hook text will not be rendered in the final video, even if you enter text here.
                      </p>
                    </div>
                  </div>
                </div>
                  </>
                ) : (
                  /* Show message when aesthetic failed to load */
                  <div className="text-center py-12">
                    <p className="text-gray-400">Failed to load aesthetic details</p>
                    <button
                      onClick={() => setSelectedAestheticId(null)}
                      className="mt-4 text-sm text-white/70 hover:text-white"
                    >
                      Select another aesthetic
                    </button>
                  </div>
                )}
              </div>

              {/* Create button at bottom of LHS when video edit exists or is creating */}
              {(editStatus !== 'idle' || createdEditId) && aesthetic && (
                <button
                  onClick={handleCreateEdit}
                  disabled={loadingAesthetic || editStatus === 'creating' || editStatus === 'rendering' || !selectedPreset || !selectedAudioId || !selectedSectionId || isOverLimit}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-white text-black rounded-2xl hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-xl disabled:bg-gray-600 disabled:text-gray-400"
                >
                  {loadingAesthetic ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Loading aesthetic...</span>
                    </>
                  ) : (editStatus === 'creating' || editStatus === 'rendering') ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {editStatus === 'creating' ? 'Creating draft...' : 'Rendering...'}
                    </>
                  ) : isOverLimit ? (
                    <>
                      <Play className="w-5 h-5" />
                      <span>Monthly limit reached (0 remaining)</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      {remainingEdits !== null && remainingEdits < 10 ? (
                        <span>Create video edit ({remainingEdits} remaining this month)</span>
                      ) : (
                        <span>Create video edit</span>
                      )}
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Right Column - Video Preview */}
            <div className="space-y-6">
              {loadingExistingEdit ? (
                <div className="bg-gradient-to-br from-gray-900/80 to-gray-900/40 backdrop-blur-md rounded-3xl border border-gray-800/50 p-8 flex items-center justify-center min-h-[400px]">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">Loading video edit...</p>
                  </div>
                </div>
              ) : (editStatus !== 'idle' || createdEditId) ? (
                <div className="bg-gradient-to-br from-gray-900/80 to-gray-900/40 backdrop-blur-md rounded-3xl border border-gray-800/50 p-8 sticky top-24">
                  {/* Header with horizontal progress steps */}
                  <div className="flex items-center justify-center mb-6">
                    {/* Horizontal progress steps */}
                    <div className="flex items-center gap-3">
                      {/* Draft step */}
                      <div className="flex items-center gap-2">
                        {editStatus === 'creating' ? (
                          <Loader2 className="w-4 h-4 text-white animate-spin flex-shrink-0" />
                        ) : editStatus === 'rendering' || editStatus === 'done' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-gray-600 flex-shrink-0" />
                        )}
                        <span className={`text-xs ${editStatus === 'creating' ? 'text-white' : (editStatus === 'rendering' || editStatus === 'done') ? 'text-emerald-400' : 'text-gray-500'}`}>
                          Draft
                        </span>
                      </div>

                      {/* Separator */}
                      <div className="w-8 h-px bg-gray-700" />

                      {/* Render step */}
                      <div className="flex items-center gap-2">
                        {editStatus === 'rendering' ? (
                          <Loader2 className="w-4 h-4 text-white animate-spin flex-shrink-0" />
                        ) : editStatus === 'done' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : editStatus === 'error' ? (
                          <Circle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-gray-600 flex-shrink-0" />
                        )}
                        <span className={`text-xs ${editStatus === 'rendering' ? 'text-white' : editStatus === 'done' ? 'text-emerald-400' : editStatus === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
                          Render
                        </span>
                        {editStatus === 'rendering' && (
                          <span className="text-xs text-white/70 font-medium">
                            {Math.round(renderProgress * 100)}%
                          </span>
                        )}
                      </div>

                      {/* Separator */}
                      <div className="w-8 h-px bg-gray-700" />

                      {/* Ready step */}
                      <div className="flex items-center gap-2">
                        {editStatus === 'done' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-gray-600 flex-shrink-0" />
                        )}
                        <span className={`text-xs ${editStatus === 'done' ? 'text-emerald-400' : 'text-gray-500'}`}>
                          Ready
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">

                    {/* Progress Bar */}
                    {editStatus !== 'idle' && editStatus !== 'done' && (
                      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden relative">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ease-out ${
                            editStatus === 'error'
                              ? 'bg-red-500'
                              : 'bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 animate-pulse'
                          }`}
                          style={{
                            width: editStatus === 'error' ? '100%' : `${animatedProgress}%`,
                            backgroundSize: '200% 100%',
                            animation: editStatus !== 'error' ? 'shimmer 2s ease-in-out infinite' : 'none'
                          }}
                        />
                      </div>
                    )}

                    {/* Error Message */}
                    {editStatus === 'error' && error && (
                      <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 text-center">
                        <p className="text-sm text-red-400 font-medium">
                          {error}
                        </p>
                      </div>
                    )}

                    {/* Video Preview (only when done) */}
                    {editStatus === 'done' && (
                      <div className="space-y-4">
                        {/* 9:16 Video Card */}
                        {renderUrl && (
                          <div className="w-full max-w-xs mx-auto space-y-4">
                            <div className="relative rounded-2xl bg-gray-900 shadow-2xl shadow-black/50">
                              <video
                                src={renderUrl}
                                controls
                                className="w-full rounded-2xl"
                                style={{ aspectRatio: '9 / 16' }}
                                autoPlay
                                loop
                              />
                              {/* Border overlay */}
                              <div className="absolute inset-0 rounded-2xl border border-white/20 pointer-events-none" />
                            </div>

                            {/* Download Button */}
                            <a
                              href={renderUrl}
                              download={`flowstage-video-${createdEditId}.mp4`}
                              className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl transition-all shadow-lg hover:shadow-xl font-medium"
                            >
                              <Download className="w-5 h-5" />
                              <span>Download video</span>
                            </a>

                            {/* Edit in Flowstage Button - Desktop */}
                            <a
                              href={`https://app.theflowstage.com/create-content/${selectedAestheticId}?startDate=2026-03-22`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hidden sm:flex items-center justify-center gap-2 w-full px-6 py-3 bg-gray-800 border border-gray-700 hover:bg-gray-700 hover:border-gray-600 text-white rounded-xl transition-all font-medium"
                            >
                              <span>Edit this video on desktop →</span>
                            </a>

                            {/* Edit CTA - Mobile only */}
                            <p className="flex sm:hidden items-center justify-center w-full text-sm text-gray-400 italic">
                              Edit this video on desktop
                            </p>

                            {/* Glow effect */}
                            <div className="absolute -inset-6 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-blue-500/20 rounded-3xl blur-3xl -z-10" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-gray-900/50 to-gray-900/20 rounded-3xl border-2 border-dashed border-gray-700 p-16 text-center">
                  {/* Create button in empty state */}
                  <button
                    onClick={handleCreateEdit}
                    disabled={loadingAesthetic || !selectedPreset || !selectedAudioId || !selectedSectionId || isOverLimit}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-white text-black rounded-2xl hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-xl disabled:bg-gray-600 disabled:text-gray-400"
                  >
                    {loadingAesthetic ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Loading aesthetic...</span>
                      </>
                    ) : isOverLimit ? (
                      <>
                        <Play className="w-5 h-5" />
                        <div className="flex flex-col">
                          <span>Monthly limit reached</span>
                          <span className="text-xs">(0 remaining this month)</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5" />
                        {remainingEdits !== null && remainingEdits < 10 ? (
                        <div className="flex flex-col">
                          <span>Create video edit</span>
                          <span className="text-xs text-gray-400">({remainingEdits} remaining this month)</span>
                        </div>
                        ) : (
                          <span>Create video edit</span>
                        )}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Presets Help Dialog */}
      {showPresetsHelp && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-[fadeIn_0.2s_ease-out]"
          onClick={() => setShowPresetsHelp(false)}
        >
          <div
            className="bg-gradient-to-br from-gray-900 to-gray-900/90 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-[scaleIn_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">How to manage presets</h2>
              <button
                onClick={() => setShowPresetsHelp(false)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 text-gray-300 space-y-4">
              <div className="space-y-3">
                <p className="text-sm">
                  Presets define the visual style and layout of your video edits. To manage presets:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Visit <a href="https://app.theflowstage.com" target="_blank" rel="noopener noreferrer" className="text-white hover:underline">app.theflowstage.com</a> and navigate to your aesthetic</li>
                  <li>Go to the "Manage editing presets" section in your aesthetic settings</li>
                  <li>Create new presets or edit existing ones by configuring:</li>
                  <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
                    <li>Video layout and transitions</li>
                    <li>Text styling and positioning</li>
                    <li>Hook field configuration (optional)</li>
                    <li>Aspect ratio and rendering options</li>
                  </ul>
                  <li>Save your preset and it will appear in this dropdown</li>
                </ol>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button
                onClick={() => setShowPresetsHelp(false)}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
              <a
                href={`https://app.theflowstage.com/facets/${selectedAestheticId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-black bg-white rounded-lg hover:bg-gray-200 transition-colors"
              >
                Edit presets on Flowstage →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Audio Help Dialog */}
      {showAudioHelp && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-[fadeIn_0.2s_ease-out]"
          onClick={() => setShowAudioHelp(false)}
        >
          <div
            className="bg-gradient-to-br from-gray-900 to-gray-900/90 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-[scaleIn_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">How to manage audio</h2>
              <button
                onClick={() => setShowAudioHelp(false)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 text-gray-300 space-y-4">
              <div className="space-y-3">
                <p className="text-sm">
                  Audio tracks are the background music for your video edits. To upload and manage audio:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Visit <a href="https://app.theflowstage.com" target="_blank" rel="noopener noreferrer" className="text-white hover:underline">app.theflowstage.com</a> and navigate to your aesthetic</li>
                  <li>Go to the "Audio" section</li>
                  <li>Upload audio files (MP3, WAV, or other supported formats)</li>
                  <li>Your uploaded audio will be automatically analyzed</li>
                  <li>Once processed, the audio will appear in this dropdown</li>
                </ol>
                <div className="bg-black/40 border border-gray-700/50 rounded-lg p-3 mt-4">
                  <p className="text-xs text-gray-300">
                    <strong>Tip:</strong> Audio files are analyzed to detect sections and beats, making it easier to create perfectly timed video edits.
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button
                onClick={() => setShowAudioHelp(false)}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
              <a
                href={`https://app.theflowstage.com/facets/${selectedAestheticId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-black bg-white rounded-lg hover:bg-gray-200 transition-colors"
              >
                Add audio on Flowstage →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Sections Help Dialog */}
      {showSectionsHelp && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-[fadeIn_0.2s_ease-out]"
          onClick={() => setShowSectionsHelp(false)}
        >
          <div
            className="bg-gradient-to-br from-gray-900 to-gray-900/90 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-[scaleIn_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">How to manage audio sections</h2>
              <button
                onClick={() => setShowSectionsHelp(false)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 text-gray-300 space-y-4">
              <div className="space-y-3">
                <p className="text-sm">
                  Audio sections are specific time ranges within your audio tracks. To create and edit sections:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Visit <a href="https://app.theflowstage.com" target="_blank" rel="noopener noreferrer" className="text-white hover:underline">app.theflowstage.com</a> and navigate to your aesthetic</li>
                  <li>Select an audio track from the "Audio" section</li>
                  <li>Click "Add section" or edit existing sections</li>
                  <li>Define the start and end times for each section</li>
                  <li>Name your sections (e.g., "Intro", "Chorus", "Drop")</li>
                  <li>Sections will appear in this dropdown for the selected audio</li>
                </ol>
                <div className="bg-black/40 border border-gray-700/50 rounded-lg p-3 mt-4">
                  <p className="text-xs text-gray-300">
                    <strong>Tip:</strong> Create sections for different parts of your song to quickly generate videos for specific moments like hooks, drops, or verses.
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button
                onClick={() => setShowSectionsHelp(false)}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
              <a
                href={`https://app.theflowstage.com/facets/${selectedAestheticId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-black bg-white rounded-lg hover:bg-gray-200 transition-colors"
              >
                Define sections on Flowstage →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Aesthetic Help Dialog */}
      {showAestheticHelp && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-[fadeIn_0.2s_ease-out]"
          onClick={() => setShowAestheticHelp(false)}
        >
          <div
            className="bg-gradient-to-br from-gray-900 to-gray-900/90 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-[scaleIn_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">How to create an aesthetic</h2>
              <button
                onClick={() => setShowAestheticHelp(false)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 text-gray-300 space-y-4">
              <div className="space-y-3">
                <p className="text-sm">
                  Aesthetics are collections of videos, audio, and presets that define your unique visual style. To create a new aesthetic:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Visit <a href="https://app.theflowstage.com/facets" target="_blank" rel="noopener noreferrer" className="text-white hover:underline font-medium">app.theflowstage.com/facets</a></li>
                  <li>Click "Create new aesthetic"</li>
                  <li>Upload or curate your video content (B-roll, clips, footage)</li>
                  <li>Add audio tracks for your videos</li>
                  <li>Create presets to define visual layouts and styles</li>
                  <li>Your new aesthetic will appear in Flowstage Zero automatically</li>
                </ol>
                <div className="bg-black/40 border border-gray-700/50 rounded-lg p-3 mt-4">
                  <p className="text-xs text-gray-300">
                    <strong>What's an aesthetic?</strong> Think of it as a theme or vibe for your content. Each aesthetic contains the videos, music, and styles you want to use together.
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button
                onClick={() => setShowAestheticHelp(false)}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
              <a
                href="https://app.theflowstage.com/facet-builder"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-black bg-white rounded-lg hover:bg-gray-200 transition-colors"
              >
                Build now on desktop →
              </a>
              <span className="flex sm:hidden px-4 py-2 text-sm text-gray-400 italic">
                Build now on desktop
              </span>
            </div>
          </div>
        </div>
      )}

      {/* About Dialog */}
      <AboutDialog showAbout={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  )
}
