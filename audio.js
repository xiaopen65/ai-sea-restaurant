/* 海上餐厅 · 像素音乐 / 音效
   全部用 Web Audio 现场合成，不带任何音频文件：
   - 背景音乐：16 小节循环（贝斯 + 琶音 + 主旋律 + 轻鼓），方波/三角波的芯片味
   - 音效：点按钮、翻木牌、交卷、拿东西时的小电子音
   对外只有 window.SeaAudio。 */
(function () {
  "use strict";

  var cfg = { bgm: true, sfx: true, bgmVol: 0.55, sfxVol: 0.7 };

  var ctx = null, master = null, musicBus = null, sfxBus = null;
  var noiseBuf = null;
  var playing = false, timer = null, step = 0, nextTime = 0, ducked = false;
  var started = false;

  /* ---------- 音名 -> 频率 ---------- */
  var SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var NOTE = /^([A-G])(#?)(-?\d)$/;
  function hz(n) {
    var m = NOTE.exec(n);
    if (!m) { return 440; }
    var s = SEMI[m[1]] + (m[2] ? 1 : 0) + (parseInt(m[3], 10) + 1) * 12;
    return 440 * Math.pow(2, (s - 69) / 12);
  }

  /* ---------- 建图 ---------- */
  function boot() {
    if (ctx) { return true; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { return false; }
    ctx = new AC();
    var soft = ctx.createBiquadFilter();
    soft.type = "lowpass";
    soft.frequency.value = 9500;
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(soft);
    soft.connect(ctx.destination);
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus.gain.value = 0;
    sfxBus.gain.value = cfg.sfx ? cfg.sfxVol : 0;
    musicBus.connect(master);
    sfxBus.connect(master);
    return true;
  }

  function levels(ramp) {
    if (!ctx) { return; }
    var m = (cfg.bgm && playing ? cfg.bgmVol : 0) * (ducked ? 0.34 : 1);
    var t = ctx.currentTime;
    if (ramp) {
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(musicBus.gain.value, t);
      musicBus.gain.linearRampToValueAtTime(m, t + ramp);
      sfxBus.gain.setValueAtTime(sfxBus.gain.value, t);
      sfxBus.gain.linearRampToValueAtTime(cfg.sfx ? cfg.sfxVol : 0, t + ramp);
    } else {
      musicBus.gain.value = m;
      sfxBus.gain.value = cfg.sfx ? cfg.sfxVol : 0;
    }
  }

  function noise() {
    if (!noiseBuf) {
      var n = Math.floor(ctx.sampleRate * 0.4);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < n; i++) { d[i] = Math.random() * 2 - 1; }
    }
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    return s;
  }

  /* 一个音：芯片味的关键是方波/三角波 + 快起音 + 稍长的尾巴 */
  function tone(wave, f, t, dur, gain, bus, glide) {
    var o = ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(f, t);
    if (glide) { o.frequency.exponentialRampToValueAtTime(glide, t + dur * 0.9); }
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.linearRampToValueAtTime(gain * 0.72, t + Math.min(dur * 0.5, 0.16));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus || musicBus);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function perc(kind, t, gain) {
    if (kind === "kick") {
      tone("sine", 130, t, 0.16, gain, musicBus, 44);
      return;
    }
    var s = noise(), f, g;
    f = ctx.createBiquadFilter();
    g = ctx.createGain();
    if (kind === "hat") {
      f.type = "highpass"; f.frequency.value = 7800;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    } else {
      f.type = "bandpass"; f.frequency.value = 1900; f.Q.value = 0.9;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    }
    s.connect(f); f.connect(g); g.connect(musicBus);
    s.start(t); s.stop(t + 0.14);
  }

  /* ---------- 曲子：16 小节，C 大调，104 BPM ----------
     b = 贝斯（第一拍根音 / 第三拍五音）
     a = 琶音（八分音符 ×8）
     m = 主旋律（音, 起始十六分, 时值十六分） */
  var BPM = 104;
  var BEAT = 60 / BPM;
  var STEP = BEAT / 4;
  var BARS = 16;
  var TOTAL = BARS * 16;

  var SONG = [
    { b: ["C3", "G2"], a: ["C4", "E4", "G4", "E4", "C5", "G4", "E4", "G4"], m: [["E5", 0, 4], ["D5", 4, 2], ["C5", 6, 2], ["G4", 8, 8]] },
    { b: ["G2", "D3"], a: ["B3", "D4", "G4", "D4", "B4", "G4", "D4", "G4"], m: [["D5", 0, 4], ["E5", 4, 2], ["D5", 6, 2], ["B4", 8, 8]] },
    { b: ["A2", "E3"], a: ["A3", "C4", "E4", "C4", "A4", "E4", "C4", "E4"], m: [["C5", 0, 4], ["A4", 4, 2], ["C5", 6, 2], ["E5", 8, 8]] },
    { b: ["F2", "C3"], a: ["A3", "C4", "F4", "C4", "A4", "F4", "C4", "F4"], m: [["D5", 0, 4], ["C5", 4, 4], ["A4", 8, 8]] },
    { b: ["C3", "G2"], a: ["C4", "E4", "G4", "E4", "C5", "G4", "E4", "G4"], m: [["E5", 0, 4], ["D5", 4, 2], ["C5", 6, 2], ["G4", 8, 8]] },
    { b: ["G2", "D3"], a: ["B3", "D4", "G4", "D4", "B4", "G4", "D4", "G4"], m: [["A4", 0, 4], ["B4", 4, 4], ["D5", 8, 8]] },
    { b: ["F2", "C3"], a: ["A3", "C4", "F4", "C4", "A4", "F4", "C4", "F4"], m: [["C5", 0, 4], ["A4", 4, 4], ["F4", 8, 8]] },
    { b: ["G2", "D3"], a: ["B3", "D4", "G4", "D4", "B4", "G4", "D4", "G4"], m: [["G4", 0, 4], ["A4", 4, 2], ["B4", 6, 2], ["D5", 8, 8]] },
    { b: ["F2", "C3"], a: ["A3", "C4", "F4", "C4", "A4", "F4", "C4", "F4"], m: [["C5", 0, 4], ["E5", 4, 2], ["D5", 6, 2], ["C5", 8, 8]] },
    { b: ["G2", "D3"], a: ["B3", "D4", "G4", "D4", "B4", "G4", "D4", "G4"], m: [["D5", 0, 4], ["E5", 4, 4], ["D5", 8, 8]] },
    { b: ["C3", "G2"], a: ["C4", "E4", "G4", "E4", "C5", "G4", "E4", "G4"], m: [["E5", 0, 4], ["G5", 4, 2], ["E5", 6, 2], ["C5", 8, 8]] },
    { b: ["A2", "E3"], a: ["A3", "C4", "E4", "C4", "A4", "E4", "C4", "E4"], m: [["C5", 0, 4], ["B4", 4, 2], ["A4", 6, 2], ["A4", 8, 8]] },
    { b: ["F2", "C3"], a: ["A3", "C4", "F4", "C4", "A4", "F4", "C4", "F4"], m: [["C5", 0, 4], ["E5", 4, 2], ["D5", 6, 2], ["C5", 8, 8]] },
    { b: ["G2", "D3"], a: ["B3", "D4", "G4", "D4", "B4", "G4", "D4", "G4"], m: [["B4", 0, 4], ["C5", 4, 2], ["D5", 6, 2], ["E5", 8, 8]] },
    { b: ["C3", "G2"], a: ["C4", "E4", "G4", "E4", "C5", "G4", "E4", "G4"], m: [["G4", 0, 4], ["C5", 4, 4], ["E5", 8, 8]] },
    { b: ["C3", "G2"], a: ["C4", "E4", "G4", "E4", "C5", "G4", "E4", "G4"], m: [["C5", 0, 16]] }
  ];

  var MEL = [];
  (function () {
    for (var i = 0; i < TOTAL; i++) { MEL.push(null); }
    SONG.forEach(function (bar, bi) {
      bar.m.forEach(function (n) { MEL[bi * 16 + n[1]] = { n: n[0], d: Math.max(0.05, n[2] * STEP * 0.94) }; });
    });
  })();

  function playStep(s, t) {
    var bar = SONG[Math.floor(s / 16)], k = s % 16;
    if (k === 0) { tone("triangle", hz(bar.b[0]), t, BEAT * 1.85, 0.17); }
    if (k === 8) { tone("triangle", hz(bar.b[1]), t, BEAT * 1.85, 0.115); }
    if (k % 2 === 0) { tone("square", hz(bar.a[k / 2]), t, STEP * 1.5, 0.032); }
    var m = MEL[s];
    if (m) { tone("square", hz(m.n), t, m.d, 0.072); }
    if (k === 0 || k === 8) { perc("kick", t, 0.30); }
    if (k === 4 || k === 12) { perc("snare", t, 0.070); }
    if (k % 2 === 1) { perc("hat", t, 0.020); }
  }

  function tick() {
    if (!ctx || !playing) { return; }
    var ahead = ctx.currentTime + 0.15;
    var guard = 0;
    while (nextTime < ahead && guard++ < 64) {
      playStep(step, nextTime);
      nextTime += STEP;
      step = (step + 1) % TOTAL;
    }
  }

  function startMusic() {
    if (!boot() || playing) { return; }
    playing = true;
    step = 0;
    nextTime = ctx.currentTime + 0.09;
    levels(0.9);
    if (timer) { clearInterval(timer); }
    timer = setInterval(tick, 25);
    tick();
  }
  function stopMusic() {
    playing = false;
    if (timer) { clearInterval(timer); timer = null; }
    levels(0.45);
  }

  /* ---------- 音效 ---------- */
  var SFX = {
    tap:   [["square", "A5", 0.000, 0.05, 0.15], ["square", "E6", 0.035, 0.06, 0.09]],
    open:  [["square", "C5", 0.000, 0.06, 0.14], ["square", "G5", 0.055, 0.11, 0.12]],
    close: [["square", "G5", 0.000, 0.06, 0.12], ["square", "C5", 0.055, 0.11, 0.12]],
    tick:  [["triangle", "E6", 0.000, 0.03, 0.13]],
    deny:  [["square", "A3", 0.000, 0.09, 0.15], ["square", "D3", 0.095, 0.16, 0.15]],
    win:   [["square", "C5", 0.000, 0.10, 0.14], ["square", "E5", 0.090, 0.10, 0.14], ["square", "G5", 0.180, 0.10, 0.14], ["square", "C6", 0.270, 0.36, 0.15]],
    item:  [["triangle", "E6", 0.000, 0.07, 0.15], ["triangle", "G6", 0.060, 0.07, 0.14], ["triangle", "B6", 0.120, 0.24, 0.12]]
  };

  function sfx(name) {
    if (!cfg.sfx) { return; }
    if (!boot()) { return; }
    if (ctx.state === "suspended") { ctx.resume(); }
    var list = SFX[name] || SFX.tap;
    var t0 = ctx.currentTime + 0.005;
    list.forEach(function (n) { tone(n[0], hz(n[1]), t0 + n[2], n[3], n[4], sfxBus); });
  }

  /* ---------- 对外 ---------- */
  window.SeaAudio = {
    sfx: sfx,
    /* 第一次点屏幕时叫一下：解开浏览器的自动播放限制，顺便把歌放起来 */
    unlock: function () {
      started = true;
      if (!boot()) { return; }
      if (ctx.state === "suspended") { ctx.resume(); }
      if (cfg.bgm && !playing) { startMusic(); }
    },
    set: function (next) {
      if (!next) { return; }
      if (typeof next.bgm === "boolean") { cfg.bgm = next.bgm; }
      if (typeof next.sfx === "boolean") { cfg.sfx = next.sfx; }
      if (typeof next.bgmVol === "number") { cfg.bgmVol = Math.max(0, Math.min(1, next.bgmVol)); }
      if (typeof next.sfxVol === "number") { cfg.sfxVol = Math.max(0, Math.min(1, next.sfxVol)); }
      if (!boot()) { return; }
      if (cfg.bgm && !playing) { if (started) { startMusic(); return; } }
      if (!cfg.bgm && playing) { stopMusic(); }
      levels(0.4);
    },
    /* 剧情/弹窗打开时把音乐压下去一点 */
    duck: function (on) { ducked = !!on; levels(0.5); },
    state: function () {
      return {
        bgm: cfg.bgm, sfx: cfg.sfx,
        bgmVol: cfg.bgmVol, sfxVol: cfg.sfxVol,
        playing: playing, ready: !!ctx, step: step
      };
    }
  };

  /* 调试用：地址后面加 ?audiodebug=1，会把当前声音状态写到 <html data-audio="..."> */
  if (location.search.indexOf("audiodebug") > -1) {
    setInterval(function () {
      var st = window.SeaAudio.state();
      document.documentElement.setAttribute("data-audio",
        "ready=" + (st.ready ? 1 : 0) +
        " playing=" + (st.playing ? 1 : 0) +
        " bgm=" + (st.bgm ? 1 : 0) +
        " sfx=" + (st.sfx ? 1 : 0) +
        " bgmVol=" + st.bgmVol.toFixed(2) +
        " sfxVol=" + st.sfxVol.toFixed(2) +
        " step=" + st.step +
        " ctx=" + (ctx ? ctx.state : "none"));
    }, 200);
  }
})();
