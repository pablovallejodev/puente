/**
 * WhisperFeatureExtractor-compatible mel spectrogram (float32 [80, 3000]).
 * Matches Hugging Face / OpenAI Whisper preprocessing for 16 kHz mono PCM.
 */

export type WhisperPreprocessorConfig = {
  sampling_rate: number;
  n_fft: number;
  hop_length: number;
  feature_size: number;
  n_samples: number;
  nb_max_frames: number;
};

export const DEFAULT_PREPROCESSOR: WhisperPreprocessorConfig = {
  sampling_rate: 16000,
  n_fft: 400,
  hop_length: 160,
  feature_size: 80,
  n_samples: 480000,
  nb_max_frames: 3000,
};

let cachedMelFilters: Float32Array | null = null;
let cachedMelKey = '';

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

/** Slaney-style mel filterbank used by Whisper / librosa. */
function buildMelFilters(nMels: number, nFft: number, sampleRate: number): Float32Array {
  const key = `${nMels}:${nFft}:${sampleRate}`;
  if (cachedMelFilters && cachedMelKey === key) return cachedMelFilters;

  const nFreqs = Math.floor(nFft / 2) + 1;
  const melMin = hzToMel(0);
  const melMax = hzToMel(sampleRate / 2);
  const melPoints = nMels + 2;
  const melSpace = (melMax - melMin) / (melPoints - 1);
  const hzPoints = new Float32Array(melPoints);
  for (let i = 0; i < melPoints; i++) {
    hzPoints[i] = melToHz(melMin + i * melSpace);
  }

  const fftFreqs = new Float32Array(nFreqs);
  for (let i = 0; i < nFreqs; i++) {
    fftFreqs[i] = (i * sampleRate) / nFft;
  }

  const filters = new Float32Array(nMels * nFreqs);
  for (let m = 0; m < nMels; m++) {
    const left = hzPoints[m];
    const center = hzPoints[m + 1];
    const right = hzPoints[m + 2];
    const row = m * nFreqs;
    for (let k = 0; k < nFreqs; k++) {
      const f = fftFreqs[k];
      let weight = 0;
      if (f >= left && f <= center) {
        weight = (f - left) / (center - left || 1);
      } else if (f > center && f <= right) {
        weight = (right - f) / (right - center || 1);
      }
      filters[row + k] = (weight * 2) / (right - left || 1);
    }
  }

  cachedMelFilters = filters;
  cachedMelKey = key;
  return filters;
}

function hannWindow(nFft: number): Float32Array {
  // Whisper: np.hanning(n_fft + 1)[:-1]
  const window = new Float32Array(nFft);
  for (let i = 0; i < nFft; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nFft);
  }
  return window;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place radix-2 FFT. */
function fftRadix2(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }
}

/**
 * Bluestein chirp-z FFT for arbitrary length (needed for Whisper n_fft=400).
 * Returns power spectrum of length floor(n/2)+1.
 */
function rfftPowerBluestein(frame: Float32Array, n: number): Float32Array {
  const m = nextPow2(2 * n - 1);
  const aRe = new Float32Array(m);
  const aIm = new Float32Array(m);
  const bRe = new Float32Array(m);
  const bIm = new Float32Array(m);
  const chirpRe = new Float32Array(n);
  const chirpIm = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * i * i) / n;
    chirpRe[i] = Math.cos(angle);
    chirpIm[i] = Math.sin(angle);
    aRe[i] = frame[i] * chirpRe[i];
    aIm[i] = frame[i] * -chirpIm[i];
  }

  bRe[0] = chirpRe[0];
  bIm[0] = chirpIm[0];
  for (let i = 1; i < n; i++) {
    bRe[i] = chirpRe[i];
    bIm[i] = chirpIm[i];
    bRe[m - i] = chirpRe[i];
    bIm[m - i] = chirpIm[i];
  }

  fftRadix2(aRe, aIm);
  fftRadix2(bRe, bIm);

  for (let i = 0; i < m; i++) {
    const r = aRe[i] * bRe[i] - aIm[i] * bIm[i];
    const im = aRe[i] * bIm[i] + aIm[i] * bRe[i];
    aRe[i] = r;
    aIm[i] = im;
  }

  // Inverse FFT: conjugate → FFT → conjugate / m
  for (let i = 0; i < m; i++) aIm[i] = -aIm[i];
  fftRadix2(aRe, aIm);
  for (let i = 0; i < m; i++) {
    aRe[i] /= m;
    aIm[i] = -aIm[i] / m;
  }

  const nFreqs = Math.floor(n / 2) + 1;
  const power = new Float32Array(nFreqs);
  for (let k = 0; k < nFreqs; k++) {
    const re = aRe[k] * chirpRe[k] - aIm[k] * -chirpIm[k];
    const im = aRe[k] * -chirpIm[k] + aIm[k] * chirpRe[k];
    // Match librosa/torch power: |X|^2 (no 1/n scaling here; Whisper uses abs(stft)**2)
    power[k] = re * re + im * im;
  }
  return power;
}

/**
 * Convert mono PCM float32 to Whisper input features [nMels * nbMaxFrames] row-major.
 * Pads/truncates waveform to n_samples (30s @ 16kHz).
 */
export function extractWhisperMel(
  pcm: Float32Array,
  preprocessor: WhisperPreprocessorConfig = DEFAULT_PREPROCESSOR,
): Float32Array {
  const {
    sampling_rate: sampleRate,
    n_fft: nFft,
    hop_length: hopLength,
    feature_size: nMels,
    n_samples: nSamples,
    nb_max_frames: maxFrames,
  } = preprocessor;

  const waveform = new Float32Array(nSamples);
  const copyLen = Math.min(pcm.length, nSamples);
  waveform.set(pcm.subarray(0, copyLen));

  const pad = Math.floor(nFft / 2);
  const padded = new Float32Array(nSamples + 2 * pad);
  for (let i = 0; i < pad; i++) {
    padded[pad - 1 - i] = waveform[Math.min(i + 1, nSamples - 1)] ?? 0;
    padded[pad + nSamples + i] = waveform[Math.max(nSamples - 2 - i, 0)] ?? 0;
  }
  padded.set(waveform, pad);

  const window = hannWindow(nFft);
  const filters = buildMelFilters(nMels, nFft, sampleRate);
  const nFreqs = Math.floor(nFft / 2) + 1;
  const mel = new Float32Array(nMels * maxFrames);
  const frame = new Float32Array(nFft);

  // Only compute STFT over real audio (+ small pad); remaining frames stay 0.
  const activeSamples = Math.min(pcm.length, nSamples) + nFft;
  const activeFrames = Math.min(maxFrames, Math.max(1, Math.ceil(activeSamples / hopLength)));

  for (let t = 0; t < activeFrames; t++) {
    const start = t * hopLength;
    for (let i = 0; i < nFft; i++) {
      frame[i] = (padded[start + i] ?? 0) * window[i];
    }
    const power = rfftPowerBluestein(frame, nFft);

    for (let m = 0; m < nMels; m++) {
      let sum = 0;
      const row = m * nFreqs;
      for (let k = 0; k < nFreqs; k++) {
        sum += filters[row + k] * power[k];
      }
      mel[m * maxFrames + t] = sum;
    }
  }

  let maxVal = -Infinity;
  for (let i = 0; i < mel.length; i++) {
    const v = Math.log10(Math.max(mel[i], 1e-10));
    mel[i] = v;
    if (v > maxVal) maxVal = v;
  }
  for (let i = 0; i < mel.length; i++) {
    mel[i] = (Math.max(mel[i], maxVal - 8) + 4) / 4;
  }

  return mel;
}
