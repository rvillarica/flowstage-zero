import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import AccessPage from './pages/AccessPage'
import Dashboard from './pages/Dashboard'
import { loadActiveProfile, saveActiveProfile, clearActiveProfile, getProfileByName, createProfile, addProfile, loadProfiles, saveProfiles, type Profile } from './utils/profiles'
import { FLOWSTAGE_APP_URL, ALLOWED_POSTMESSAGE_ORIGINS } from './config'

function App() {
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)

  const handleSetActiveProfile = useCallback((profile: Profile) => {
    saveActiveProfile(profile.name)
    setActiveProfile(profile)
  }, [])

  useEffect(() => {
    const storedProfileName = loadActiveProfile()
    if (storedProfileName) {
      const profile = getProfileByName(storedProfileName)
      if (profile) {
        setActiveProfile(profile)
      } else {
        // Profile was deleted, clear active profile
        clearActiveProfile()
      }
    }
  }, [])

  // PostMessage API for one-click API key passing from main site
  useEffect(() => {
    // Signal to opener that we're ready to receive API key
    if (window.opener) {
      window.opener.postMessage('FLOWSTAGE_BASIC_READY', FLOWSTAGE_APP_URL)
    }

    // Listen for API key from parent window
    const handleMessage = (event: MessageEvent) => {
      // Security: Only accept messages from allowed origins
      if (!ALLOWED_POSTMESSAGE_ORIGINS.includes(event.origin)) {
        // Only log if message looks like it might be intended for us (has a type field)
        // This filters out noise from browser extensions
        if (event.data?.type) {
          console.warn('Rejected postMessage from unauthorized origin:', event.origin)
        }
        return
      }

      if (event.data?.type === 'PASS_API_KEY') {
        const { apiKey, profileName } = event.data

        if (!apiKey) {
          console.error('No API key provided in postMessage')
          return
        }

        try {
          // Create profile with provided name (or default)
          const name = profileName || 'Main account'

          // Check if profile already exists
          const existingProfile = getProfileByName(name)

          if (existingProfile) {
            // Update existing profile's API key
            const updatedProfile = { ...existingProfile, apiKey }
            const profiles = loadProfiles().map(p =>
              p.name === name ? updatedProfile : p
            )
            saveProfiles(profiles)
            handleSetActiveProfile(updatedProfile)
            console.log('Updated existing profile via postMessage')
          } else {
            // Create new profile
            const profile = createProfile(name, apiKey)
            addProfile(profile)
            handleSetActiveProfile(profile)
            console.log('Created new profile via postMessage')
          }
        } catch (err) {
          console.error('Failed to pass API key:', err)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleSetActiveProfile])

  const handleClearActiveProfile = () => {
    clearActiveProfile()
    setActiveProfile(null)
  }

  const handleUpdateProfileApiKey = (newApiKey: string) => {
    if (activeProfile) {
      const updatedProfile = { ...activeProfile, apiKey: newApiKey }
      setActiveProfile(updatedProfile)
    }
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            activeProfile ?
              <Navigate to="/dashboard" replace /> :
              <AccessPage onSetActiveProfile={handleSetActiveProfile} />
          }
        />
        <Route
          path="/dashboard"
          element={
            activeProfile ?
              <Dashboard
                apiKey={activeProfile.apiKey}
                activeProfile={activeProfile}
                onSignOut={handleClearActiveProfile}
                onSetApiKey={handleUpdateProfileApiKey}
              /> :
              <Navigate to="/" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
