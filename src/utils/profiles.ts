export interface Profile {
  name: string
  apiKey: string
  createdAt: string
}

const PROFILES_STORAGE_KEY = 'flowstage-profiles'
const ACTIVE_PROFILE_STORAGE_KEY = 'flowstage-active-profile'

export function loadProfiles(): Profile[] {
  try {
    const stored = localStorage.getItem(PROFILES_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function saveProfiles(profiles: Profile[]) {
  try {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles))
  } catch (e) {
    console.error('Failed to save profiles:', e)
  }
}

export function loadActiveProfile(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveActiveProfile(profileName: string) {
  try {
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileName)
  } catch (e) {
    console.error('Failed to save active profile:', e)
  }
}

export function clearActiveProfile() {
  try {
    localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY)
  } catch (e) {
    console.error('Failed to clear active profile:', e)
  }
}

export function createProfile(name: string, apiKey: string): Profile {
  return {
    name: name.trim(),
    apiKey: apiKey.trim(),
    createdAt: new Date().toISOString(),
  }
}

export function addProfile(profile: Profile): Profile[] {
  const profiles = loadProfiles()
  // Check if profile name already exists
  if (profiles.some(p => p.name === profile.name)) {
    throw new Error('A profile with this name already exists')
  }
  const updated = [...profiles, profile]
  saveProfiles(updated)
  return updated
}

export function deleteProfile(profileName: string): Profile[] {
  const profiles = loadProfiles()
  const updated = profiles.filter(p => p.name !== profileName)
  saveProfiles(updated)

  // Clear active profile if it was deleted
  if (loadActiveProfile() === profileName) {
    clearActiveProfile()
  }

  return updated
}

export function getProfileByName(name: string): Profile | null {
  const profiles = loadProfiles()
  return profiles.find(p => p.name === name) || null
}

export function updateProfileApiKey(profileName: string, newApiKey: string): Profile[] {
  const profiles = loadProfiles()
  const updated = profiles.map(p =>
    p.name === profileName ? { ...p, apiKey: newApiKey.trim() } : p
  )
  saveProfiles(updated)
  return updated
}
