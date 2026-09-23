// 묘한특허 BGM 2 — 냥이들의 야근 행진. 외부 음원 없는 Web Audio 오리지널 음악.
(function (global) {
  'use strict';
  const notes = (s, length = 0.5) => s.split(' ').map(n => [n, length]);
  const harmony = [
    ['D3', 'F3', 'A3', 'E4'], ['A#2', 'D3', 'F3', 'A3'],
    ['F3', 'A3', 'C4', 'G4'], ['C3', 'E3', 'G3', 'D4'],
    ['G2', 'A#2', 'D3', 'F3'], ['D3', 'F3', 'A3', 'C4'],
    ['A#2', 'D3', 'F3', 'A3'], ['A2', 'C#3', 'E3', 'G3'],
  ];
  // 각 프레이즈는 8마디. 같은 주제를 장면마다 다른 리듬으로 변주한다.
  const themes = {
    lobby: 'D5 - A4 F4 E4 F4 A4 - F5 - E5 D5 A4 - F4 - A4 C5 F5 - E5 C5 A4 - G4 - E5 D5 C5 - G4 - A#4 D5 G5 - F5 D5 A#4 - A4 - F5 E5 D5 A4 F4 - F4 A4 D5 F5 E5 D5 A4 - E5 C#5 A4 G4 E4 - A4 -',
    battle: 'D5 A4 D5 F5 - E5 D5 A4 F5 D5 A4 F4 A4 D5 F5 - A5 F5 C5 A4 C5 F5 G5 A5 G5 E5 C5 G4 C5 D5 E5 - G5 D5 A#4 G4 A#4 D5 F5 G5 F5 E5 D5 A4 F4 A4 D5 - A#4 D5 F5 A5 G5 F5 D5 A#4 A4 C#5 E5 G5 E5 C#5 A4 -',
    duel: 'D5 - D5 A5 F5 E5 D5 C#5 D5 A4 D5 F5 A5 - G5 F5 F5 C5 F5 A5 G5 F5 E5 C5 E5 G5 C6 G5 E5 D5 C5 - G5 D5 G5 A#5 A5 G5 F5 D5 F5 A5 D6 A5 F5 E5 D5 - A#5 A5 G5 F5 D5 F5 G5 E5 C#5 E5 A5 G5 E5 C#5 A4 -',
  };
  function arrange(name, bpm) {
    const calm = name === 'lobby';
    const chords = name === 'duel' ? [harmony[0], harmony[0], ...harmony.slice(2)] : harmony;
    return { bpm, loop: true, beats: 64, tracks: [
      { voice: 'pluck', gain: calm ? 0.12 : 0.14, notes: [...notes(themes[name]), ...notes(themes[name]).map(([n, d], i) => [i % 16 < 4 ? '-' : n, d])] },
      { voice: 'bass', gain: 0.18, notes: [...chords, ...chords].flatMap(c => [[c[0], 1.5], ['-', 0.5], [c[2], 1], [c[0], 1]]) },
      { voice: 'bell', gain: calm ? 0.045 : 0.035, notes: [...chords, ...chords].flatMap(c => [c[0], c[1], c[2], c[3], c[2], c[1], c[3], c[2]].map(n => [n.replace(/\d/, d => +d + 1), 0.5])) },
      { voice: 'pad', gain: 0.035, notes: [...chords, ...chords].map(c => [c.slice(1), 4]) },
    ], drums: calm ? { kick: [0], tick: [1, 2, 3] } : name === 'duel'
      ? { kick: [0, 1.5, 2, 2.75], snare: [1, 3], tick: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] }
      : { kick: [0, 2, 2.5], snare: [1, 3], tick: [0.5, 1.5, 2.5, 3.5] } };
  }
  const SONGS = {
    lobby: arrange('lobby', 104), battle: arrange('battle', 132), duel: arrange('duel', 156),
    victory: { bpm: 126, beats: 12, loop: false, tracks: [
      { voice: 'pluck', gain: 0.16, notes: [...notes('D5 F#5 A5 - A5 B5 A5 F#5'), ['G5', 1], ['E5', 1], ['D5', 6]] },
      { voice: 'pad', gain: 0.07, notes: [[['D4', 'F#4', 'A4'], 4], [['G3', 'B3', 'D4'], 2], [['D4', 'F#4', 'A4'], 6]] },
      { voice: 'bass', gain: 0.18, notes: [['D3', 4], ['G2', 2], ['D3', 6]] },
    ], drums: {} },
    defeat: { bpm: 76, beats: 8, loop: false, tracks: [
      { voice: 'bell', gain: 0.14, notes: [['A4', 1], ['F4', 1], ['E4', 1], ['C#4', 1], ['D4', 4]] },
      { voice: 'pad', gain: 0.07, notes: [[['A3', 'C#4', 'E4'], 4], [['D3', 'F3', 'A3'], 4]] },
      { voice: 'bass', gain: 0.16, notes: [['A2', 4], ['D2', 4]] },
    ], drums: {} },
  };
  let ctx, master, noiseBuffer, bus, timer, current = null, volume = 0.6, muted = false;
  let events = [], cursor = 0, origin = 0, cycle = 0, duration = 0;
  const active = new Set();
  function init() {
    if (ctx) return;
    ctx = new (global.AudioContext || global.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    const compressor = ctx.createDynamicsCompressor();
    master.connect(compressor).connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.2), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  function frequency(n) {
    const m = /^([A-G])(#?)(\d)$/.exec(n);
    return 440 * 2 ** (((+m[3] + 1) * 12 + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0) - 69) / 12);
  }
  function emit(event, at) {
    const drum = event.drum;
    const source = drum && drum !== 'kick' ? ctx.createBufferSource() : ctx.createOscillator();
    const envelope = ctx.createGain(), filter = ctx.createBiquadFilter();
    let length = event.length || 0.16, gain = event.gain || 0.12;
    filter.type = 'lowpass'; filter.frequency.value = 2800;
    if (drum === 'kick') {
      source.frequency.setValueAtTime(125, at);
      source.frequency.exponentialRampToValueAtTime(43, at + 0.13);
      gain = 0.32;
    } else if (drum) {
      source.buffer = noiseBuffer;
      filter.type = 'highpass'; filter.frequency.value = drum === 'tick' ? 6500 : 1600;
      length = drum === 'tick' ? 0.035 : 0.12; gain = drum === 'tick' ? 0.045 : 0.13;
    } else {
      source.type = event.voice === 'bass' || event.voice === 'bell' ? 'sine' : 'triangle';
      source.frequency.value = frequency(event.note);
      if (event.voice === 'pluck') length = Math.min(length * 0.8, 0.42);
      if (event.voice === 'bell') length = Math.min(length * 1.3, 0.6);
      if (event.voice === 'bass') filter.frequency.value = 700;
    }
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gain, at + (event.voice === 'pad' ? 0.08 : 0.006));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.1, length));
    source.connect(filter).connect(envelope).connect(bus);
    active.add(source);
    source.onended = () => { active.delete(source); source.disconnect(); filter.disconnect(); envelope.disconnect(); };
    source.start(at); source.stop(at + Math.max(0.1, length) + 0.03);
  }
  function stop() {
    clearInterval(timer); timer = null; current = null;
    if (!ctx || !bus) return;
    const old = bus;
    old.gain.cancelScheduledValues(ctx.currentTime);
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
    for (const source of active) { try { source.stop(ctx.currentTime + 0.08); } catch (_) {} }
    active.clear(); bus = null;
    setTimeout(() => old.disconnect(), 120);
  }
  function play(name) {
    const song = SONGS[name];
    if (!song) return;
    init();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    stop(); current = name;
    bus = ctx.createGain(); bus.connect(master);
    const beat = 60 / song.bpm;
    duration = song.beats * beat; events = [];
    for (const track of song.tracks) {
      let position = 0;
      for (const [pitch, count] of track.notes) {
        for (const note of Array.isArray(pitch) ? pitch : [pitch]) {
          if (note !== '-') events.push({ time: position * beat, note, length: count * beat, voice: track.voice, gain: track.gain });
        }
        position += count;
      }
    }
    for (let bar = 0; bar < song.beats; bar += 4) {
      for (const [drum, hits] of Object.entries(song.drums)) {
        for (const hit of hits) events.push({ time: (bar + hit) * beat, drum });
      }
    }
    events.sort((a, b) => a.time - b.time);
    cursor = 0; cycle = 0; origin = ctx.currentTime + 0.04;
    function schedule() {
      // 짧게 미리 예약하므로 장시간 재생해도 예약 노드가 쌓이지 않는다.
      const now = ctx.currentTime;
      if (song.loop && now > origin + (cycle + 1) * duration) {
        cycle = Math.floor((now - origin) / duration); cursor = 0;
      }
      while (true) {
        if (cursor === events.length) {
          if (!song.loop) {
            if (now >= origin + duration + 0.1) { clearInterval(timer); timer = null; current = null; }
            return;
          }
          cursor = 0; cycle++;
        }
        const event = events[cursor], at = origin + cycle * duration + event.time;
        if (at > now + 0.16) return;
        if (at >= now - 0.02) emit(event, Math.max(now, at));
        cursor++;
      }
    }
    timer = setInterval(schedule, 25); schedule();
  }
  function setVolume(value) {
    if (!Number.isFinite(value)) return;
    volume = Math.max(0, Math.min(1, value));
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
  }
  function toggleMute() { muted = !muted; setVolume(volume); return muted; }
  global.BGM2 = { play, stop, setVolume, toggleMute, get current() { return current; }, songs: Object.keys(SONGS) };
})(window);
