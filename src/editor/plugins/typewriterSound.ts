const SOUND_COUNT = 6
const MIN_INTERVAL = 40

class SoundQueue {
  private queue: number[] = []
  private last = -1

  next(total: number): number {
    if (this.queue.length === 0) {
      this.queue = Array.from({ length: total }, (_, i) => i)
        .filter(i => i !== this.last)
        .sort(() => Math.random() - 0.5)
    }
    const next = this.queue.pop()!
    this.last = next
    return next
  }
}

const queue = new SoundQueue()
let audioCtx: AudioContext | null = null
let buffers: (AudioBuffer | null)[] = Array(SOUND_COUNT).fill(null)
let loaded = false
let lastPlayTime = 0

async function preload() {
  if (loaded) return
  loaded = true

  audioCtx = new AudioContext()

  await Promise.all(
    Array.from({ length: SOUND_COUNT }, async (_, i) => {
      try {
        const response = await fetch(`/sounds/key${i + 1}.wav`)
        const arrayBuffer = await response.arrayBuffer()
        buffers[i] = await audioCtx!.decodeAudioData(arrayBuffer)
      } catch (err) {
        console.warn(`Failed to load key${i + 1}.wav`, err)
      }
    })
  )
}

// Call this once on app start — before any typing
export function initSound() {
  preload().catch(console.error)
}

export function playKeySound() {
  if (!audioCtx || !loaded) return

  const now = Date.now()
  if (now - lastPlayTime < MIN_INTERVAL) return
  lastPlayTime = now

  const index = queue.next(SOUND_COUNT)
  const buffer = buffers[index]
  if (!buffer) return

  // Create a new source node — they're designed to be single-use
  const source = audioCtx.createBufferSource()
  source.buffer = buffer

  // Volume control
  const gainNode = audioCtx.createGain()
  gainNode.gain.value = 0.25

  source.connect(gainNode)
  gainNode.connect(audioCtx.destination)
  source.start(0)
}