// 묘한특허 BGM 2 — 햇살 한 스푼, 고양이 두 마리. 외부 음원 없는 Web Audio 오리지널 음악.
(function (global) {
  'use strict';
  // 독립 작곡: 장조의 6·9화음, 짧은 질문/응답, 브리지와 돌아오는 후렴.
  // 각 문자열은 4박 한 마디. 숫자는 음 길이(박), 생략하면 반 박이다.
  const phrase = bars => bars.flatMap(bar => bar.split(' ').map(token => {
    const [note, beats = '0.5'] = token.split(':');
    return [note, Number(beats)];
  }));
  const CHORDS = {
    C: ['C3', 'G3', 'E4', 'G4', 'A4'], Am: ['A2', 'E3', 'C4', 'E4', 'G4'],
    F: ['F2', 'C3', 'A3', 'C4', 'E4'], G: ['G2', 'D3', 'B3', 'D4', 'A4'],
    Dm: ['D3', 'A3', 'F4', 'A4', 'C5'], Em: ['E3', 'B3', 'G4', 'B4', 'D5'],
    A7: ['A2', 'E3', 'G3', 'C#4', 'E4'], D7: ['D3', 'A3', 'F#4', 'A4', 'C5'],
    Fm: ['F2', 'C3', 'G#3', 'C4', 'D4'], G7: ['G2', 'D3', 'F4', 'B4', 'D5'],
  };
  const LOBBY = [
    'E5 G5 A5:1 G5 E5 D5:1', 'C5 E5 G5:1 E5:1 -:1',
    'A4 C5 D5 E5 G5 E5 D5 C5', 'D5:1 G4 B4 D5:1 -:1',
    'E5 G5 A5 C6 B5 A5 G5 E5', 'G5:1 E5 C5 B4:1 A4:1',
    'F5 E5 D5:1 E5 G5 B4:1', 'C5:2 -:1 G4 E5',
    'A5:1 G5 F5 E5 F5 A5:1', 'G5 E5 C5:1 -:1 E5 G5',
    'F5 A5 C6:1 A5 G5 F5 E5', 'D5 F#5 A5:1 G5 F#5 E5 D5',
    'E5 G5 C6:1 B5 A5 G5 E5', 'F5:1 D5 A4 D5 F5 E5 D5',
    'D5 E5 F5 G5 A5 G5 D5 B4', 'C5:2 -:2',
  ];
  const BATTLE = [
    'G5 E5 C5 E5 G5:1 A5 G5', 'E5 C5 A4 C5 E5:1 - G5',
    'A5 G5 F5 E5 F5 A5 C6 A5', 'G5:1 D5 B4 D5 G5 - D5',
    'E5 G5 C6 G5 A5 G5 E5 D5', 'E5:1 C5 A4 G4 A4 C5 E5',
    'F5 A5 G5 F5 E5 D5 B4 D5', 'C5:1 G4 C5 E5:1 -:1',
    'A5 - A5 G5 F5 E5 D5 F5', 'G5 B5 A5 G5 E5:1 - G5',
    'A5 C6 B5 A5 G5 E5 C#5 E5', 'F5:1 E5 D5 A4 D5 F5 A5',
    'G5 E5 C5 E5 G5 A5 C6 G5', 'G#5 F5 D5 C5 D5 F5 G#5:1',
    'G5 D5 B4 D5 F5 A5 G5 B4', 'C5 E5 G5 C6 G5:1 -:1',
  ];
  const DUEL = [
    'C5 E5 G5 - A5 G5 E5 G5', 'A5 E5 C5 - E5 G5 A5 C6',
    'A5 F5 C5 F5 A5:1 G5 F5', 'G5 D5 B4 D5 G5 A5 B5 G5',
    'C6 G5 E5 G5 A5:1 G5 E5', 'B5 G5 E5 B4 E5 G5 B5:1',
    'A5 F5 D5 F5 G5 D5 B4 D5', 'E5 G5 C6:1 - G5 E5 C5',
    'F5 A5 C6 A5 D6 C6 A5 F5', 'E5 G5 B5 G5 C6 B5 G5 E5',
    'C#5 E5 G5 A5 C#6 A5 G5 E5', 'D5 F5 A5 D6 C6 A5 F5 D5',
    'F#5 A5 C6 A5 G5 F#5 E5 D5', 'G5 D5 B4 D5 F5 G5 A5 B5',
    'C6 G5 E5 C5 F5 A5 G5 B4', 'C5 E5 G5 C6 -:1 G5 E5',
  ];
  function arrange(bpm, melody, progression, energy) {
    const chords = progression.split(' ').map(name => CHORDS[name]);
    const bass = [], comp = [], answers = [];
    chords.forEach((c, i) => {
      bass.push([c[0], 0.75], ['-', 1.25], [c[1], 0.75], ['-', 0.75], [c[0], 0.5]);
      const voicing = c.slice(2);
      comp.push(['-', 0.5], [voicing, 0.5], ['-', 1.5], [voicing, 0.5], ['-', 1]);
      // 숨을 쉬는 마디 끝에만 짧게 답하는 벨. 멜로디를 계속 겹치지 않는다.
      answers.push(['-', 3], [i % 2 ? c[3].replace(/\d/, d => +d + 1) : '-', 0.5], [i % 2 ? c[2].replace(/\d/, d => +d + 1) : '-', 0.5]);
    });
    return { bpm, beats: 64, loop: true, swing: energy === 0 ? 0.12 : 0.075, tracks: [
      { voice: energy === 0 ? 'musicbox' : 'marimba', gain: 0.17, pan: -0.12, notes: phrase(melody) },
      { voice: 'bass', gain: 0.21, pan: 0, notes: bass },
      { voice: 'ukulele', gain: 0.052, pan: -0.38, notes: comp },
      { voice: 'musicbox', gain: 0.058, pan: 0.42, notes: answers },
    ], drums: energy === 0 ? { kick: [0], brush: [2], tick: [1.5, 3.5] }
      : energy === 1 ? { kick: [0, 2.5], brush: [1, 3], tick: [0.5, 1.5, 2.5, 3.5] }
      : { kick: [0, 1.5, 2.5], brush: [1, 3], wood: [0.75, 2.75], tick: [0.5, 1.5, 2.5, 3.5] } };
  }
  const SONGS = {
    lobby: arrange(108, LOBBY, 'C Am F G C Am Dm C F C Dm D7 C Dm G7 C', 0),
    battle: arrange(126, BATTLE, 'C Am F G C Am Dm C Dm Em A7 Dm C Fm G7 C', 1),
    duel: arrange(142, DUEL, 'C Am F G C Em Dm C Dm Em A7 Dm D7 G7 C C', 2),
    victory: { bpm: 116, beats: 12, loop: false, tracks: [
      { voice: 'musicbox', gain: 0.18, pan: -0.1, notes: phrase(['G5 C6 E6:1 D6 C6 A5 G5', 'A5 C6 F6:1 E6 D6 G5 B5', 'C6:3 -:1']) },
      { voice: 'ukulele', gain: 0.07, pan: 0.25, notes: [[['E4', 'G4', 'C5'], 4], [['F4', 'A4', 'D5'], 2], [['F4', 'B4', 'D5'], 2], [['E4', 'G4', 'A4', 'C5'], 4]] },
      { voice: 'bass', gain: 0.2, notes: [['C3', 4], ['F2', 2], ['G2', 2], ['C3', 4]] },
    ], drums: {} },
    defeat: { bpm: 86, beats: 8, loop: false, tracks: [
      { voice: 'marimba', gain: 0.16, notes: phrase(['E5:1 D5 C5 A4:1 G4:1', 'A4 C5 E5:2 -:1']) },
      { voice: 'ukulele', gain: 0.05, notes: [[['A3', 'C4', 'E4'], 4], [['G3', 'C4', 'E4', 'A4'], 4]] },
      { voice: 'bass', gain: 0.17, notes: [['F2', 4], ['C3', 4]] },
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
  // 배음마다 다른 감쇠를 줘서 단순한 전자음 대신 목재·금속의 타격감을 만든다.
  const VOICES = {
    musicbox: { partials: [[1, 1, 1], [2, 0.22, 0.45], [3, 0.065, 0.22]], length: 1.15, attack: 0.004 },
    marimba: { partials: [[1, 1, 1], [4, 0.15, 0.18], [10, 0.018, 0.07]], length: 0.65, attack: 0.004 },
    ukulele: { partials: [[1, 1, 1], [2, 0.32, 0.55], [3, 0.12, 0.3]], length: 0.4, attack: 0.008 },
    bass: { partials: [[1, 1, 1], [2, 0.24, 0.6]], length: 0.36, attack: 0.012 },
  };
  function emit(event, at) {
    const drum = event.drum;
    const voice = VOICES[event.voice];
    const partials = voice ? voice.partials : [[1, 1, 1]];
    for (const [ratio, level, decay] of partials) {
      const noisy = drum === 'tick' || drum === 'brush';
      const source = noisy ? ctx.createBufferSource() : ctx.createOscillator();
      const envelope = ctx.createGain(), filter = ctx.createBiquadFilter(), pan = ctx.createStereoPanner();
      let length = voice ? Math.min(event.length * 1.4, voice.length) * decay : 0.13;
      let gain = (event.gain || 0.12) * level;
      filter.type = 'lowpass'; filter.frequency.value = 6800;
      pan.pan.value = event.pan || 0;
      if (drum === 'kick') {
        source.frequency.setValueAtTime(105, at);
        source.frequency.exponentialRampToValueAtTime(48, at + 0.09);
        gain = 0.19;
      } else if (noisy) {
        source.buffer = noiseBuffer;
        filter.type = 'bandpass'; filter.frequency.value = drum === 'tick' ? 7200 : 2600;
        length = drum === 'tick' ? 0.035 : 0.095; gain = drum === 'tick' ? 0.032 : 0.075;
        pan.pan.value = drum === 'tick' ? 0.3 : -0.15;
      } else if (drum === 'wood') {
        source.frequency.value = 920; length = 0.045; gain = 0.055; pan.pan.value = -0.3;
      } else {
        source.type = 'sine'; source.frequency.value = frequency(event.note) * ratio;
        if (event.voice === 'bass') filter.frequency.value = 650;
      }
      length = Math.max(0.035, length);
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(gain, at + (voice ? voice.attack : 0.003));
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
      source.connect(filter).connect(envelope).connect(pan).connect(bus);
      active.add(source);
      source.onended = () => { active.delete(source); source.disconnect(); filter.disconnect(); envelope.disconnect(); pan.disconnect(); };
      source.start(at); source.stop(at + length + 0.03);
    }
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
          if (note !== '-') {
            const swing = position % 1 === 0.5 ? (song.swing || 0) : 0;
            const accent = position % 4 === 0 ? 1 : position % 1 === 0 ? 0.94 : 0.84;
            events.push({ time: (position + swing) * beat, note, length: count * beat, voice: track.voice, gain: track.gain * accent, pan: track.pan });
          }
        }
        position += count;
      }
    }
    for (let bar = 0; bar < song.beats; bar += 4) {
      for (const [drum, hits] of Object.entries(song.drums)) {
        for (const hit of hits) {
          const swing = hit % 1 === 0.5 ? (song.swing || 0) : 0;
          events.push({ time: (bar + hit + swing) * beat, drum });
        }
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
