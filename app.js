/* 海上餐厅 · 行动地图（新版） · 交互脚本 */
(function () {
  "use strict";

  var KEY = "sea-restaurant-v3";
  var ASSET_V = "7";   // 换头像/地图以后把这个数字 +1，浏览器就不会再用旧图
  var SPEAKERS = window.SPEAKERS || {};
  var ACTS = window.ACTS || [];
  var FACES = window.PLAYER_FACES || [];
  var ITEMS = window.ITEMS || {};
  var ICONS = window.ICONS || {};
  var PX = window.PX || {};

  var state = { player: null, done: {}, free: false, poster: "", seen: {}, bgm: true, sfx: true, bgmVol: 0.55, sfxVol: 0.7 };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- 存档 ---------------- */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { state = JSON.parse(raw); }
    } catch (e) {}
    if (!state || typeof state !== "object") { state = { player: null, done: {}, free: false, poster: "", seen: {} }; }
    state.done = state.done || {};
    state.poster = state.poster || "";
    state.seen = state.seen || {};
    state.bgm = state.bgm !== false;
    state.sfx = state.sfx !== false;
    state.bgmVol = typeof state.bgmVol === "number" ? state.bgmVol : 0.55;
    state.sfxVol = typeof state.sfxVol === "number" ? state.sfxVol : 0.7;
  }

  function actById(id) {
    for (var i = 0; i < ACTS.length; i++) { if (ACTS[i].id === id) { return ACTS[i]; } }
    return null;
  }
  function actDone(id) { return !!state.done[id]; }
  function frontOpen() { return state.free || actDone(5); }

  function asset(p) { return p ? p + "?v=" + ASSET_V : p; }

  /* ---------------- 说话人 ---------------- */
  function speaker(who) {
    if (who === "y") {
      return { name: (state.player && state.player.name) || "你", img: faceOf(state.player) };
    }
    var s = SPEAKERS[who];
    if (!s) { return { name: "", img: "" }; }
    return { name: s.name, img: asset(s.img) };
  }
  function faceOf(p) {
    if (!p) { return ""; }
    for (var i = 0; i < FACES.length; i++) { if (FACES[i].id === p.face) { return asset(FACES[i].img); } }
    return FACES[0] ? asset(FACES[0].img) : "";
  }

  /* ---------------- 1. 出海前 ---------------- */
  var picking = { gender: "男", face: "" };

  function renderFaces() {
    var box = $("faces");
    box.innerHTML = "";
    var list = FACES.filter(function (f) { return (f.gender || "男") === picking.gender; });
    var keep = false;
    list.forEach(function (f) { if (f.id === picking.face) { keep = true; } });
    if (!keep) { picking.face = list[0] ? list[0].id : ""; }
    list.forEach(function (f) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "face" + (picking.face === f.id ? " is-on" : "");
      b.innerHTML = '<img src="' + asset(f.img) + '" alt=""><span class="face__tag">' + f.tag + "</span>";
      b.onclick = function () { picking.face = f.id; renderFaces(); };
      box.appendChild(b);
    });
    $("setupTip").textContent = "挑一个最像你的。只是一张脸，不影响任何剧情。";
    refreshStart();
  }

  function refreshStart() {
    $("startBtn").disabled = !($("nameInput").value.trim() && picking.face);
  }

  function initSetup() {
    $("genderSeg").onclick = function (e) {
      var t = e.target.closest(".seg__btn");
      if (!t) { return; }
      picking.gender = t.dataset.gender;
      Array.prototype.forEach.call(document.querySelectorAll(".seg__btn"), function (b) {
        b.classList.toggle("is-on", b === t);
      });
      renderFaces();
    };
    $("nameInput").oninput = refreshStart;
    $("startBtn").onclick = function () {
      state.player = {
        name: $("nameInput").value.trim(),
        gender: picking.gender,
        face: picking.face
      };
      save();
      $("setup").hidden = true;
      showGame();
    };
    picking.face = FACES[0] ? FACES[0].id : "";
    renderFaces();
  }

  /* ---------------- 2. 地图 ---------------- */
  /* 竖屏手持设备：判定要不要把整个画面转 90° 显示 */
  function isFlip() {
    if (document.documentElement.classList.contains("flip-force")) { return true; }
    if (window.innerHeight <= window.innerWidth) { return false; }
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    return !!coarse || Math.min(window.innerWidth, window.innerHeight) <= 560;
  }

  function scaleStage() {
    var vw = window.innerWidth, vh = window.innerHeight;
    if (isFlip()) { var t = vw; vw = vh; vh = t; }
    var s = Math.max(vw / 1200, vh / 800);
    $("stage").style.transform = "translate(-50%, -50%) scale(" + s + ")";
  }

  /* 把「逻辑视口」写进 --pw / --ph：竖屏转 90° 之后，宽高是对调的
     顺便给 html 挂上 is-short / is-narrow，CSS 里就不用再写媒体查询
     （竖屏时物理高度是竖的，max-height 媒体查询根本量不到真正的画面高度） */
  function syncUnits(on) {
    var w = window.innerWidth, h = window.innerHeight;
    var pw = on ? h : w;
    var ph = on ? w : h;
    var st = document.documentElement.style;
    st.setProperty("--pw", pw + "px");
    st.setProperty("--ph", ph + "px");
    document.documentElement.classList.toggle("is-short", ph <= 480);
    document.documentElement.classList.toggle("is-narrow", pw <= 560);
  }

  var rotHinted = false;
  function applyFlip() {
    var on = isFlip();
    document.documentElement.classList.toggle("is-flip", on);
    syncUnits(on);
    scaleStage();
    var hint = $("rotateHint");
    if (!hint) { return; }
    if (on && !rotHinted) {
      rotHinted = true;
      hint.classList.add("is-on");
      setTimeout(function () { hint.classList.remove("is-on"); }, 5200);
    } else if (!on) {
      rotHinted = false;
      hint.classList.remove("is-on");
    }
  }

  function unlocked(act) {
    if (state.free) { return true; }
    if (act.id === 0) { return true; }
    return actDone(act.id - 1);
  }

  function renderNodes() {
    var box = $("nodes");
    box.innerHTML = "";
    var open = frontOpen();
    var pts = [];

    ACTS.forEach(function (act) {
      var far = act.id >= 6;
      if (far && !open) { return; }

      var ok = unlocked(act);
      var fin = actDone(act.id);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "node " + (fin ? "node--done" : ok ? "node--now" : "node--lock");
      b.style.left = act.map.x + "px";
      b.style.top = act.map.y + "px";
      b.innerHTML =
        '<div class="node__board">' +
          '<span class="node__no">' + (act.id === 0 ? "序" : act.id) + "</span>" +
          '<span class="node__state">' + (fin ? "已完成" : ok ? "可以开始" : "未解锁") + "</span>" +
        "</div>" +
        '<div class="node__post"></div>';
      b.onclick = function () {
        if (!ok) { flashHint("这块木牌还没亮。先把上一关走完。"); return; }
        openAct(act);
      };
      box.appendChild(b);
      pts.push(act);
    });

    var svg = $("trail");
    var seg = "";
    for (var i = 0; i < pts.length - 1; i++) {
      var A = pts[i], B = pts[i + 1];
      var doneSeg = actDone(A.id);
      seg += '<line x1="' + A.map.x + '" y1="' + A.map.y + '" x2="' + B.map.x + '" y2="' + B.map.y + '" ' +
        'stroke="' + (doneSeg ? "#f2c96b" : "#8fa9c0") + '" stroke-width="3" stroke-dasharray="10 9" ' +
        'opacity="' + (doneSeg ? "0.75" : "0.28") + '" stroke-linecap="round"/>';
    }
    svg.innerHTML = seg;

    $("fog").hidden = open;
  }

  var hintTimer = null;
  function flashHint(msg) {
    $("hint").textContent = msg;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { $("hint").textContent = DEFAULT_HINT; }, 3000);
  }
  var DEFAULT_HINT = "";

  function refreshHud() {
    var total = 15;
    var n = 0;
    for (var i = 1; i <= 15; i++) { if (actDone(i)) { n++; } }
    $("progressNum").textContent = n;
    $("progressTotal").textContent = total;
    $("progressFill").style.width = (n / total * 100) + "%";
    if (state.player) {
      $("meName").textContent = state.player.name;
      $("meFace").src = faceOf(state.player);
    }
    var fresh = 0;
    for (var k = 1; k <= 15; k++) { if (actDone(k) && ITEMS[k] && !state.seen[k]) { fresh++; } }
    $("bagDot").textContent = fresh;
    $("bagDot").hidden = fresh === 0;
    $("setFree").textContent = state.free ? "开" : "关";
  }

  function showGame() {
    $("game").hidden = false;
    $("stageMap").src = asset("assets/map/world-map-bg.png");
    applyFlip();
    renderNodes();
    refreshHud();
  }

  /* ---------------- 3. 对话 ---------------- */
  var dlg = { lines: [], i: 0, typing: false, timer: null, onEnd: null, full: false };

  function playDialogue(lines, onEnd) {
    dlg.lines = lines || [];
    dlg.i = -1;
    dlg.onEnd = onEnd || null;
    dlg.full = false;
    $("dlgFull").hidden = true;
    $("btnFull").textContent = "看完整剧情";
    document.body.classList.add("is-dialog");
    $("dlg").hidden = false;
    renderFull();
    nextLine();
  }

  function renderFull() {
    var html = "";
    dlg.lines.forEach(function (l) {
      var sp = speaker(l[0]);
      html += "<p>" + (sp.name ? "<b>" + sp.name + "：</b>" : "") + l[1] + "</p>";
    });
    $("dlgFull").innerHTML = html;
  }

  function nextLine() {
    dlg.i++;
    if (dlg.i >= dlg.lines.length) { endDialogue(); return; }
    var l = dlg.lines[dlg.i];
    var sp = speaker(l[0]);
    var isNarr = l[0] === "n" || !sp.name;
    $("dlgBox").classList.toggle("dlg--narr", isNarr);
    $("dlgWho").textContent = sp.name || "";
    $("dlgWho").hidden = isNarr;
    $("dlgFace").hidden = isNarr || !sp.img;
    if (!isNarr && sp.img) { $("dlgFaceImg").src = sp.img; }
    typeText(l[1]);
  }

  function typeText(text) {
    var el = $("dlgText");
    el.textContent = "";
    dlg.typing = true;
    var i = 0;
    clearInterval(dlg.timer);
    if (!text.length) { finishTyping(); return; }
    dlg.timer = setInterval(function () {
      i += 1;
      el.textContent = text.slice(0, i);
      if (i >= text.length) { finishTyping(); }
    }, 12);
  }

  function finishTyping() {
    clearInterval(dlg.timer);
    dlg.typing = false;
    if (dlg.i >= 0 && dlg.i < dlg.lines.length) { $("dlgText").textContent = dlg.lines[dlg.i][1]; }
  }

  function advance() {
    if (dlg.typing) { finishTyping(); return; }
    nextLine();
  }

  function endDialogue() {
    clearInterval(dlg.timer);
    document.body.classList.remove("is-dialog");
    $("dlg").hidden = true;
    var cb = dlg.onEnd; dlg.onEnd = null;
    if (cb) { cb(); }
  }

  function initDialogue() {
    $("dlgBox").onclick = advance;
    $("dlgVeil").onclick = advance;
    $("btnSkip").onclick = function () { endDialogue(); };
    $("btnFull").onclick = function () {
      dlg.full = !dlg.full;
      $("dlgFull").hidden = !dlg.full;
      $("btnFull").textContent = dlg.full ? "收起剧情" : "看完整剧情";
    };
  }

  /* ---------------- 4. 任务卡 ---------------- */
  var current = null;
  var finished = false;

  function openAct(act) {
    current = act;
    finished = actDone(act.id);
    /* 已经走完的关：不再重放剧情，直接把任务卡摊开给他 */
    if (finished) { showTask(act); return; }
    playDialogue(act.story, function () {
      if (act.goal) { showTask(act); } else { finishAct(act); }
    });
  }

  // 一关走完：打勾 → 放反馈剧情 → 结算
  function finishAct(act) {
    var first = !actDone(act.id);
    state.done[act.id] = true;
    save();
    renderNodes();
    refreshHud();
    var wasFive = act.id === 5 && first;
    playDialogue(act.feedback, function () {
      if (act.id === 0) { showBanner("序幕结束", "故事从这里开始"); return; }
      if (wasFive) { showBanner("后半张海图，展开了", "外海的路，从现在开始"); return; }
      showBanner("这一关走完了", act.reward || "船上的东西多了一样", act);
    });
  }

  function showTask(act) {
    var box = $("task");
    var goalEl = $("taskGoal");
    goalEl.textContent = act.goal || "";
    goalEl.hidden = !act.goal;

    var ol = $("taskSteps");
    ol.innerHTML = "";
    (act.steps || []).forEach(function (s) {
      var li = document.createElement("li");
      li.textContent = s;
      ol.appendChild(li);
    });
    $("taskStepsBox").hidden = !(act.steps && act.steps.length);

    var tips = $("taskTips");
    tips.innerHTML = "";
    (act.tips || []).forEach(function (t) {
      var a = document.createElement("a");
      a.className = "gbtn gbtn--scroll";
      a.target = "_blank";
      a.rel = "noopener";
      a.href = t.url;
      a.textContent = "打开锦囊 · " + t.label;
      tips.appendChild(a);
    });
    tips.hidden = !(act.tips && act.tips.length);

    $("taskUp").hidden = !act.upload;
    if (act.upload) {
      $("taskUpImg").hidden = !state.poster;
      if (state.poster) { $("taskUpImg").src = state.poster; }
      $("taskUpState").textContent = state.poster
        ? "海报已上传，可以交卷了。"
        : "这一关要交东西：把你的海报传上来，才能点“我做完了”。";
    }

    /* 没走完：底下只留一颗「我做完了」，贴在右下角
       走完了：交卷键收起来，换成 查看剧情（左下）/ 查看背包（右下） */
    $("taskDone").textContent = "我做完了";
    $("taskDone").hidden = finished;
    $("taskDone").disabled = !!act.upload && !state.poster && !finished;
    $("taskStory").hidden = !finished;
    $("taskBag").hidden = !finished;
    box.hidden = false;
  }

  // 先把任务卡收起来，这一关不算完成，回头再点木牌还能接着做
  function closeTask() {
    $("task").hidden = true;
    current = null;
    flashHint("先给你收着。想接着做，再点一次这块木牌。");
  }

  /* ---------------- 剧情回顾：整段铺开，不用一句一句点 ---------------- */
  function renderStory(act) {
    var html = "";
    (act.story || []).forEach(function (l) {
      var sp = speaker(l[0]);
      var isNarr = l[0] === "n" || !sp.name;
      if (isNarr) {
        html += '<p class="snarr">' + l[1] + "</p>";
        return;
      }
      html +=
        '<div class="sline">' +
          '<span class="sline__face">' + (sp.img ? '<img src="' + sp.img + '" alt="">' : "") + "</span>" +
          '<div class="sline__box">' +
            '<b class="sline__who">' + sp.name + "</b>" +
            "<p>" + l[1] + "</p>" +
          "</div>" +
        "</div>";
    });
    $("storyTitle").textContent = act.id === 0 ? "序幕" : "第 " + act.id + " 幕，" + (act.name || "");
    $("storyBody").innerHTML = html;
    $("storyBox").scrollTop = 0;
  }

  function openStory(act) {
    if (!act || !act.story || !act.story.length) { return; }
    renderStory(act);
    $("story").hidden = false;
  }
  function closeStory() { $("story").hidden = true; }

  function initTask() {
    $("taskClose").onclick = closeTask;
    $("taskStory").onclick = function () { if (current) { openStory(current); } };
    $("taskBag").onclick = function () { openBag(); };
    $("taskDone").onclick = function () {
      if (!current) { return; }
      $("task").hidden = true;
      finishAct(current);
    };

    $("taskUpBtn").onclick = function () { $("taskUpFile").click(); };
    $("taskUpFile").onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) { return; }
      var r = new FileReader();
      r.onload = function () {
        shrink(r.result, function (data) {
          state.poster = data;
          save();
          $("taskUpImg").src = data;
          $("taskUpImg").hidden = false;
          $("taskUpState").textContent = "海报已上传，可以交卷了。";
          $("taskDone").disabled = false;
        });
      };
      r.readAsDataURL(f);
    };
  }

  // 把图压到最长边 900px 再存，免得把存档撑爆
  function shrink(dataUrl, cb) {
    var img = new Image();
    img.onload = function () {
      var max = 900;
      var w = img.width, h = img.height;
      var k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement("canvas");
      c.width = Math.round(w * k);
      c.height = Math.round(h * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      var out = dataUrl;
      try { out = c.toDataURL("image/jpeg", 0.82); } catch (e) {}
      cb(out);
    };
    img.onerror = function () { cb(dataUrl); };
    img.src = dataUrl;
  }

  /* ---------------- 5. 背包 ---------------- */
  function iconSVG(name) {
    var ops = ICONS[name];
    if (!ops) { return ""; }
    var out = '<svg class="px" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">';
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i];
      if (o[0] === "r") {
        out += '<rect x="' + o[1] + '" y="' + o[2] + '" width="' + o[3] + '" height="' + o[4] +
               '" fill="' + (PX[o[5]] || "#f2c96b") + '"/>';
      } else {
        out += '<rect x="' + o[1] + '" y="' + o[2] + '" width="1" height="1" fill="' + (PX[o[3]] || "#f2c96b") + '"/>';
      }
    }
    return out + "</svg>";
  }

  var bagPick = 0;

  function renderBagDetail() {
    var box = $("bagDetail");
    var it = bagPick ? ITEMS[bagPick] : null;
    if (!it) {
      box.innerHTML = '<p class="bag__empty">背包还是空的。<b>走完一关，船上就多一样东西。</b><br>先去点地图上那块亮着的木牌。</p>';
      return;
    }
    var act = actById(bagPick) || {};
    box.innerHTML =
      '<span class="bag__dico">' + iconSVG(it.icon) + "</span>" +
      '<div><b class="bag__dname">' + it.name + "</b>" +
      '<p class="bag__dtext">' + (act.reward || "") + "</p>" +
      '<span class="bag__dfrom">第 ' + bagPick + " 幕 · " + (act.name || "") + "</span></div>";
  }

  function renderBag() {
    var parts = [];
    var got = 0;
    for (var i = 1; i <= 15; i++) {
      var it = ITEMS[i];
      if (!it) { continue; }
      if (actDone(i)) {
        got++;
        var isNew = !state.seen[i];
        parts.push('<button type="button" class="bag__slot' + (bagPick === i ? " is-on" : "") + (isNew ? " is-new" : "") +
          '" data-act="' + i + '" title="' + it.name + '">' +
          (isNew ? '<i class="bag__new">新</i>' : "") + iconSVG(it.icon) + "</button>");
      } else {
        parts.push('<button type="button" class="bag__slot is-lock" data-act="' + i + '" title="还没拿到"></button>');
      }
    }
    if (!bagPick || !actDone(bagPick) || !ITEMS[bagPick]) {
      bagPick = 0;
      for (var j = 15; j >= 1; j--) { if (actDone(j) && ITEMS[j]) { bagPick = j; break; } }
    }
    var grid = $("bagGrid");
    grid.innerHTML = parts.join("");
    $("bagCount").textContent = got + " / 15";
    /* 打开看过，就算读过了：数字提醒随之消失 */
    for (var s = 1; s <= 15; s++) {
      if (actDone(s) && ITEMS[s] && !state.seen[s]) { state.seen[s] = true; }
    }
    save();
    refreshHud();

    grid.onclick = function (e) {
      var b = e.target.closest ? e.target.closest(".bag__slot") : null;
      if (!b || b.classList.contains("is-lock")) { return; }
      bagPick = parseInt(b.getAttribute("data-act"), 10) || 0;
      renderBag();
    };
    renderBagDetail();
  }

  function openBag() { renderBag(); $("bag").hidden = false; }
  function closeBag() { $("bag").hidden = true; }

  /* ---------------- 改名字（点左上角的玩家卡片） ---------------- */
  function openProfile() {
    if (!state.player) { return; }
    $("meInput").value = state.player.name || "";
    $("profile").hidden = false;
    $("meInput").focus();
    $("meInput").select();
  }
  function closeProfile() { $("profile").hidden = true; }

  function initProfile() {
    $("me").onclick = openProfile;
    $("meCancel").onclick = closeProfile;
    $("profileVeil").onclick = closeProfile;
    $("meSave").onclick = function () {
      var v = $("meInput").value.trim();
      if (!v) { $("meInput").focus(); return; }
      state.player.name = v;
      save();
      refreshHud();
      closeProfile();
      flashHint("名牌换了。以后就叫「" + v + "」。");
    };
    $("meInput").onkeydown = function (e) {
      if (e.key === "Enter") { $("meSave").click(); }
    };
  }

  /* ---------------- 声音 ---------------- */
  var AUDIO = window.SeaAudio || {
    sfx: function () {}, set: function () {}, unlock: function () {}, duck: function () {},
    state: function () { return {}; }
  };

  function num(v, fallback) {
    return (typeof v === "number" && isFinite(v)) ? v : fallback;
  }

  function syncAudio() {
    state.bgm = state.bgm !== false;
    state.sfx = state.sfx !== false;
    state.bgmVol = Math.max(0, Math.min(1, num(state.bgmVol, 0.55)));
    state.sfxVol = Math.max(0, Math.min(1, num(state.sfxVol, 0.7)));
    AUDIO.set({ bgm: state.bgm, sfx: state.sfx, bgmVol: state.bgmVol, sfxVol: state.sfxVol });
    $("setBgm").textContent = state.bgm ? "开" : "关";
    $("setSfx").textContent = state.sfx ? "开" : "关";
    $("bgmVol").value = Math.round(state.bgmVol * 100);
    $("sfxVol").value = Math.round(state.sfxVol * 100);
    $("bgmVol").disabled = !state.bgm;
    $("sfxVol").disabled = !state.sfx;
  }

  /* 哪颗按钮配哪种音 */
  function sfxFor(b) {
    if (b.id === "taskDone") { return "win"; }
    if (b.id === "setReset") { return "deny"; }
    if (b.classList.contains("node")) {
      return b.classList.contains("node--lock") ? "deny" : "open";
    }
    if (b.classList.contains("bag__slot")) {
      return b.classList.contains("is-lock") ? "deny" : "item";
    }
    if (b.classList.contains("task__close") || b.classList.contains("story__close")) { return "close"; }
    if (b.id === "bagClose" || b.id === "cfCancel" || b.id === "setClose") { return "close"; }
    if (b.id === "btnBag" || b.id === "btnSet" || b.id === "taskStory" || b.id === "taskBag" ||
        b.id === "startBtn" || b.id === "taskUpBtn") { return "open"; }
    return "tap";
  }

  /* 有东西盖在地图上时，把音乐压下去一点 */
  function refreshDuck() {
    var any = !$("dlg").hidden || !$("story").hidden || !$("bag").hidden ||
              !$("settings").hidden || !$("confirm").hidden || !$("profile").hidden;
    AUDIO.duck(any);
  }

  function initAudio() {
    syncAudio();
    $("setBgm").onclick = function () {
      state.bgm = !state.bgm;
      save(); syncAudio();
      AUDIO.sfx(state.bgm ? "open" : "close");
    };
    $("setSfx").onclick = function () {
      if (state.sfx) { AUDIO.sfx("close"); }   /* 关之前让它响最后一下 */
      state.sfx = !state.sfx;
      save(); syncAudio();
      if (state.sfx) { AUDIO.sfx("open"); }
    };
    $("bgmVol").oninput = function () {
      state.bgmVol = this.value / 100;
      AUDIO.set({ bgmVol: state.bgmVol });
      save();
    };
    $("sfxVol").oninput = function () {
      state.sfxVol = this.value / 100;
      AUDIO.set({ sfxVol: state.sfxVol });
      save();
    };
    $("sfxVol").onchange = function () { AUDIO.sfx("tap"); };

    /* 点哪儿都先解一下自动播放限制；顺手补个音效 */
    document.addEventListener("click", function (e) {
      AUDIO.unlock();
      var b = e.target && e.target.closest ? e.target.closest("button") : null;
      if (b && !b.disabled) { AUDIO.sfx(sfxFor(b)); }
    }, true);

    /* 对话 / 弹窗一开一关，音乐自动让路 */
    if (window.MutationObserver) {
      var obs = new MutationObserver(refreshDuck);
      ["dlg", "story", "bag", "settings", "confirm", "profile"].forEach(function (id) {
        obs.observe($(id), { attributes: true, attributeFilter: ["hidden"] });
      });
    }
    refreshDuck();
  }

  /* ---------------- 5. 结算横幅 ---------------- */
  var bannerTimer = null;
  function showBanner(title, sub, act) {
    $("bannerTitle").textContent = title;
    $("bannerSub").textContent = sub || "";
    var got = act && ITEMS[act.id];
    $("bannerItem").hidden = !got;
    if (got) {
      $("bannerItem").innerHTML = iconSVG(got.icon) + "<span>拿到手了 —— <em>" + got.name + "</em>（已放进背包）</span>";
    }
    $("banner").hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { $("banner").hidden = true; }, 2800);
  }

  /* ---------------- 预览钩子 ----------------
     index.html?stage=dialog&act=1&line=7
     index.html?stage=full&act=3
     index.html?stage=task&act=3
     index.html?stage=taskdone&act=3
     index.html?stage=story&act=1
     index.html?stage=fb&act=5
     index.html?stage=done&act=5
  ------------------------------------------------------- */
  function preview() {
    var q = new URLSearchParams(location.search);
    var st = q.get("stage");
    if (!st) { return false; }
    /* 调试用：?stage=...&fresh=1 每次都从零开始，不受存档影响 */
    if (q.get("fresh") === "1") {
      state = {
        player: null, done: {}, free: false, poster: "", seen: {},
        bgm: state.bgm, sfx: state.sfx, bgmVol: state.bgmVol, sfxVol: state.sfxVol
      };
      try { localStorage.removeItem(KEY); } catch (e) {}
    }
    if (!state.player) {
      state.player = { name: "小P", gender: "男", face: (FACES[0] || {}).id || "" };
    }
    var want = parseInt(q.get("act") || "1", 10);
    if (st === "done") {
      for (var i = 0; i < want; i++) { state.done[i] = true; }
      if (q.get("closefog") === "1") { state.done[5] = true; }
    }
    if (st === "taskdone") {
      for (var d = 0; d <= want; d++) { state.done[d] = true; }
      state.done[5] = true;
    }
    if (q.get("free") === "1") { state.free = true; }
    $("setup").hidden = true;
    showGame();

    var act = actById(want) || ACTS[1];
    if (st === "dialog") {
      openAct(act);
      var n = parseInt(q.get("line") || "1", 10);
      dlg.i = Math.max(0, n) - 2;
      nextLine();
      finishTyping();
      if (q.get("full") === "1") { $("dlgFull").hidden = false; $("btnFull").textContent = "收起剧情"; }
      return true;
    }
    if (st === "full") {
      openAct(act);
      $("dlgFull").hidden = false;
      $("btnFull").textContent = "收起剧情";
      dlg.i = 0;
      nextLine();
      finishTyping();
      return true;
    }
    if (st === "task") { openAct(act); endDialogue(); return true; }
    if (st === "taskdone") { openAct(act); return true; }
    if (st === "story") { openStory(act); return true; }
    if (st === "fb") {
      current = act;
      playDialogue(act.feedback, null);
      dlg.i = act.feedback.length - 2;
      nextLine();
      finishTyping();
      return true;
    }
    if (st === "done") {
      current = act;
      renderNodes();
      refreshHud();
      showBanner(act.id === 5 ? "后半张海图，展开了" : "这一关走完了", act.reward || "外海的路，从现在开始", act);
      return true;
    }
    return false;
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    if (location.search.indexOf("flip=1") > -1) {
      document.documentElement.classList.add("flip-force");
    }
    load();
    initDialogue();
    initTask();
    initSetup();
    initProfile();
    initAudio();
    applyFlip();

    /* ---- 设置 ---- */
    function setFree(on) {
      state.free = on;
      save(); renderNodes(); refreshHud();
      flashHint(state.free ? "自由探索已打开：所有木牌都能点。" : "自由探索已关闭：还是按顺序来。");
    }
    function closeSettings() { $("settings").hidden = true; }
    $("storyClose").onclick = closeStory;
    $("storyDone").onclick = closeStory;
    $("storyVeil").onclick = closeStory;
    $("btnBag").insertAdjacentHTML("afterbegin", iconSVG("bag"));
    $("btnBag").onclick = openBag;
    $("bagClose").onclick = closeBag;
    $("bagVeil").onclick = closeBag;
    $("btnSet").onclick = function () {
      refreshHud();
      $("settings").hidden = false;
    };
    $("setClose").onclick = closeSettings;
    $("settingsVeil").onclick = closeSettings;
    $("setFree").onclick = function () { setFree(!state.free); };
    $("setReset").onclick = function () {
      closeSettings();
      $("confirm").hidden = false;
    };
    $("cfCancel").onclick = function () { $("confirm").hidden = true; };
    $("cfOk").onclick = function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      location.reload();
    };
    $("confirmVeil").onclick = function () { $("confirm").hidden = true; };
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") { return; }
      if (!$("confirm").hidden) { $("confirm").hidden = true; return; }
      if (!$("profile").hidden) { closeProfile(); return; }
      if (!$("bag").hidden) { closeBag(); return; }
      if (!$("settings").hidden) { closeSettings(); return; }
      if (!$("story").hidden) { closeStory(); return; }
      if (!$("task").hidden) { closeTask(); }
    });
    window.addEventListener("resize", applyFlip);
    window.addEventListener("orientationchange", function () {
      applyFlip();
      setTimeout(applyFlip, 300);
    });
    (function () {
      var vp = $("viewport");
      if (vp) { vp.addEventListener("scroll", function () { vp.scrollTop = 0; vp.scrollLeft = 0; }); }
    })();

    if (preview()) { return; }

    if (!state.player) {
      $("setup").hidden = false;
    } else {
      showGame();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
