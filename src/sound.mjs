const tones = {
  mote_picked: [740, 990], lantern_lit: [392, 523, 784], pulse: [370, 185],
  player_hit: [150, 100], jump: [280, 430], dash: [350, 540], won: [523, 659, 784, 1047],
  lost: [392, 294, 196], shade_spawned: [110, 135], countdown: [650], wind: [155, 210, 155],
  charm_picked: [550, 825], drifter_steal: [260, 180], drifter_drop: [420, 620],
};

let audio;
let musicTimer;
let musicStep = 0;

function note(frequency, offset, length, level, type = 'sine') {
  if (!audio || sounds.volume === 0) return;
  const start = audio.currentTime + offset;
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  envelope.gain.setValueAtTime(0.001, start);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, level * sounds.volume), start + 0.03);
  envelope.gain.exponentialRampToValueAtTime(0.001, start + length);
  oscillator.connect(envelope).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + length);
}

export const sounds = {
  volume: 0.35,
  start() {
    const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Audio) return;
    audio ??= new Audio();
    void audio.resume().catch(() => {});
    if (musicTimer) return;
    const song = [196, 293.66, 261.63, 392, 220, 329.63, 293.66, 261.63];
    musicTimer = setInterval(() => {
      const pitch = song[musicStep++ % song.length];
      note(pitch, 0, 1.1, 0.12);
      note(pitch / 2, 0.08, 1.3, 0.08);
    }, 950);
  },
  pause() {
    clearInterval(musicTimer);
    musicTimer = undefined;
  },
  effect(name) {
    tones[name]?.forEach((frequency, index) => note(frequency, index * 0.09, 0.22, 0.38, 'triangle'));
  },
};
