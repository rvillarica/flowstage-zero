import { X } from 'lucide-react'

interface AboutDialogProps {
  showAbout: boolean
  onClose: () => void
}

export default function AboutDialog({ showAbout, onClose }: AboutDialogProps) {
  if (!showAbout) return null

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-[fadeIn_0.2s_ease-out]"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-gray-900 to-gray-900/90 border border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-[scaleIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">What is this?</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 text-gray-300 space-y-4">
          <p className="text-sm leading-relaxed">
            <strong className="text-white">Flowstage Zero</strong> is a proof of concept open source lyric video creator built on Flowstage.
          </p>
          <p className="text-sm leading-relaxed">
            It provides an example minimalist app for creation and rendering that is <strong className="text-white">fully customizable and can be plugged into any workflow.</strong>
          </p>

          <p className="text-sm leading-relaxed">
            All the annoying <strong className="text-white">media management and audio transcription</strong> is handled in the Flowstage interface!
          </p>

          <div className="bg-black/40 border border-gray-700/50 rounded-lg p-3">
            <p className="text-xs text-gray-300">
              Flowstage Zero is open source and available on GitHub.{' '}
              <a
                href="https://github.com/rvillarica/flowstage-zero"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:underline font-medium"
              >
                Access it here!
              </a>
            </p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-black bg-white rounded-lg hover:bg-gray-200 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
