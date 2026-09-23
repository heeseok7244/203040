// 묘한특허 BGM — Web Audio API 기반 절차적 칩튠 음악 (외부 음원 파일 불필요)
// 사용법:
//   BGM.play('lobby')   // 로비/대기 (잔잔한 느낌)
//   BGM.play('battle')  // 대전 중 (긴장감 있는 빠른 템포)
//   BGM.play('victory') // 승리 팡파레 (한 번 재생 후 정지)
//   BGM.play('defeat')  // 패배
//   BGM.stop(); BGM.setVolume(0.5); BGM.toggleMute();
// 브라우저 정책상 첫 사용자 클릭/키 입력 이후에 play()를 호출해야 소리가 납니다.
(function (global) {
  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function freq(n) { // 'A4' -> 440
    if (!n || n === '-') return 0;
    const m = n.match(/^([A-G]#?)(\d)$/);
    const midi = (parseInt(m[2]) + 1) * 12 + NOTE[m[1]];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ─── 곡 데이터 ──────────────────────────────────────────
  // 각 트랙: { wave, gain, notes:[[음, 길이(박)] ...], decay }
  const SONGS = {
    lobby: {
      bpm: 96, loop: true,
      tracks: [
        { wave: 'triangle', gain: 0.18, decay: 0.9,
          notes: [['E4',1],['G4',1],['B4',1],['A4',1],['G4',2],['E4',2],
                  ['D4',1],['E4',1],['G4',1],['A4',1],['B4',2],['-',2],
                  ['C5',1],['B4',1],['A4',1],['G4',1],['E4',2],['G4',2],
                  ['A4',1],['G4',1],['E4',1],['D4',1],['E4',4]] },
        { wave: 'sine', gain: 0.22, decay: 1.0,
          notes: [['E2',2],['E2',2],['C2',2],['C2',2],['G2',2],['G2',2],['D2',2],['D2',2],
                  ['A2',2],['A2',2],['C2',2],['C2',2],['G2',2],['G2',2],['B2',2],['B2',2]] },
        { wave: 'square', gain: 0.05, decay: 0.3,
          notes: [['E5',0.5],['-',0.5],['G5',0.5],['-',0.5],['B5',0.5],['-',0.5],['G5',0.5],['-',0.5],
                  ['C5',0.5],['-',0.5],['E5',0.5],['-',0.5],['G5',0.5],['-',0.5],['E5',0.5],['-',0.5],
                  ['G5',0.5],['-',0.5],['B5',0.5],['-',0.5],['D6',0.5],['-',0.5],['B5',0.5],['-',0.5],
                  ['D5',0.5],['-',0.5],['F#5',0.5],['-',0.5],['A5',0.5],['-',0.5],['F#5',0.5],['-',0.5],
                  ['A5',0.5],['-',0.5],['C6',0.5],['-',0.5],['E6',0.5],['-',0.5],['C6',0.5],['-',0.5],
                  ['C5',0.5],['-',0.5],['E5',0.5],['-',0.5],['G5',0.5],['-',0.5],['E5',0.5],['-',0.5],
                  ['G5',0.5],['-',0.5],['B5',0.5],['-',0.5],['D6',0.5],['-',0.5],['B5',0.5],['-',0.5],
                  ['B4',0.5],['-',0.5],['D5',0.5],['-',0.5],['F#5',0.5],['-',0.5],['D5',0.5],['-',0.5]] },
      ],
      drums: { kick: [0, 2], hat: [0.5, 1, 1.5, 2.5, 3, 3.5], snare: [], bar: 4 },
    },
    battle: {
      bpm: 150, loop: true,
      tracks: [
        { wave: 'square', gain: 0.12, decay: 0.25,
          notes: [['A4',0.5],['A4',0.5],['C5',0.5],['A4',0.5],['E5',1],['D5',0.5],['C5',0.5],
                  ['A4',0.5],['A4',0.5],['C5',0.5],['A4',0.5],['G4',1],['E4',1],
                  ['F4',0.5],['F4',0.5],['A4',0.5],['F4',0.5],['C5',1],['A4',0.5],['G4',0.5],
                  ['E4',0.5],['G4',0.5],['A4',0.5],['C5',0.5],['B4',1],['E5',1],
                  ['A4',0.5],['A4',0.5],['C5',0.5],['A4',0.5],['E5',1],['D5',0.5],['C5',0.5],
                  ['A5',0.5],['G5',0.5],['E5',0.5],['C5',0.5],['D5',1],['E5',1],
                  ['F5',0.5],['E5',0.5],['D5',0.5],['C5',0.5],['B4',0.5],['C5',0.5],['D5',0.5],['B4',0.5],
                  ['A4',0.5],['E4',0.5],['A4',0.5],['C5',0.5],['A4',2]] },
        { wave: 'sawtooth', gain: 0.10, decay: 0.2,
          notes: (function () { // 8분음표 베이스 라인
            const seq = ['A2','A2','A2','A3','A2','A2','G2','A3',
                         'A2','A2','A2','A3','A2','A2','G2','A3',
                         'F2','F2','F2','F3','F2','F2','E2','F3',
                         'E2','E2','E2','E3','E2','E2','G2','E3',
                         'A2','A2','A2','A3','A2','A2','G2','A3',
                         'A2','A2','A2','A3','A2','A2','G2','A3',
                         'F2','F2','F2','F3','G2','G2','G2','G3',
                         'A2','A2','E2','E2','A2','A2','A2','A2'];
            return seq.map(n => [n, 0.5]);
          })() },
        { wave: 'triangle', gain: 0.10, decay: 0.6,
          notes: [['E3',2],['E3',2],['E3',2],['E3',2],['C3',2],['C3',2],['E3',2],['E3',2],
                  ['E3',2],['E3',2],['E3',2],['E3',2],['C3',2],['D3',2],['E3',2],['E3',2]] },
      ],
      drums: { kick: [0, 1, 2, 3], snare: [1, 3], hat: [0.5, 1.5, 2.5, 3.5], bar: 4 },
    },
    victory: {
      bpm: 130, loop: false,
      tracks: [
        { wave: 'square', gain: 0.14, decay: 0.5,
          notes: [['C5',0.5],['C5',0.5],['C5',0.5],['C5',1.5],['G#4',1.5],['A#4',1.5],['C5',1],['-',0.5],['A#4',0.5],['C5',4]] },
        { wave: 'triangle', gain: 0.14, decay: 0.5,
          notes: [['E4',0.5],['E4',0.5],['E4',0.5],['E4',1.5],['C4',1.5],['D4',1.5],['E4',1],['-',0.5],['D4',0.5],['E4',4]] },
        { wave: 'sine', gain: 0.2, decay: 1.2,
          notes: [['C3',2],['C3',1.5],['G#2',1.5],['A#2',1.5],['C3',1.5],['C3',4]] },
      ],
      drums: { kick: [0, 2], snare: [1, 3], hat: [], bar: 4 },
    },
    defeat: {
      bpm: 70, loop: false,
      tracks: [
        { wave: 'triangle', gain: 0.16, decay: 1.2,
          notes: [['E4',1],['D#4',1],['D4',1],['C#4',1],['C4',3],['-',1]] },
        { wave: 'sine', gain: 0.2, decay: 1.5,
          notes: [['A2',2],['G#2',2],['F2',3],['-',1]] },
      ],
      drums: { kick: [0], snare: [], hat: [], bar: 4 },
    },
  };

  // ─── 엔진 ───────────────────────────────────────────────
  let ctx = null, master = null, current = null, timer = null;
  let volume = 0.6, muted = false, noiseBuf = null;

  function ensureCtx() {
    if (ctx) return;
    ctx = new (global.AudioContext || global.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
    // 드럼용 화이트노이즈 버퍼
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(wave, f, t, dur, gain, decay) {
    if (!f) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = wave; o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.05, dur * decay));
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.2);
  }
  function noise(t, dur, gain, hp) {
    const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.02);
  }

  // 한 루프(곡 전체)를 절대 시간 startAt부터 스케줄하고 총 길이(초)를 반환
  function scheduleSong(song, startAt) {
    const beat = 60 / song.bpm;
    let total = 0;
    for (const tr of song.tracks) {
      let t = startAt;
      for (const [n, len] of tr.notes) {
        tone(tr.wave, freq(n), t, len * beat, tr.gain, tr.decay);
        t += len * beat;
      }
      total = Math.max(total, t - startAt);
    }
    const bars = Math.ceil(total / (beat * song.drums.bar));
    for (let b = 0; b < bars; b++) {
      const base = startAt + b * song.drums.bar * beat;
      song.drums.kick.forEach(p => kick(base + p * beat));
      song.drums.snare.forEach(p => noise(base + p * beat, 0.12, 0.25, 1500));
      song.drums.hat.forEach(p => noise(base + p * beat, 0.04, 0.08, 6000));
    }
    return total;
  }

  function play(name) {
    const song = SONGS[name];
    if (!song) { console.warn('[BGM] unknown song:', name); return; }
    ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    stop();
    current = name;
    let next = ctx.currentTime + 0.05;
    const step = () => {
      const len = scheduleSong(song, next);
      next += len;
      if (song.loop) timer = setTimeout(step, (len - 0.5) * 1000);
      else current = null;
    };
    step();
  }
  function stop() {
    if (timer) clearTimeout(timer); timer = null;
    current = null;
    if (!ctx) return;
    // 이미 스케줄된 노드는 마스터를 잠깐 내렸다가 새 마스터로 교체해 즉시 끊음
    const old = master;
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    setTimeout(() => { try { old.disconnect(); } catch (e) {} }, 300);
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
  }
  function setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (master && !muted) master.gain.value = volume; }
  function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : volume; return muted; }

  global.BGM = { play, stop, setVolume, toggleMute, get current() { return current; }, songs: Object.keys(SONGS) };
})(window);
