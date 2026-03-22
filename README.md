# Flowstage Zero

Flowstage Zero is a sample app demonstrating Flowstage API integration patterns for artists, teams, and labels building custom workflows.

It features a minimalist implementation of Flowstage that lets users create fully rendered lyric videos in a single click, leveraging the aesthetics in their Flowstage workspace!

Flowstage Zero can be accessed [HERE](https://zero.theflowstage.com).

## Overview

Flowstage Zero is a reference implementation that shows how to:
- Authenticate users without OAuth infrastructure
- Handle video rendering with proper polling patterns
- Manage API keys securely in browser storage
- Implement lazy loading for optimal performance

This codebase serves as a starting point for building your own Flowstage-powered applications.

## Key Implementation Patterns

### Authorizing Your App with Flowstage

There are two ways to get API access:

#### Option 1: Manual API Key Entry

Users can get their API key from [app.theflowstage.com/api-keys](https://app.theflowstage.com/api-keys) and paste it directly into your app. Note that API key creation at this time is scoped solely to users who are on the Growth plan or higher.

```typescript
// Simple input field
<input
  type="text"
  placeholder="Paste your API key (starts with fs_)"
  onChange={(e) => setApiKey(e.target.value)}
/>
```

#### Option 2: Authorization Popup (Recommended)

More user-friendly flow that handles key creation automatically, and works for users on ANY plan:

```typescript
function requestAuthorization() {
  // Open Flowstage authorization page
  const authWindow = window.open(
    'https://app.theflowstage.com/authorize-app?app_name=Your App Name',
    '_blank',
    'width=500,height=700'
  )

  // Listen for authorization response
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'FLOWSTAGE_AUTH_SUCCESS') {
      const apiKey = event.data.apiKey
      // Store and use the API key
      localStorage.setItem('flowstage_api_key', apiKey)
    }
  })
}
```

The authorization page will:
1. Show the user which app is requesting access
2. Require typed confirmation for security
3. Create a new API key (or recreate if one exists)
4. Send the key back via postMessage

### Render Polling Strategy

Video rendering typically takes 30-60 seconds. The app implements exponential backoff:

```typescript
// Poll frequently at first, then back off
const pollInterval = currentPoll < 10 ? 2000 :    // First 10 polls: 2s
                    currentPoll < 20 ? 5000 : 10000 // Next 10: 5s, then 10s

// URL contains edit ID for sharing/resuming
window.location.search = `?edit_id=${editId}`
```

This approach:
- Catches fast renders quickly
- Reduces server load over time
- Allows URL-based sharing of in-progress renders
- Resumes polling on page refresh

### Data Loading Pattern

The app demonstrates progressive data loading to minimize API calls:

```typescript
// Stage 1: Load aesthetic list (minimal data)
GET /v1/aesthetics/summary
// Returns: id, name, video_count, thumbnails

// Stage 2: Load full details only when selected
GET /v1/aesthetics/{id}
// Returns: complete videos, audios, photos arrays

// Stage 3: Create edit with selected media
POST /v1/video-edits/draft
```

This reduces initial load time by 80% compared to loading all data upfront.

### Profile Management

Multiple API keys can be managed using localStorage:

```typescript
interface Profile {
  name: string        // "Personal", "Work", "Client X"
  apiKey: string      // "fs_abc123..."
  createdAt: string   // ISO timestamp
}

// Store multiple profiles
localStorage['flowstage-profiles'] = JSON.stringify(profiles)
localStorage['flowstage-active-profile'] = 'Personal'
```

Benefits:
- Switch between accounts instantly
- No backend required
- Persists across sessions
- Clear separation between profiles

## Security Implementation

### Current Security Measures

**API Key Validation**
```typescript
// Validates format: fs_ + 48 hex chars
const isValid = /^fs_[a-f0-9]{48}$/i.test(apiKey)
```

**Typed Confirmation**
```
Users must type: "I trust this website and agree to allow it access to my Flowstage account"
```

**Origin Logging**
```typescript
// Logs auth requests for debugging
if (SECURITY_CONFIG.LOG_SECURITY_EVENTS) {
  console.log('Auth request from:', event.origin)
}
```

### Production Considerations

For production deployments, consider adding:

- **Rate limiting** - Track authorization attempts per domain
- **Key rotation** - Force re-authorization after N days
- **Encryption** - Encrypt API keys in localStorage
- **Domain allowlisting** - Restrict which domains can request authorization

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Deploy to Vercel
vercel
```

## Project Structure

```
src/
├── api/
│   ├── flowstage.ts    # API client with error handling
│   └── types.ts         # TypeScript interfaces
├── pages/
│   ├── AccessPage.tsx   # Profile selection/login
│   └── Dashboard.tsx    # Main editor interface
├── utils/
│   └── profiles.ts      # LocalStorage management
├── config.ts            # API URLs and security settings
└── App.tsx              # Router and postMessage handler
```

## Support

For API-specific questions, refer to the [Flowstage API Developer Guide](https://app.theflowstage.com/api-docs).

For issues with this sample application, please open an issue on GitHub.

## License

MIT - Use this code as a starting point for your own applications.