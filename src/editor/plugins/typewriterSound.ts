const SOUND_COUNT = 6
const MIN_INTERVAL = 80

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
let loadState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle'
let lastPlayTime = 0

async function init() {
  if (loadState !== 'idle') return
  loadState = 'loading'

  try {
    audioCtx = new AudioContext()

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume()
    }

    await Promise.all(
      Array.from({ length: SOUND_COUNT }, async (_, i) => {
        try {
          const res = await fetch(`/sounds/key${i + 1}.wav`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const arrayBuf = await res.arrayBuffer()
          buffers[i] = await audioCtx!.decodeAudioData(arrayBuf)
        } catch (err) {
          console.warn(`key${i + 1}.wav failed:`, err)
        }
      })
    )

    loadState = 'ready'
    console.log('Gravitas sound ready')
  } catch (err) {
    loadState = 'failed'
    console.error('Sound init failed:', err)
  }
}

export function warmup() {
  if (loadState === 'idle') {
    init().catch(console.error)
  }
}

export function playKeySound() {
    if (loadState === 'idle') {
      init().catch(console.error)
      return
    }
  
    if (loadState !== 'ready' || !audioCtx) return
  
    // If suspended, resume AND play — don't skip this keypress
    const play = () => {
      const now = Date.now()
      if (now - lastPlayTime < MIN_INTERVAL) return
      lastPlayTime = now
  
      const index = queue.next(SOUND_COUNT)
      const buffer = buffers[index]
      if (!buffer) return
  
      try {
        const source = audioCtx!.createBufferSource()
        source.buffer = buffer
        const gain = audioCtx!.createGain()
        gain.gain.value = 0.25
        source.connect(gain)
        gain.connect(audioCtx!.destination)
        source.start(0)
      } catch (err) {
        console.warn('Playback error:', err)
      }
    }
  
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(play).catch(console.error)
    } else {
      play()
    }
  }
