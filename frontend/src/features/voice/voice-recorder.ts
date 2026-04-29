export type RecorderStatus = 'idle' | 'recording' | 'uploading'

export function pickRecordingMimeType(): { mediaRecorderMimeType: string; blobType: string } {
  const supported = (mime: string) => {
    try {
      return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)
    } catch {
      return false
    }
  }

  if (supported('audio/webm;codecs=opus')) return { mediaRecorderMimeType: 'audio/webm;codecs=opus', blobType: 'audio/webm' }
  if (supported('audio/webm')) return { mediaRecorderMimeType: 'audio/webm', blobType: 'audio/webm' }
  if (supported('audio/wav')) return { mediaRecorderMimeType: 'audio/wav', blobType: 'audio/wav' }
  return { mediaRecorderMimeType: '', blobType: 'audio/webm' }
}
