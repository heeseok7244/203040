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
  // 1:1 전용: A단조, 곧게 달리는 16분음표와 반음의 도미넌트 긴장.
  const DUEL = [
    'A5:0.25 E5:0.25 A5:0.25 B5:0.25 C6 E5 B5 A5 G#5 E5',
    'A5 E5 C5 E5 A5:0.25 B5:0.25 C6:0.25 B5:0.25 A5 -',
    'F5 C5 F5 G5 A5:0.25 G5:0.25 F5:0.25 E5:0.25 D5 C5',
    'E5 G#5 B5 E6 D6 B5 G#5 E5',
    'A5:0.25 E5:0.25 A5:0.25 B5:0.25 C6 E6 D6 C6 B5 A5',
    'C6 G5 E5 G5 B5:0.25 C6:0.25 D6:0.25 C6:0.25 B5 G5',
    'D6 A5 F5 A5 C6 A5 F5 D5',
    'E5 F5 E5 D5 B4 D5 E5 G#5',
    'A5 C6 E6 C6 B5 A5 G5 E5',
    'F5 A5 C6 A5 G5 F5 E5 C5',
    'D5 F5 A5 D6 C6 A5 F5 D5',
    'E5 G#5 B5 D6 E6:0.25 D6:0.25 B5:0.25 G#5:0.25 E5 -',
    'A5:0.25 B5:0.25 C6:0.25 B5:0.25 A5 E5 C6 B5 A5 G5',
    'F5:0.25 G5:0.25 A5:0.25 G5:0.25 F5 C5 A5 G5 F5 E5',
    'D5 F5 A5 C6 B5 A5 G#5 F5',
    'E5 G#5 B5 E6 D6:0.25 C6:0.25 B5:0.25 A5:0.25 G#5 -',
  ];
  function arrangeDuel() {
    const harmonies = {
      a: ['A2', 'E3', 'A3', 'C4', 'E4'], f: ['F2', 'C3', 'A3', 'C4', 'F4'],
      e: ['E2', 'B2', 'G#3', 'B3', 'D4'], c: ['C3', 'G3', 'G3', 'C4', 'E4'],
      d: ['D3', 'A3', 'A3', 'D4', 'F4'],
    };
    const bass = [], pulse = [], stabs = [];
    'a a f e a c d e a f d e a f d e'.split(' ').forEach((key, bar) => {
      const c = harmonies[key];
      for (let step = 0; step < 8; step++) bass.push([step % 4 === 3 ? c[1] : c[0], 0.5]);
      // 마지막 네 마디는 반복 반주를 한 옥타브 올려 몰아친다.
      for (let step = 0; step < 16; step++) {
        let n = c[2 + step % 3];
        if (bar >= 12) n = n.replace(/\d/, d => +d + 1);
        pulse.push([n, 0.25]);
      }
      stabs.push([c.slice(2), 0.5], ['-', 1], [c.slice(2), 0.5], ['-', 1.5], [c.slice(2), 0.5]);
    });
    return { bpm: 166, beats: 64, loop: true, swing: 0, tracks: [
      { voice: 'marimba', gain: 0.17, pan: -0.08, notes: phrase(DUEL) },
      { voice: 'bass', gain: 0.18, pan: 0, notes: bass },
      { voice: 'ukulele', gain: 0.052, pan: -0.35, notes: pulse },
      { voice: 'musicbox', gain: 0.045, pan: 0.35, notes: stabs },
    ], drums: { kick: [0, 1.5, 2, 2.75], brush: [1, 3, 3.75], wood: [0.75, 2.5], tick: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] } };
  }
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
    duel: arrangeDuel(),
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
  function emit(event, at, destination = bus, voices = active) {
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
      source.connect(filter).connect(envelope).connect(pan).connect(destination);
      voices.add(source);
      source.onended = () => { voices.delete(source); source.disconnect(); filter.disconnect(); envelope.disconnect(); pan.disconnect(); };
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
    stop(); current = name;
    // 첫 입력 직후엔 컨텍스트가 아직 멈춰 있어 currentTime 이 0 에 머문다. 재개가 끝난 뒤에
    // 예약을 시작해야 첫 곡이 조용히 지나가 버리지 않는다 (재개 중 다른 곡으로 바뀌면 그만둔다).
    if (ctx.state === 'suspended') {
      const wanted = name;
      ctx.resume().catch(() => {}).then(() => { if (current === wanted && !timer) begin(); });
    } else begin();
    function begin() {
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
  }
  /** 첫 사용자 입력에서 부른다 — 컨텍스트를 만들고 재개해 둔다 */
  function unlock() { try { init(); } catch (_) { return; } if (ctx.state === 'suspended') ctx.resume().catch(() => {}); }
  function setVolume(value) {
    if (!Number.isFinite(value)) return;
    volume = Math.max(0, Math.min(1, value));
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
  }
  function toggleMute() { muted = !muted; setVolume(volume); return muted; }
  // 효과음은 별도 출력으로 보내서 BGM 전환에 잘리지 않는다.
  let sfxBus, sfxVolume = 0.8, sfxMuted = false;
  const sfxVoices = new Set(), sfxLast = new Map();
  const effect = (voice, pitches, gap, length, gain) => ({ voice, pitches: pitches.split(' '), gap, length, gain });
  const EFFECTS = {
    click: effect('ukulele', 'D5', 0, 0.045, 0.11),
    place: effect('marimba', 'C4 G4', 0.045, 0.13, 0.24),
    sell: effect('musicbox', 'E6 C6', 0.07, 0.18, 0.16),
    merge: effect('marimba', 'G4 C5 E5 A5', 0.065, 0.2, 0.21),
    promote: effect('musicbox', 'C5 E5 A5 C6 E6', 0.075, 0.34, 0.19),
    craft: effect('musicbox', 'G4 D5 A5 E6 D6', 0.055, 0.32, 0.18),
    expand: effect('marimba', 'C3 G3 C4 G4', 0.065, 0.2, 0.25),
    wave: effect('marimba', 'G4 G4 C5 E5', 0.11, 0.2, 0.24),
    pick: effect('musicbox', 'G5 D6', 0.075, 0.2, 0.17),
    kill: effect('ukulele', 'G5', 0, 0.055, 0.075),
    leak: effect('marimba', 'D4 G#3 D3', 0.095, 0.21, 0.26),
    fee: effect('musicbox', 'A5 E6 A6', 0.06, 0.16, 0.13),
    skill: effect('marimba', 'A4 E5 A5 C6 E6', 0.04, 0.26, 0.21),
    win: effect('musicbox', 'G5 C6 E6 D6 C6', 0.1, 0.35, 0.18),
    lose: effect('marimba', 'E5 C5 A4 C5', 0.14, 0.25, 0.19),
    error: effect('ukulele', 'D4 D4', 0.11, 0.075, 0.19),
    sabotage: effect('marimba', 'B5 F5 C#5 G4', 0.07, 0.18, 0.22),
  };
  function sfxPlay(name) {
    const def = EFFECTS[name];
    if (!def || sfxMuted || sfxVolume === 0) return;
    try { init(); } catch (_) { return; }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    // 처치음 폭주를 억제하고 예약된 배음까지 포함해 최대 동시 발음을 제한한다.
    if (now - (sfxLast.get(name) ?? -Infinity) < (name === 'kill' ? 0.09 : 0.045)) return;
    if (sfxVoices.size + def.pitches.length * VOICES[def.voice].partials.length > 96) return;
    sfxLast.set(name, now);
    if (!sfxBus) {
      sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVolume;
      const limiter = ctx.createDynamicsCompressor();
      sfxBus.connect(limiter).connect(ctx.destination);
    }
    def.pitches.forEach((note, i) => emit({ note, voice: def.voice, gain: def.gain, length: def.length,
      pan: def.pitches.length > 2 ? (i / (def.pitches.length - 1) - 0.5) * 0.35 : 0 }, now + 0.005 + i * def.gap, sfxBus, sfxVoices));
  }
  function stopSfx() {
    if (!ctx) return;
    for (const source of sfxVoices) { try { source.stop(ctx.currentTime + 0.02); } catch (_) {} }
    sfxVoices.clear(); sfxLast.clear();
  }
  global.SFX2 = {
    play: sfxPlay, stop: stopSfx, names: Object.keys(EFFECTS),
    setVolume(value) {
      if (!Number.isFinite(value)) return;
      sfxVolume = Math.max(0, Math.min(1, value));
      if (sfxBus) sfxBus.gain.setTargetAtTime(sfxMuted ? 0 : sfxVolume, ctx.currentTime, 0.01);
    },
    setMuted(value) {
      sfxMuted = !!value;
      if (sfxBus) sfxBus.gain.setTargetAtTime(sfxMuted ? 0 : sfxVolume, ctx.currentTime, 0.01);
      if (sfxMuted) stopSfx();
    },
  };
  global.BGM2 = { play, stop, setVolume, toggleMute, unlock, get current() { return current; },
    get running() { return !!ctx && ctx.state === 'running'; }, songs: Object.keys(SONGS) };
})(window);
