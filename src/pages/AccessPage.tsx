import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Plus, Trash2, HelpCircle, X, Link } from 'lucide-react'
import { loadProfiles, saveProfiles, addProfile, deleteProfile, createProfile, getProfileByName, type Profile } from '../utils/profiles'
import {
  FLOWSTAGE_AUTH_URL,
  SECURITY_CONFIG,
  isValidApiKeyFormat,
  isAllowedOrigin,
  sanitizeApiKey
} from '../config'
import AboutDialog from '../components/AboutDialog'

interface AccessPageProps {
  onSetActiveProfile: (profile: Profile) => void
}

export default function AccessPage({ onSetActiveProfile }: AccessPageProps) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showApiKeyHelp, setShowApiKeyHelp] = useState(false)
  const [showNameProfileDialog, setShowNameProfileDialog] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileApiKey, setNewProfileApiKey] = useState('')
  const [pendingAuthApiKey, setPendingAuthApiKey] = useState('')
  const [error, setError] = useState('')
  const [isExiting, setIsExiting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const loaded = loadProfiles()
    setProfiles(loaded)
  }, [])

  const handleSelectProfile = (profile: Profile) => {
    setIsExiting(true)
    onSetActiveProfile(profile)
    setTimeout(() => {
      navigate('/dashboard')
    }, 300)
  }

  const handleCreateProfile = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault()
    setError('')

    if (!newProfileName.trim()) {
      setError('Profile name is required')
      return
    }

    if (!newProfileApiKey.trim()) {
      setError('API key is required')
      return
    }

    try {
      const profile = createProfile(newProfileName, newProfileApiKey)
      const updated = addProfile(profile)
      setProfiles(updated)
      setNewProfileName('')
      setNewProfileApiKey('')
      setShowCreateForm(false)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile')
    }
  }

  const handleDeleteProfile = (profileName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Delete profile "${profileName}"? This will remove all associated data.`)) {
      const updated = deleteProfile(profileName)
      setProfiles(updated)
    }
  }

  const handleCompleteAuthProfile = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault()
    setError('')

    if (!newProfileName.trim()) {
      setError('Profile name is required')
      return
    }

    try {
      const profile = createProfile(newProfileName, pendingAuthApiKey)
      const updated = addProfile(profile)
      setProfiles(updated)
      setNewProfileName('')
      setPendingAuthApiKey('')
      setShowNameProfileDialog(false)
      setError('')
      setIsExiting(true)
      onSetActiveProfile(profile)
      setTimeout(() => {
        navigate('/dashboard')
      }, 300)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile')
    }
  }

  const handleConnectWithFlowstage = () => {
    const authUrl = `${FLOWSTAGE_AUTH_URL}?app=flowstage-zero`
    const authWindow = window.open(authUrl, '_blank', 'width=600,height=700')

    if (!authWindow) {
      alert('Please allow popups for this site to connect with Flowstage')
      return
    }

    // Listen for postMessage response with enhanced security
    const handleMessage = (event: MessageEvent) => {
      // Security: Only accept messages from allowed origins
      if (!isAllowedOrigin(event.origin)) {
        // Only log if message looks like it might be intended for us (has a type field)
        // This filters out noise from browser extensions
        if (event.data?.type && SECURITY_CONFIG.LOG_SECURITY_EVENTS) {
          console.warn('[Security] Rejected postMessage from unauthorized origin:', event.origin)
        }
        return
      }

      if (event.data?.type === 'FLOWSTAGE_AUTH_SUCCESS') {
        const { apiKey, appName } = event.data

        // Security: Validate API key format
        if (!isValidApiKeyFormat(apiKey)) {
          console.error('[Security] Invalid API key format received')
          alert('Received an invalid API key format. Please try again.')
          return
        }

        if (SECURITY_CONFIG.LOG_SECURITY_EVENTS) {
          console.log('[Auth] Valid API key received:', sanitizeApiKey(apiKey))
        }

        const defaultProfileName = 'Your artist name here'

        // Check if profile already exists
        const existingProfile = getProfileByName(defaultProfileName)

        if (existingProfile) {
          // Update existing profile's API key
          try {
            const updatedProfile = { ...existingProfile, apiKey }
            const profiles = loadProfiles().map(p =>
              p.name === defaultProfileName ? updatedProfile : p
            )
            saveProfiles(profiles)
            setIsExiting(true)
            onSetActiveProfile(updatedProfile)
            setTimeout(() => {
              navigate('/dashboard')
            }, 300)
          } catch (err) {
            console.error('Failed to update profile:', err)
            alert('Failed to update profile with the provided API key')
          }
        } else {
          // Show naming dialog for new profile
          setPendingAuthApiKey(apiKey)
          setNewProfileName(defaultProfileName)
          setShowNameProfileDialog(true)
        }
      } else if (event.data?.type === 'FLOWSTAGE_AUTH_DENIED') {
        console.log('[Auth] User denied authorization')
        // User closed or denied, no action needed
      } else if (event.data?.type === 'FLOWSTAGE_AUTH_ERROR') {
        console.error('[Auth] Authorization error:', event.data.error)
        alert('Authorization failed: ' + (event.data.error || 'Unknown error'))
      }
    }

    window.addEventListener('message', handleMessage)

    // Cleanup after timeout period for security
    const timeoutId = setTimeout(() => {
      window.removeEventListener('message', handleMessage)
      if (SECURITY_CONFIG.LOG_SECURITY_EVENTS) {
        console.log('[Auth] Message listener timeout reached, cleaning up')
      }
    }, SECURITY_CONFIG.AUTH_TIMEOUT_MS)

    // Also clean up if window is closed
    const handleUnload = () => {
      window.removeEventListener('message', handleMessage)
      clearTimeout(timeoutId)
    }
    window.addEventListener('beforeunload', handleUnload)
  }

  return (
    <div className={`min-h-screen bg-black text-white flex flex-col items-center justify-center px-4 py-12 transition-opacity duration-300 ${isExiting ? 'opacity-0' : 'opacity-100'}`}>
      <div className="w-full max-w-4xl animate-[fadeIn_0.5s_ease-out]">
        <div className="text-center mb-12">
          <a
            href="https://theflowstage.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 mb-4 hover:opacity-80 transition-opacity"
          >
            <img src="/flowstage-logo.svg" alt="Flowstage" className="h-8 w-auto" style={{ filter: 'invert(1)' }} />
            <h1 className="text-xl font-light font-serif tracking-tight text-white animate-[fadeIn_0.6s_ease-out]">
              z e r o .
            </h1>
          </a>
          <p className="text-gray-400 text-sm animate-[fadeIn_0.7s_ease-out]">
            your lyric video studio, simplified.
          </p>
          <p className="text-gray-400 text-sm animate-[fadeIn_0.8s_ease-out]">
            select a profile to continue:
          </p>
        </div>

        {/* Profile Cards Grid */}
        <div className="mb-8">
          <div className="flex flex-wrap justify-center gap-4">
            {/* Existing Profile Cards */}
            {profiles.map((profile, index) => (
              <div
                key={profile.name}
                onClick={() => handleSelectProfile(profile)}
                className="bg-gradient-to-br from-gray-900/80 to-gray-900/40 backdrop-blur-md border-2 border-gray-800/50 hover:border-white/40 hover:scale-105 transition-all duration-300 p-6 cursor-pointer group relative w-64 rounded-2xl animate-[slideUp_0.5s_ease-out] opacity-0"
                style={{ animationDelay: `${0.9 + index * 0.1}s`, animationFillMode: 'forwards' }}
              >
                <button
                  onClick={(e) => handleDeleteProfile(profile.name, e)}
                  className="absolute top-3 right-3 p-2 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete profile"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4">
                    <User className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-1">{profile.name}</h3>
                  <p className="text-xs text-gray-400">
                    Created {new Date(profile.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}

            {/* Connect with Flowstage Button Card */}
            <button
              onClick={handleConnectWithFlowstage}
              className="w-64 bg-gradient-to-br from-purple-900/30 to-pink-900/20 border-2 border-purple-700/50 hover:border-purple-500 hover:scale-105 transition-all duration-300 p-6 flex flex-col items-center justify-center gap-3 text-purple-300 hover:text-white rounded-2xl animate-[slideUp_0.5s_ease-out] opacity-0"
              style={{ animationDelay: `${0.9 + profiles.length * 0.1}s`, animationFillMode: 'forwards' }}
            >
              <Link className="w-8 h-8" />
              <span className="text-sm tracking-wider font-medium">LOG IN WITH FLOWSTAGE</span>
            </button>
          </div>
        </div>
      </div>

      {/* About Button - Bottom center */}
      <button
        onClick={() => setShowAbout(true)}
        className="mt-4 text-sm text-gray-500 hover:text-gray-300 transition-colors animate-[fadeIn_0.9s_ease-out]"
      >
        about.
      </button>

      {/* Create New Profile Dialog */}
      {showCreateForm && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-[fadeIn_0.2s_ease-out]"
          onClick={() => {
            setShowCreateForm(false)
            setNewProfileName('')
            setNewProfileApiKey('')
            setError('')
          }}
        >
          <div
            className="bg-gradient-to-br from-gray-900 to-gray-900/90 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-[scaleIn_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="text-xl font-semibold text-white">Add profile</h2>
            </div>

            <div className="px-6 py-4">
              <div className="space-y-4">
                <div>
                  <label htmlFor="profileName" className="block text-sm font-medium text-gray-300 mb-2">
                    Profile name (cannot be changed)
                  </label>
                  <input
                    id="profileName"
                    type="text"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    placeholder="Enter profile name"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-white/20 focus:border-white/20 text-white placeholder-gray-500"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newProfileName.trim() && newProfileApiKey.trim()) {
                        e.preventDefault()
                        handleCreateProfile(e as any)
                      }
                    }}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="profileApiKey" className="block text-sm font-medium text-gray-300">
                      API Key
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowApiKeyHelp(true)}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>How to get API key</span>
                    </button>
                  </div>
                  <input
                    id="profileApiKey"
                    type="password"
                    value={newProfileApiKey}
                    onChange={(e) => setNewProfileApiKey(e.target.value)}
                    placeholder="Enter your Flowstage API key"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-white/20 focus:border-white/20 text-white placeholder-gray-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newProfileName.trim() && newProfileApiKey.trim()) {
                        e.preventDefault()
                        handleCreateProfile(e as any)
                      }
                    }}
                  />
                </div>

                {error && (
                  <div className="text-red-400 text-sm bg-red-900/20 border border-red-800/50 rounded-lg p-3">
                    {error}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateForm(false)
                  setNewProfileName('')
                  setNewProfileApiKey('')
                  setError('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={(e) => handleCreateProfile(e)}
                disabled={!newProfileName.trim() || !newProfileApiKey.trim()}
                className="px-4 py-2 text-sm font-medium text-black bg-white rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Key Help Dialog */}
      {showApiKeyHelp && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-[fadeIn_0.2s_ease-out]"
          onClick={() => setShowApiKeyHelp(false)}
        >
          <div
            className="bg-gradient-to-br from-gray-900 to-gray-900/90 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-[scaleIn_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">How to get your API key</h2>
              <button
                onClick={() => setShowApiKeyHelp(false)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 text-gray-300 space-y-4">
              <div className="space-y-3">
                <p className="text-sm">
                  To get your Flowstage API key, follow these steps:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Visit <a href="https://app.theflowstage.com" target="_blank" rel="noopener noreferrer" className="text-white hover:underline">app.theflowstage.com</a> and sign in to your account</li>
                  <li>Navigate to your account settings or dashboard</li>
                  <li>Look for the "API" section under Advanced settings (available on Growth+)</li>
                  <li>Click "Create key"</li>
                  <li>Copy the generated API key and paste it here</li>
                </ol>
                <div className="bg-black/40 border border-gray-700/50 rounded-lg p-3 mt-4">
                  <p className="text-xs text-gray-300">
                    <strong>Important:</strong> Keep your API key secure. Do not share it publicly or commit it to version control.
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end">
              <button
                onClick={() => setShowApiKeyHelp(false)}
                className="px-4 py-2 text-sm font-medium text-black bg-white rounded-lg hover:bg-gray-200 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Name Profile After Auth Dialog */}
      {showNameProfileDialog && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-[fadeIn_0.2s_ease-out]"
          onClick={() => {
            setShowNameProfileDialog(false)
            setNewProfileName('')
            setPendingAuthApiKey('')
            setError('')
          }}
        >
          <div
            className="bg-gradient-to-br from-gray-900 to-gray-900/90 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-[scaleIn_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="text-xl font-semibold text-white">Name your profile</h2>
            </div>

            <div className="px-6 py-4">
              <div className="space-y-4">
                <div>
                  <label htmlFor="authProfileName" className="block text-sm font-medium text-gray-300 mb-2">
                    Profile name (cannot be changed)
                  </label>
                  <input
                    id="authProfileName"
                    type="text"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    placeholder="Enter profile name"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-white/20 focus:border-white/20 text-white placeholder-gray-500"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newProfileName.trim()) {
                        e.preventDefault()
                        handleCompleteAuthProfile(e as any)
                      }
                    }}
                  />
                </div>

                {error && (
                  <div className="text-red-400 text-sm bg-red-900/20 border border-red-800/50 rounded-lg p-3">
                    {error}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowNameProfileDialog(false)
                  setNewProfileName('')
                  setPendingAuthApiKey('')
                  setError('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={(e) => handleCompleteAuthProfile(e)}
                disabled={!newProfileName.trim()}
                className="px-4 py-2 text-sm font-medium text-black bg-white rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About Dialog */}
      <AboutDialog showAbout={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  )
}
