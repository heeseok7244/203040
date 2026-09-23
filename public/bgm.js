// 묘한특허 BGM 1 — 「특허청 라운지」. 외부 음원 없는 Web Audio 오리지널.
// 파스텔 캠퍼스와 정장 입은 고양이들에 맞춰 라운지 재즈로 짰다:
//   lobby   보사노바 · 일렉피아노 컴핑 + 비브라폰 멜로디 + 콘트라베이스 + 브러시/셰이커/림
//   battle  스윙 빅밴드 · 워킹베이스 + 라이드 + 기타 4비트 + 브라스 스탭
//   duel    스파이 재즈 · 트레몰로 스트링 + 베이스 리프 + 팀파니 + 브라스 (긴장)
//   victory 브라스 팡파레 + 비브라폰 글리산도       defeat  느린 일렉피아노 카덴차
// 엔진: 배음 합성 악기(일렉피아노·비브라폰·첼레스타·기타·베이스), 디튠 톱니파(패드·스트링·브라스),
//        합성 드럼, 컨볼루션 리버브, 점8분 딜레이, 스테레오 패닝, 스윙·액센트·휴머나이즈,
//        컴프레서, 미리 예약하는 스케줄러(오래 켜 둬도 노드가 쌓이지 않는다).
// API (game.js 가 쓰는 것):
//   BGM.play(name) / BGM.stop() / BGM.setVolume(0~1) / BGM.toggleMute() / BGM.current / BGM.songs
//   SFX.play(name) / SFX.setVolume(0~1) / SFX.setMuted(bool) / SFX.stop() / SFX.names
// 브라우저 정책상 첫 클릭·키 입력 뒤에야 소리가 난다.
(function (global) {
  'use strict';

  /* ─────────────────────────── 음이름 도구 ─────────────────────────── */
  const NOTE_IDX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midi = (n) => { const m = /^([A-G]#?)(\d)$/.exec(n); return (+m[2] + 1) * 12 + NOTE_IDX[m[1]]; };
  const name = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  const tr = (n, semis) => name(midi(n) + semis);
  const hz = (n) => 440 * Math.pow(2, (midi(n) - 69) / 12);
  /** 'E5 G5:1 -:2' — 토큰은 음:박, 박을 생략하면 반 박. 문자열 하나가 4박 한 마디. */
  const phrase = (bars) => bars.flatMap((bar) => bar.split(/\s+/).filter(Boolean).map((tok) => {
    const [n, b = '0.5'] = tok.split(':'); return [n, +b];
  }));

  /* ─────────────────────────── 화음표 ───────────────────────────
   * bass: 베이스 근음  voice: 컴핑 보이싱(중음역)  q: 성질(워킹베이스가 3·5음을 고를 때) */
  const CH = {
    Fmaj7:  { bass: 'F2',  voice: ['A3', 'C4', 'E4', 'G4'],  q: 'maj' },
    Gm7:    { bass: 'G2',  voice: ['A#3', 'D4', 'F4', 'A4'], q: 'min' },
    C7:     { bass: 'C3',  voice: ['E3', 'A#3', 'D4', 'G4'], q: 'dom' },
    Am7:    { bass: 'A2',  voice: ['G3', 'C4', 'E4', 'B4'],  q: 'min' },
    D7:     { bass: 'D3',  voice: ['F#3', 'C4', 'E4', 'A4'], q: 'dom' },
    Bbmaj7: { bass: 'A#2', voice: ['D4', 'F4', 'A4', 'C5'],  q: 'maj' },
    Dm7:    { bass: 'D3',  voice: ['F3', 'A3', 'C4', 'E4'],  q: 'min' },
    C6:     { bass: 'C3',  voice: ['E3', 'G3', 'A3', 'D4'],  q: 'maj' },
    F7:     { bass: 'F2',  voice: ['A3', 'D#4', 'G4'],       q: 'dom' },
    A7:     { bass: 'A2',  voice: ['G3', 'C#4', 'E4'],       q: 'dom' },
    A7b9:   { bass: 'A2',  voice: ['C#4', 'G4', 'A#4'],      q: 'dom' },
    G7:     { bass: 'G2',  voice: ['F3', 'B3', 'E4', 'A4'],  q: 'dom' },
    'F#dim7': { bass: 'F#2', voice: ['A3', 'C4', 'D#4'],     q: 'dim' },
    Dm:     { bass: 'D2',  voice: ['F3', 'A3', 'D4'],        q: 'min' },
    DmM7:   { bass: 'D2',  voice: ['F3', 'A3', 'C#4'],       q: 'min' },
    Gm:     { bass: 'G2',  voice: ['A#3', 'D4', 'G4'],       q: 'min' },
    Bb7:    { bass: 'A#2', voice: ['D4', 'G#4', 'C5'],       q: 'dom' },
    Bb:     { bass: 'A#2', voice: ['D4', 'F4', 'A#4'],       q: 'maj' },
    F69:    { bass: 'F2',  voice: ['A3', 'D4', 'G4', 'C5'],  q: 'maj' },
  };
  const chords = (s) => s.split(/\s+/).map((k) => { if (!CH[k]) throw new Error('chord ' + k); return CH[k]; });
  const up = (arr, semis) => arr.map((n) => tr(n, semis));

  /* ─────────────────────────── 멜로디 ─────────────────────────── */
  // 로비 — F장조, 오후의 청사 앞마당. 질문(1–8) → 대답(9–16).
  const LOBBY_MEL = [
    'A4:1 C5 E5:1.5 -:1',        '- G5 E5 C5:1 A4:1 -',
    'A#4:1 D5 F5:1.5 -:1',       'E5 G5 A5:1 G5 E5 D5:1',
    'C5:1.5 E5 G5:1 A5:1',       'F#5 E5 D5:1 C5 A4:1.5',
    'A#4 C5 D5:1.5 F5 G5:1',     'E5:2 -:2',
    'A5:1 G5 F5 E5:1 C5:1',      'D5:1 F5 A5:1.5 G5 F5',
    'E5:1.5 C5 B4:1 A4:1',       'D5 F5 A5:1 C6 A5 F5:1',
    'G5:1.5 F5 D5:1 A#4:1',      'C5 D5 E5:1 G5:1 A#5 A5',
    'F5:3 -:1',                  '-:2 C5 D5 E5 G5',
  ];
  const LOBBY_PROG = 'Fmaj7 Fmaj7 Gm7 C7 Am7 D7 Gm7 C7 Fmaj7 Bbmaj7 Am7 Dm7 Gm7 C7 Fmaj7 C7';

  // 웨이브 — C장조 스윙, 심사 개시. 블루스 기운 한 방울(A#, F#dim).
  const BATTLE_MEL = [
    'G4 A4 C5 D5 E5:1 -:1',      'E5 D5 C5 A4 G4:1.5 -',
    'F5 F5 E5 D5 C5:1 A4:1',     'A#4 A4 F4 G4 A4:2',
    'G4 A4 C5 D5 E5 G5 A5 G5',   'E5:1 C#5 E5 A5:1.5 -',
    'D5 F5 A5 C6 A5 F5 D5 F5',   'G5:1.5 F5 D5:1 B4:1',
    'C5 E5 G5 A5 C6:1 A5 G5',    'E5 G5 A#5 A5 G5 E5 C5:1',
    'F5:1 A5 C6 D6:1 C6 A5',     'A5 F#5 D#5 C5 A4:1 C5:1',
    'E5:1 G5 E5 C5:1 D5:1',      'C#5 E5 G5 A5 C#6:1 A5:1',
    'D6 C6 A5 F5 G5 F5 D5 B4',   'C5:2 - E5 G5 C6',
  ];
  const BATTLE_PROG = 'C6 C6 F7 F7 C6 A7 Dm7 G7 C6 C7 F7 F#dim7 C6 A7 Dm7 G7';

  // 1:1 대전 — D단조 스파이 재즈. 반음(C#↔D, G#↔A)으로 조이고 16분음표로 몰아친다.
  const DUEL_MEL = [
    'D5:0.25 F5:0.25 A5 D6:1 C#6 D6 -:1',            'A5 F5 D5 F5 G#5 A5:1.5',
    'A#5 A5 G5:1 D5 G5 A#5:1',                        'C#6:1 A5 E5 C#5 E5 G5 A5',
    'D6:1.5 C#6 D6 A5 F5:1',                          'A#5:1 D6 A#5 A5 G5 F5:1',
    'E5 G5 A5 C#6 E6:1 C#6 A5',                       'D6:2 -:1 D5 E5',
    'F5:0.25 G5:0.25 A5 D6 F6:1 E6 D6 C#6',           'D6 A5 F5 D5 E5 F5 G#5 A5',
    'A#5 D6 F6:1 D6 A#5 A5 G5',                       'A5:0.25 A#5:0.25 A5:0.25 G5:0.25 F5 E5 C#5:1 E5:1',
    'G5 A#5 D6 G6:1 F6 D6 A#5',                       'A5:1.5 F5 D5:1 F5 A5',
    'A#5 A5 G5 F5 E5 D5 C#5 D5',                      'E5 F5 G#5 A5 C#6:1 E6:1',
  ];
  const DUEL_PROG = 'Dm Dm Gm A7b9 Dm Bb7 A7b9 Dm Dm Dm Bb7 A7b9 Gm Dm Bb7 A7b9';

  /* ─────────────────────────── 편곡 ───────────────────────────
   * 트랙: { voice, gain, pan, rev(리버브 보냄 0~1), dly(딜레이 보냄), notes:[[음|음배열, 박], ...] }
   * 드럼: (bar) => [[박, 종류, 세기], ...]  — 마디마다 호출한다. */
  function lobby() {
    const prog = chords(LOBBY_PROG);
    const comp = [], bass = [], pad = [];
    prog.forEach((c, i) => {
      // 보사노바 컴핑 — 두 마디 단위로 엇갈리는 싱코페이션
      if (i % 2 === 0) comp.push([c.voice, 0.75], ['-', 0.75], [c.voice, 0.5], ['-', 1], [c.voice, 0.5], ['-', 0.5]);
      else comp.push(['-', 0.5], [c.voice, 0.5], ['-', 1], [c.voice, 0.75], ['-', 0.75], [c.voice, 0.5]);
      // 베이스 — 근음 길게, 5도 짧게 (근음이 높으면 5도는 아래로)
      const fifth = midi(c.bass) > midi('D3') ? tr(c.bass, -5) : tr(c.bass, 7);
      bass.push([c.bass, 1.5], [fifth, 0.5], [c.bass, 1.5], [fifth, 0.5]);
      pad.push([up(c.voice, i >= 8 ? 12 : 0), 4]);
    });
    return { bpm: 88, beats: 64, loop: true, swing: 0.05, tracks: [
      { voice: 'vibes',  gain: 0.20, pan: 0.15,  rev: 0.5,  dly: 0.22, notes: phrase(LOBBY_MEL) },
      { voice: 'epiano', gain: 0.10, pan: -0.25, rev: 0.35, notes: comp },
      { voice: 'bass',   gain: 0.30, pan: 0,     rev: 0.08, notes: bass },
      { voice: 'pad',    gain: 0.035, pan: 0.1,  rev: 0.7,  notes: pad },
    ], drums: (bar) => {
      const clave = bar % 2 === 0 ? [[0, 'rim', 0.9], [1.5, 'rim', 0.8], [3, 'rim', 0.9]] : [[1, 'rim', 0.8], [2.5, 'rim', 0.9]];
      const shaker = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((p) => [p, 'shaker', p % 1 ? 0.9 : 0.55]);
      return [...clave, ...shaker, [0, 'kick', 0.55], [1.5, 'kick', 0.35], [2, 'kick', 0.55], [1, 'brush', 0.6], [3, 'brush', 0.7]];
    } };
  }

  function battle() {
    const prog = chords(BATTLE_PROG);
    const guitar = [], bass = [], brass = [], comp = [];
    prog.forEach((c, i) => {
      const next = prog[(i + 1) % prog.length];
      guitar.push([c.voice, 0.5], ['-', 0.5], [c.voice, 0.5], ['-', 0.5], [c.voice, 0.5], ['-', 0.5], [c.voice, 0.5], ['-', 0.5]);
      // 워킹 베이스 — 근음·3음·5음·다음 근음으로 가는 반음 접근
      const r = midi(c.bass), third = r + (c.q === 'maj' || c.q === 'dom' ? 4 : 3), fifth = r + (c.q === 'dim' ? 6 : 7);
      const nr = midi(next.bass), approach = i % 2 ? nr - 1 : nr + 1;
      const clamp = (m) => { while (m > midi('A3')) m -= 12; while (m < midi('E2')) m += 12; return name(m); };
      const walk = i % 2 ? [r, third, fifth, approach] : [r, fifth, third, approach];
      walk.forEach((m) => bass.push([clamp(m), 1]));
      // 브라스 스탭 — 4마디 프레이즈 끝을 찌른다
      if (i % 4 === 3) brass.push(['-', 2.5], [up(c.voice, 12), 0.25], ['-', 0.75], [up(next.voice, 12), 0.5]);
      else if (i % 4 === 1) brass.push(['-', 3.5], [up(c.voice, 12), 0.25], ['-', 0.25]);
      else brass.push(['-', 4]);
      comp.push([c.voice, 0.75], ['-', 0.75], [c.voice, 0.5], ['-', 2]);   // 찰스턴 리듬
    });
    return { bpm: 128, beats: 64, loop: true, swing: 0.16, tracks: [
      { voice: 'epiano', gain: 0.22, pan: 0.1,   rev: 0.35, dly: 0.12, notes: phrase(BATTLE_MEL) },
      { voice: 'epiano', gain: 0.07, pan: -0.3,  rev: 0.3,  notes: comp },
      { voice: 'guitar', gain: 0.05, pan: -0.45, rev: 0.2,  notes: guitar },
      { voice: 'bass',   gain: 0.28, pan: 0,     rev: 0.06, notes: bass },
      { voice: 'brass',  gain: 0.13, pan: 0.3,   rev: 0.4,  notes: brass },
    ], drums: (bar) => {
      const out = [[0, 'ride', 1], [1, 'ride', 0.85], [1.5, 'ride', 0.6], [2, 'ride', 1], [3, 'ride', 0.85], [3.5, 'ride', 0.6],
                   [1, 'pedal', 0.8], [3, 'pedal', 0.8], [0, 'kick', 0.4], [2, 'kick', 0.35], [1, 'brush', 0.5], [3, 'brush', 0.5]];
      if (bar % 4 === 3) out.push([3, 'snare', 0.5], [3.5, 'snare', 0.6], [3.75, 'snare', 0.8]);
      if (bar % 8 === 7) out.push([2.5, 'snare', 0.45]);
      return out;
    } };
  }

  function duel() {
    const prog = chords(DUEL_PROG);
    const strings = [], bass = [], brass = [], hi = [];
    prog.forEach((c, i) => {
      strings.push([up(c.voice, 12), 4]);
      // 베이스 리프 — 근음 위에서 3·5·b6·5·3 으로 굴러내리는 8분음표
      const r = midi(c.bass) - (midi(c.bass) >= midi('A2') ? 12 : 0);
      const riff = c.q === 'dom' ? [0, 0, 4, 7, 8, 7, 4, 0] : [0, 0, 3, 5, 6, 5, 3, 0];
      riff.forEach((s) => bass.push([name(r + s), 0.5]));
      if (i % 2 === 1) brass.push(['-', 0.5], [up(c.voice, 12), 0.25], ['-', 0.75], [up(c.voice, 12), 0.25], ['-', 1.75], [up(c.voice, 12), 0.5]);
      else brass.push(['-', 3.5], [up(c.voice, 12), 0.25], ['-', 0.25]);
      // 후반 8마디: 첼레스타가 한 옥타브 위에서 스탭을 겹쳐 압박을 올린다
      hi.push(i >= 8 ? [['-', 1.5], [up(c.voice, 24), 0.25], ['-', 2.25]] : [['-', 4]]);
    });
    return { bpm: 152, beats: 64, loop: true, swing: 0.1, tracks: [
      { voice: 'vibes',   gain: 0.20, pan: 0.12,  rev: 0.45, dly: 0.2, notes: phrase(DUEL_MEL) },
      { voice: 'strings', gain: 0.055, pan: -0.2, rev: 0.6,  notes: strings },
      { voice: 'bass',    gain: 0.30, pan: 0,     rev: 0.05, notes: bass },
      { voice: 'brass',   gain: 0.12, pan: 0.35,  rev: 0.4,  notes: brass },
      { voice: 'celesta', gain: 0.06, pan: -0.4,  rev: 0.5,  notes: hi.flat() },
    ], drums: (bar) => {
      const out = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((p) => [p, 'ride', p % 1 ? 0.55 : 0.95]);
      out.push([0, 'kick', 0.7], [1.5, 'kick', 0.5], [2, 'kick', 0.7], [2.75, 'kick', 0.45],
               [1, 'snare', 0.7], [3, 'snare', 0.8], [1, 'pedal', 0.7], [3, 'pedal', 0.7]);
      if (bar % 2 === 1) out.push([3.75, 'snare', 0.6]);
      if (bar % 4 === 0) out.push([0, 'timpani', 0.9]);
      if (bar % 4 === 3) out.push([3.5, 'timpani', 0.8], [3.5, 'snare', 0.9]);
      return out;
    } };
  }

  const SONGS = {
    lobby: lobby(), battle: battle(), duel: duel(),
    victory: { bpm: 120, beats: 12, loop: false, swing: 0, tracks: [
      { voice: 'brass',   gain: 0.16, pan: 0.2,  rev: 0.5, notes: [[['C5', 'F5', 'A5'], 0.5], ['-', 0.5], [['C5', 'F5', 'A5'], 0.5], [['D5', 'G5', 'A#5'], 1], [['C5', 'E5', 'G5', 'A#5'], 1.5],
                                                                       [['F5', 'A5', 'C6', 'D6'], 3], ['-', 1], [['A4', 'C5', 'F5', 'G5', 'D6'], 4]] },
      { voice: 'vibes',   gain: 0.18, pan: -0.2, rev: 0.6, dly: 0.25, notes: phrase(['-:2 F4:0.25 A4:0.25 C5:0.25 E5:0.25 G5:0.25 A5:0.25 C6:0.25 E6:0.25', 'F6:1.5 D6 C6:1 A5:1', 'G5:0.25 A5:0.25 C6:0.25 D6:0.25 F6:3']) },
      { voice: 'epiano',  gain: 0.09, pan: 0,    rev: 0.4, notes: [[CH.Gm7.voice, 2], [CH.C7.voice, 2], [CH.Fmaj7.voice, 4], [CH.F69.voice, 4]] },
      { voice: 'bass',    gain: 0.28, pan: 0,    rev: 0.05, notes: [['G2', 1], ['A#2', 1], ['C3', 1], ['E3', 1], ['F2', 4], ['F2', 4]] },
    ], drums: (bar) => bar === 0 ? [[0, 'kick', 0.6], [1, 'snare', 0.5], [2, 'kick', 0.6], [3, 'snare', 0.7], [3.5, 'snare', 0.8], [3.75, 'snare', 0.9]]
                     : bar === 1 ? [[0, 'kick', 0.8], [0, 'ride', 1], [0, 'timpani', 0.7], [2, 'ride', 0.7]]
                     : [[0, 'kick', 0.7], [0, 'ride', 1]] },
    defeat: { bpm: 72, beats: 8, loop: false, swing: 0, tracks: [
      { voice: 'epiano',  gain: 0.20, pan: 0.1,  rev: 0.55, dly: 0.15, notes: phrase(['A4:1 F4 E4 D4:1.5 -', 'C#5:1 D5:3']) },
      { voice: 'epiano',  gain: 0.08, pan: -0.2, rev: 0.5, notes: [[CH.Dm.voice, 2], [CH.Bb.voice, 2], [CH.A7b9.voice, 2], [CH.DmM7.voice, 2]] },
      { voice: 'strings', gain: 0.04, pan: 0.2,  rev: 0.7, notes: [[up(CH.Dm.voice, 12), 2], [up(CH.Bb.voice, 12), 2], [up(CH.A7b9.voice, 12), 2], [up(CH.DmM7.voice, 12), 2]] },
      { voice: 'bass',    gain: 0.26, pan: 0,    rev: 0.05, notes: [['D2', 2], ['A#2', 2], ['A2', 2], ['D2', 2]] },
    ], drums: (bar) => bar === 0 ? [[0, 'timpani', 0.6], [2, 'brush', 0.5]] : [[0, 'brush', 0.4], [2, 'timpani', 0.5]] },
  };

  /* ─────────────────────────── 악기 ───────────────────────────
   * additive: 배음 [비율, 세기, 감쇠 배율] — 배음마다 다르게 죽어서 타건감이 난다.
   * detune  : 디튠 톱니파 겹치기(패드·스트링·브라스). filter 는 로우패스 컷오프, fenv 는 어택 때 열리는 양.
   * trem    : [Hz, 깊이] 트레몰로.  sustain: 음 길이만큼 유지 후 release 로 놓는다. */
  const VOICES = {
    epiano:  { additive: [[1, 1, 1], [2, 0.32, 0.45], [3, 0.07, 0.25], [7, 0.025, 0.12]], length: 1.8, attack: 0.004, filter: 5200 },
    vibes:   { additive: [[1, 1, 1], [4, 0.14, 0.45], [10, 0.02, 0.15]], length: 2.4, attack: 0.003, filter: 7000, trem: [4.6, 0.32] },
    celesta: { additive: [[1, 1, 1], [3, 0.28, 0.4], [5, 0.09, 0.25], [8, 0.03, 0.1]], length: 1.3, attack: 0.002, filter: 9000 },
    guitar:  { additive: [[1, 1, 1], [2, 0.42, 0.55], [3, 0.22, 0.4], [4, 0.1, 0.3], [5, 0.04, 0.2]], length: 0.6, attack: 0.006, filter: 3000 },
    bass:    { additive: [[1, 1, 1], [2, 0.55, 0.6], [3, 0.18, 0.35], [4, 0.06, 0.2]], length: 1.0, attack: 0.012, filter: 520 },
    pad:     { detune: [-9, 0, 9], wave: 'sawtooth', filter: 800, attack: 0.5, release: 0.6, sustain: true },
    strings: { detune: [-11, -4, 4, 11], wave: 'sawtooth', filter: 1600, attack: 0.12, release: 0.35, sustain: true, trem: [6.8, 0.42] },
    brass:   { detune: [-6, 6], wave: 'sawtooth', filter: 900, fenv: 2600, attack: 0.025, release: 0.08, sustain: true },
  };

  let ctx, master, comp, reverb, reverbGain, delay, delayGain, delayFb, noiseBuf;
  let bus = null, timer = null, current = null, volume = 0.6, muted = false;
  const active = new Set();

  function init() {
    if (ctx) return;
    ctx = new (global.AudioContext || global.webkitAudioContext)();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = muted ? 0 : volume; master.connect(comp);
    // 리버브 — 2.4초 감쇠하는 스테레오 노이즈 임펄스 (홀 느낌)
    const sr = ctx.sampleRate, len = Math.floor(sr * 2.4), ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (i < sr * 0.02 ? i / (sr * 0.02) : 1);
    }
    reverb = ctx.createConvolver(); reverb.buffer = ir;
    const rvLp = ctx.createBiquadFilter(); rvLp.type = 'lowpass'; rvLp.frequency.value = 4200;
    reverbGain = ctx.createGain(); reverbGain.gain.value = 0.32;
    reverb.connect(rvLp).connect(reverbGain).connect(master);
    // 딜레이 — 곡마다 점8분으로 맞춘다
    delay = ctx.createDelay(2); delay.delayTime.value = 0.35;
    delayFb = ctx.createGain(); delayFb.gain.value = 0.28;
    const dlLp = ctx.createBiquadFilter(); dlLp.type = 'lowpass'; dlLp.frequency.value = 2600;
    delayGain = ctx.createGain(); delayGain.gain.value = 0.5;
    delay.connect(dlLp).connect(delayFb).connect(delay);
    dlLp.connect(delayGain).connect(master);
    dlLp.connect(reverb);
    noiseBuf = ctx.createBuffer(1, Math.ceil(sr * 0.5), sr);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  function track(src, voices) {
    voices.add(src);
    src.onended = () => { voices.delete(src); try { src.disconnect(); } catch (_) {} };
  }

  /** 음 하나. ev: { note, voice, gain, length, pan, rev, dly } */
  function playNote(ev, at, dest, voices) {
    const v = VOICES[ev.voice]; if (!v) return;
    const f = hz(ev.note);
    const out = ctx.createGain(); out.gain.value = 1;
    const pan = ctx.createStereoPanner(); pan.pan.value = ev.pan || 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = v.filter; lp.Q.value = 0.7;
    out.connect(lp).connect(pan).connect(dest);
    if (ev.rev) { const s = ctx.createGain(); s.gain.value = ev.rev; pan.connect(s).connect(reverb); }
    if (ev.dly) { const s = ctx.createGain(); s.gain.value = ev.dly; pan.connect(s).connect(delay); }
    let end;
    if (v.sustain) {
      const hold = Math.max(0.05, ev.length);
      end = at + hold + v.release;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(ev.gain, at + v.attack);
      env.gain.setValueAtTime(ev.gain, at + hold);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      env.connect(out);
      if (v.fenv) { lp.frequency.setValueAtTime(v.filter + v.fenv, at); lp.frequency.exponentialRampToValueAtTime(v.filter, at + 0.18); }
      for (const cents of v.detune) {
        const o = ctx.createOscillator(); o.type = v.wave; o.frequency.value = f; o.detune.value = cents;
        o.connect(env); o.start(at); o.stop(end + 0.05); track(o, voices);
      }
    } else {
      end = at;
      for (const [ratio, level, decay] of v.additive) {
        if (f * ratio > 16000) continue;
        const len = Math.max(0.06, Math.min(ev.length * 1.6, v.length) * decay);
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * ratio;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, at);
        env.gain.linearRampToValueAtTime(ev.gain * level, at + v.attack);
        env.gain.exponentialRampToValueAtTime(0.0001, at + len);
        o.connect(env).connect(out); o.start(at); o.stop(at + len + 0.05); track(o, voices);
        end = Math.max(end, at + len);
      }
    }
    if (v.trem) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = v.trem[0]; depth.gain.value = v.trem[1];
      out.gain.value = 1 - v.trem[1];
      lfo.connect(depth).connect(out.gain); lfo.start(at); lfo.stop(end + 0.1); track(lfo, voices);
    }
  }

  function noise(at, dest, voices, { hp, bp, lp, q = 1, len, gain, attack = 0.001, pan = 0 }) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    if (bp) { f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = q; }
    else if (hp) { f.type = 'highpass'; f.frequency.value = hp; }
    else { f.type = 'lowpass'; f.frequency.value = lp; }
    const g = ctx.createGain(), p = ctx.createStereoPanner(); p.pan.value = pan;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    s.connect(f).connect(g).connect(p).connect(dest); s.start(at); s.stop(at + len + 0.02); track(s, voices);
  }
  function thump(at, dest, voices, { f0, f1, len, gain, pan = 0, type = 'sine', rev = 0 }) {
    const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner(); p.pan.value = pan;
    o.type = type; o.frequency.setValueAtTime(f0, at); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + len * 0.6);
    g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(p).connect(dest);
    if (rev) { const s = ctx.createGain(); s.gain.value = rev; p.connect(s).connect(reverb); }
    o.start(at); o.stop(at + len + 0.02); track(o, voices);
  }
  function playDrum(kind, vel, at, dest, voices) {
    switch (kind) {
      case 'kick':    thump(at, dest, voices, { f0: 115, f1: 44, len: 0.28, gain: 0.55 * vel }); noise(at, dest, voices, { lp: 1200, len: 0.02, gain: 0.12 * vel }); break;
      case 'snare':   noise(at, dest, voices, { bp: 1900, q: 0.8, len: 0.16, gain: 0.2 * vel, pan: -0.1 }); thump(at, dest, voices, { f0: 190, f1: 150, len: 0.09, gain: 0.22 * vel, type: 'triangle' }); break;
      case 'brush':   noise(at, dest, voices, { lp: 2800, len: 0.22, gain: 0.06 * vel, attack: 0.04, pan: -0.15 }); break;
      case 'shaker':  noise(at, dest, voices, { bp: 8200, q: 1.4, len: 0.09, gain: 0.05 * vel, attack: 0.02, pan: 0.35 }); break;
      case 'pedal':   noise(at, dest, voices, { hp: 6500, len: 0.05, gain: 0.035 * vel, pan: 0.2 }); break;
      case 'rim':     thump(at, dest, voices, { f0: 1750, f1: 1750, len: 0.025, gain: 0.14 * vel, pan: -0.3, type: 'triangle' }); noise(at, dest, voices, { bp: 3200, q: 2, len: 0.03, gain: 0.08 * vel, pan: -0.3 }); break;
      case 'ride':    noise(at, dest, voices, { bp: 7400, q: 1.2, len: 0.06, gain: 0.04 * vel, pan: 0.3 });
                      [1, 1.47, 2.09, 2.98].forEach((r) => thump(at, dest, voices, { f0: 640 * r, f1: 640 * r, len: 0.55, gain: 0.011 * vel, pan: 0.3, rev: 0.3 })); break;
      case 'timpani': thump(at, dest, voices, { f0: 84, f1: 72, len: 0.8, gain: 0.5 * vel, rev: 0.5 }); noise(at, dest, voices, { lp: 400, len: 0.09, gain: 0.25 * vel }); break;
    }
  }

  /* ─────────────────────────── 스케줄러 ─────────────────────────── */
  let events = [], cursor = 0, origin = 0, cycle = 0, duration = 0;
  function compile(song) {
    const beat = 60 / song.bpm, list = [];
    const swung = (pos) => pos + (pos % 1 === 0.5 ? (song.swing || 0) : 0);
    for (const t of song.tracks) {
      let pos = 0;
      for (const [pitch, count] of t.notes) {
        const notes = Array.isArray(pitch) ? pitch : [pitch];
        notes.forEach((n, k) => {
          if (n === '-') return;
          const accent = pos % 4 === 0 ? 1 : pos % 1 === 0 ? 0.92 : 0.82;
          list.push({ time: swung(pos) * beat + k * 0.012, note: n, voice: t.voice, length: count * beat,
                      gain: t.gain * accent / (notes.length > 1 ? Math.sqrt(notes.length) : 1), pan: t.pan || 0, rev: t.rev || 0, dly: t.dly || 0 });
        });
        pos += count;
      }
    }
    for (let bar = 0; bar * 4 < song.beats; bar++)
      for (const [p, kind, vel] of song.drums(bar)) list.push({ time: (bar * 4 + swung(p)) * beat, drum: kind, vel: vel == null ? 1 : vel });
    list.sort((a, b) => a.time - b.time);
    return { list, duration: song.beats * beat };
  }
  function emit(ev, at) {
    // 휴머나이즈 — 아주 작은 시간·세기 흔들림
    const t = at + (Math.random() - 0.5) * 0.006;
    if (ev.drum) playDrum(ev.drum, ev.vel * (0.94 + Math.random() * 0.12), t, bus, active);
    else playNote({ ...ev, gain: ev.gain * (0.95 + Math.random() * 0.1) }, t, bus, active);
  }
  function stop() {
    if (timer) clearInterval(timer); timer = null; current = null;
    if (!ctx || !bus) return;
    const old = bus; bus = null;
    old.gain.cancelScheduledValues(ctx.currentTime);
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    for (const s of active) { try { s.stop(ctx.currentTime + 0.25); } catch (_) {} }
    active.clear();
    setTimeout(() => { try { old.disconnect(); } catch (_) {} }, 600);
  }
  function play(name) {
    const song = SONGS[name];
    if (!song) { console.warn('[BGM] unknown song:', name); return; }
    init();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    stop(); current = name;
    bus = ctx.createGain(); bus.gain.value = 1; bus.connect(master);
    delay.delayTime.setTargetAtTime((60 / song.bpm) * 0.75, ctx.currentTime, 0.05);
    ({ list: events, duration } = compile(song));
    cursor = 0; cycle = 0; origin = ctx.currentTime + 0.06;
    const schedule = () => {
      const now = ctx.currentTime;
      if (song.loop && now > origin + (cycle + 1) * duration) { cycle = Math.floor((now - origin) / duration); cursor = 0; }
      for (;;) {
        if (cursor === events.length) {
          if (!song.loop) { if (now >= origin + duration + 0.5) { clearInterval(timer); timer = null; current = null; } return; }
          cursor = 0; cycle++;
        }
        const ev = events[cursor], at = origin + cycle * duration + ev.time;
        if (at > now + 0.2) return;
        if (at >= now - 0.03) emit(ev, Math.max(now + 0.001, at));
        cursor++;
      }
    };
    timer = setInterval(schedule, 30); schedule();
  }
  function setVolume(v) {
    if (!Number.isFinite(v)) return;
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
  }
  function toggleMute() { muted = !muted; setVolume(volume); return muted; }
  global.BGM = { play, stop, setVolume, toggleMute, get current() { return current; }, songs: Object.keys(SONGS) };

  /* ─────────────────────────── 효과음 ───────────────────────────
   * 같은 악기로 만든다 — 음악과 결이 같아야 「한 게임의 소리」로 들린다.
   * fx(악기, '음 음+음 ...', 음 사이 간격(초), 음 길이(초), 세기, 리버브)  '+' 로 묶으면 동시에 울린다 */
  let sfxBus = null, sfxVolume = 0.8, sfxMuted = false;
  const sfxVoices = new Set(), sfxLast = new Map();
  const fx = (voice, pitches, gap, length, gain, rev = 0.3) => ({ voice, pitches: pitches.split(' ').map((p) => p.split('+')), gap, length, gain, rev });
  const EFFECTS = {
    click:    fx('celesta', 'A5', 0, 0.05, 0.10, 0.1),
    place:    fx('epiano',  'F4 C5', 0.05, 0.16, 0.24),
    sell:     fx('vibes',   'G5 E5 C5', 0.06, 0.18, 0.15),
    merge:    fx('celesta', 'F5 A5 C6 F6', 0.06, 0.22, 0.18, 0.45),
    promote:  fx('celesta', 'F5 A5 C6 E6 G6 A6+C7+F7', 0.07, 0.4, 0.17, 0.55),
    craft:    fx('vibes',   'D5 F#5 A5 C#6 E6+G#6', 0.05, 0.35, 0.16, 0.5),
    expand:   fx('bass',    'F2 C3 F3', 0.07, 0.3, 0.32, 0.2),
    wave:     fx('brass',   'C5+F5 C5+F5 D5+G5 F5+A5+C6', 0.11, 0.16, 0.14, 0.4),
    pick:     fx('celesta', 'C6 G6', 0.07, 0.2, 0.15, 0.4),
    kill:     fx('celesta', 'A6', 0, 0.06, 0.06, 0.15),
    leak:     fx('brass',   'D4+G#4 C#4+G4 C4+F#4', 0.1, 0.18, 0.13, 0.35),
    fee:      fx('epiano',  'C#5+D5 C#5+D5', 0.13, 0.16, 0.14),
    skill:    fx('vibes',   'A4 C#5 E5 G5 A#5 C#6+E6', 0.035, 0.32, 0.15, 0.5),
    win:      fx('celesta', 'F5 A5 C6 E6 G6+C7', 0.09, 0.4, 0.17, 0.55),
    lose:     fx('epiano',  'A4 F4 E4 D4+A4', 0.15, 0.3, 0.16, 0.5),
    error:    fx('epiano',  'A#2+E3 A#2+E3', 0.11, 0.08, 0.2, 0.05),
    sabotage: fx('brass',   'B4+F5 A#4+E5 A4+D#5 G#4+D5', 0.07, 0.15, 0.13, 0.4),
  };
  function sfxPlay(name) {
    const def = EFFECTS[name];
    if (!def || sfxMuted || sfxVolume === 0) return;
    try { init(); } catch (_) { return; }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    if (now - (sfxLast.get(name) ?? -Infinity) < (name === 'kill' ? 0.09 : 0.045)) return;   // 폭주 억제
    if (sfxVoices.size > 140) return;
    sfxLast.set(name, now);
    if (!sfxBus) { sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVolume; sfxBus.connect(comp); }
    def.pitches.forEach((group, i) => group.forEach((note, k) => playNote({
      note, voice: def.voice, gain: def.gain / (group.length > 1 ? Math.sqrt(group.length) : 1), length: def.length, rev: def.rev,
      pan: def.pitches.length > 2 ? (i / (def.pitches.length - 1) - 0.5) * 0.4 : 0,
    }, now + 0.005 + i * def.gap + k * 0.008, sfxBus, sfxVoices)));
  }
  function stopSfx() {
    if (!ctx) return;
    for (const s of sfxVoices) { try { s.stop(ctx.currentTime + 0.02); } catch (_) {} }
    sfxVoices.clear(); sfxLast.clear();
  }
  global.SFX = {
    play: sfxPlay, stop: stopSfx, names: Object.keys(EFFECTS),
    setVolume(v) { if (!Number.isFinite(v)) return; sfxVolume = Math.max(0, Math.min(1, v)); if (sfxBus) sfxBus.gain.setTargetAtTime(sfxMuted ? 0 : sfxVolume, ctx.currentTime, 0.01); },
    setMuted(m) { sfxMuted = !!m; if (sfxBus) sfxBus.gain.setTargetAtTime(sfxMuted ? 0 : sfxVolume, ctx.currentTime, 0.01); if (sfxMuted) stopSfx(); },
  };
})(window);
