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

  var state = { player: null, done: {}, free: false, poster: "", seen: {}, report: {}, bgm: true, sfx: true, bgmVol: 0.55, sfxVol: 0.7 };

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
    if (!state || typeof state !== "object") { state = { player: null, done: {}, free: false, poster: "", seen: {}, report: {} }; }
    state.done = state.done || {};
    state.report = state.report || {};
    /* 老存档：第 3 关那张海报原来存在 state.poster 里，搬进反馈记录 */
    if (state.poster && !state.report[3]) { state.report[3] = { img: state.poster, at: "已上交" }; }
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
      syncTyping();
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
    document.documentElement.classList.toggle("is-tiny", ph <= 400);
    document.documentElement.classList.toggle("is-narrow", pw <= 560);
  }

  var rotHinted = false;
  function applyFlip() {
    var on = isFlip();
    document.documentElement.classList.toggle("is-flip", on);
    syncUnits(on);
    scaleStage();
    refitAll();
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
    syncTyping();
  }

  /* 竖屏转 90° 时手机键盘还是竖的。
     输入框一拿到焦点，就把手里这块弹窗反向转回来，让字和键盘同一个方向。 */
  /* 任务卡里只要点过一次反馈输入框，就保持"转回来"的状态，
     别在他手指底下再转一次 —— 不然点提交那一下会落空。 */
  var taskTyping = false;
  /* 编辑弹窗同理：在里面点过输入框之后，直到关掉为止都别转回去，
     不然点「保存」那一下会落在空处（安卓上必现）。 */
  var editTyping = false;
  function overlaysOpen() {
    return !$("tip").hidden || !$("edit").hidden || !$("bag").hidden || !$("story").hidden ||
      !$("settings").hidden || !$("confirm").hidden || !$("profile").hidden;
  }
  function syncTyping() {
    var flip = document.documentElement.classList.contains("is-flip");
    var a = document.activeElement;
    var inInput = !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA");
    var taskOpen = !!$("task") && !$("task").hidden;
    if (inInput && taskOpen && a.id === "taskTa") { taskTyping = true; }
    if (!taskOpen || overlaysOpen()) { taskTyping = false; }
    if (inInput && a.id === "editTa") { editTyping = true; }
    if ($("edit").hidden) { editTyping = false; }
    document.documentElement.classList.toggle("is-typing", flip && (inInput || taskTyping || editTyping));
  }
  document.addEventListener("focusin", syncTyping);
  document.addEventListener("focusout", function () { setTimeout(syncTyping, 40); });

  /* ---------------- 文字格宽度：用 px 写死 ----------------
     有些手机浏览器（荣耀/华为那类内核）会把弹性子项的宽度按「文字固有宽度」缓存住。
     字体换好、文字变长之后它不重算，旁白就会在弹窗中间折行、右边空一大块。
     这里每次换行都量一遍盒子，把文字格宽度用 px 写死（width + min-width + flex-basis 三重），
     绕开内核那套固有宽度计算。 */
  function fitTextCol(box, col, face) {
    if (!box || !col || !box.offsetWidth) { return; }
    var cs = getComputedStyle(box);
    var avail = box.clientWidth -
      (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    if (face && !face.hidden && face.offsetWidth) {
      avail -= face.offsetWidth + (parseFloat(cs.columnGap || cs.gap) || 0);
    }
    if (!(avail > 80)) { avail = 80; }
    var w = Math.floor(avail) + "px";
    col.style.flex = "0 1 " + w;
    col.style.width = w;
    col.style.minWidth = w;
  }

  function fitDlg() {
    fitTextCol($("dlgBox"), $("dlgMain"), $("dlgFace"));
  }

  function fitStory() {
    var body = $("storyBody");
    if (!body) { return; }
    Array.prototype.forEach.call(body.querySelectorAll(".sline"), function (ln) {
      fitTextCol(ln, ln.querySelector(".sline__box"), ln.querySelector(".sline__face"));
    });
  }

  function fitBag() {
    var d = $("bagDetail");
    if (!d) { return; }
    fitTextCol(d, d.querySelector(".bag__dmain"), d.querySelector(".bag__dico"));
  }

  function refitAll() {
    if ($("dlg") && !$("dlg").hidden) { fitDlg(); }
    if ($("story") && !$("story").hidden) { fitStory(); }
    if ($("bag") && !$("bag").hidden) { fitBag(); }
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
    fitDlg();
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
  var q = null;

  function openAct(act) {
    current = act;
    finished = actDone(act.id);
    /* 已经走完的关：不再重放剧情，直接把任务卡摊开给他 */
    if (finished) { showTask(act); return; }
    playDialogue(act.story, function () {
      if (act.id !== 0 && (act.goal || act.quest)) { showTask(act); } else { finishAct(act); }
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

  /* 每关的任务定义都在 acts.js 的 quest 里：
     { title 一句话任务, lead[] 封面简介（封面 + 行动页都显示）, brief[] 老的「任务指令」，已不显示、留作底稿,
       steps[] 行动步骤, tip{name,about,url} 课程锦囊, report{kind,ask,hint,min} 任务反馈 }
     还没写 quest 的关卡，先用老的 goal / steps / tips 兜一份，保证能跑 */
  function questOf(act) {
    if (act.quest) { return act.quest; }
    var t = (act.tips && act.tips[0]) || null;
    var goal = (act.goal || "").replace(/^目标：\s*/, "").replace(/\n[\s\S]*$/, "").trim();
    return {
      title: act.upload ? "交出一张自己做的海报" : (act.name ? "完成一次「" + act.name + "」" : ""),
      lead: goal ? [goal] : [],
      brief: [],
      steps: act.steps || [],
      tip: t ? { name: t.label, about: "", url: t.url } : null,
      report: act.upload
        ? { kind: "image", ask: "把这一关做出来的图传上来。", hint: "传上来才算完成。" }
        : { kind: "text", ask: "把这一关做出来的东西记一句。", hint: "写你自己看得懂的话就行。" }
    };
  }

  function reportOf(id) { return (state.report && state.report[id]) || null; }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* 交上去的反馈长什么样：任务卡里（纸底）和背包里（深底）共用这一套 */
  function renderRep(r) {
    if (!r) { return '<div class="rep rep--none">这一关还没交反馈。</div>'; }
    var h = '<div class="rep">';
    if (r.at) { h += '<p class="rep__meta">' + esc(r.at) + "</p>"; }
    if (r.text) { h += '<p class="rep__text">' + esc(r.text) + "</p>"; }
    if (r.img) { h += '<img class="rep__img" src="' + r.img + '" alt="">'; }
    if (!r.text && !r.img) { h += '<p class="rep__text">（交了个空的）</p>'; }
    return h + "</div>";
  }

  function stamp() {
    var d = new Date();
    return (d.getMonth() + 1) + " 月 " + d.getDate() + " 日交的";
  }

  function showTask(act) {
    current = act;
    finished = actDone(act.id);
    q = questOf(act);

    var tag = act.id === 0 ? "序幕" : "第 " + act.id + " 关";
    var full = act.id === 0 ? (q.title || act.name || "") : tag + "：" + (q.title || act.name || "");
    $("taskTitle").textContent = full;
    $("taskTitle2").textContent = full;
    $("taskKicker").textContent = act.id === 0 ? "序幕 · 行动" : "第 " + act.id + " 关 · 行动";

    var lead = $("taskLead");
    lead.innerHTML = (q.lead || []).map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("");
    lead.hidden = !(q.lead && q.lead.length);

    /* 行动页开头放的是简介（原来的「任务指令」板块已经去掉） */
    var intro = $("taskIntro");
    intro.innerHTML = (q.lead || []).map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("");
    intro.hidden = !(q.lead && q.lead.length);

    var ol = $("taskSteps");
    ol.innerHTML = "";
    (q.steps || []).forEach(function (s) {
      var li = document.createElement("li");
      li.textContent = s;
      ol.appendChild(li);
    });
    $("taskStepsBox").hidden = !(q.steps && q.steps.length);
    $("taskStepsBox").open = false;

    $("taskTip").hidden = !(q.tip && (q.tip.url || q.tip.about));
    $("taskCoach").hidden = !(q.coach && q.coach.text);
    $("taskCoach").textContent = (q.coach && q.coach.btn) || "复制教练提示词";

    /* 任务反馈表单 */
    var rp = q.report || {};
    $("taskAsk").textContent = rp.ask || "";
    $("taskAsk").hidden = !rp.ask;
    $("taskHint").textContent = rp.hint || "";
    $("taskHint").hidden = !rp.hint;
    $("taskTa").hidden = rp.kind !== "text";
    $("taskTa").value = "";
    $("taskTa").placeholder = rp.ph || "";
    $("taskUpRow").hidden = rp.kind !== "image";
    $("taskUpImg").hidden = true;
    $("taskUpImg").removeAttribute("src");
    pickImg = "";

    $("taskReport").hidden = finished;

    /* 没走完：先只给他看任务本身（封面，一颗「开始行动」）
       走完了：跳过封面，直接摊开行动页；交过的东西收在背包里，不在这儿再摆一遍 */
    $("taskCover").hidden = finished;
    $("taskDo").hidden = !finished;

    $("taskDone").hidden = finished;
    $("taskStory").hidden = !finished;
    $("taskBag").hidden = !finished;
    $("task").hidden = false;
  }

  /* 封面那颗「开始行动」 */
  function startQuest() {
    $("taskCover").hidden = true;
    $("taskDo").hidden = false;
    AUDIO.sfx("open");
    var ta = $("taskTa");
    if (ta && !ta.hidden) { setTimeout(function () { $("taskBox").scrollTop = 0; }, 0); }
  }

  /* 课程锦囊：课程名 + 大概介绍 + 跳转按钮 */
  function openTip() {
    if (!q || !q.tip) { return; }
    $("tipName").textContent = q.tip.name || "这门课";
    $("tipAbout").textContent = q.tip.about || "";
    $("tipAbout").hidden = !q.tip.about;
    $("tipGo").href = q.tip.url || "#";
    $("tipGo").hidden = !q.tip.url;
    $("tip").hidden = false;
  }
  function closeTip() { $("tip").hidden = true; }

  /* ---------------- 教练提示词：可以自己改，改完存在这台设备上 ---------------- */
  function coachKey(id) { return "sea-coach-" + id; }
  function coachSaved(id) {
    try { return localStorage.getItem(coachKey(id)) || ""; } catch (e) { return ""; }
  }
  function coachNote(edited) {
    $("coachNote").textContent = edited
      ? "这版是你改过的，已经存在这台设备上。想还原就点「恢复默认」。"
      : ((q && q.coach && q.coach.note) || "改完会自动存在这台设备上。复制以后，粘到你要用的地方就行。");
  }
  function openCoach() {
    if (!current || !q || !q.coach || !q.coach.text) { return; }
    $("coachName").textContent = q.coach.name || "行动教练";
    $("coachKicker").textContent = q.coach.kicker || "这一关要用的教练";
    $("coachAbout").textContent = q.coach.about || "";
    $("coachAbout").hidden = !q.coach.about;
    var saved = coachSaved(current.id);
    $("coachTa").value = saved || q.coach.text;
    coachNote(!!saved && saved !== q.coach.text);
    $("coachCopy").textContent = "复制提示词";
    $("coach").hidden = false;
    $("coachTa").scrollTop = 0;
    AUDIO.sfx("open");
  }
  function closeCoach() { $("coach").hidden = true; }
  function copyCoach() {
    var ta = $("coachTa");
    var btn = $("coachCopy");
    var cq = q;
    var ok = function () {
      btn.textContent = "复制好了 ✓";
      $("coachNote").textContent = (cq && cq.coach && cq.coach.copied) || "已经复制好了，粘到你要用的地方就行。";
      AUDIO.sfx("tap");
      setTimeout(function () { btn.textContent = "复制提示词"; }, 2200);
    };
    var fallback = function () {
      try {
        ta.focus();
        ta.setSelectionRange(0, ta.value.length);
        var done = document.execCommand("copy");
        window.getSelection().removeAllRanges();
        if (done) { ok(); return; }
      } catch (e) {}
      $("coachNote").textContent = "这台设备不让自动复制。长按上面的文字，全选复制一下。";
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(ok, fallback);
    } else { fallback(); }
  }
  function resetCoach() {
    if (!current || !q || !q.coach) { return; }
    try { localStorage.removeItem(coachKey(current.id)); } catch (e) {}
    $("coachTa").value = q.coach.text;
    $("coachNote").textContent = "已经还原成默认那版了。";
    AUDIO.sfx("tap");
  }
  var coachTimer = 0;
  function onCoachInput() {
    if (!current || !q || !q.coach) { return; }
    clearTimeout(coachTimer);
    coachTimer = setTimeout(function () {
      var v = $("coachTa").value;
      try {
        if (v === q.coach.text) { localStorage.removeItem(coachKey(current.id)); }
        else { localStorage.setItem(coachKey(current.id), v); }
      } catch (e) {}
      coachNote(v !== q.coach.text);
    }, 400);
  }


  function canSubmit() {
    var rp = (q && q.report) || {};
    if (rp.kind === "image") { return !!pickImg; }
    return $("taskTa").value.trim().length >= (rp.min || 1);
  }

  function submitReport() {
    if (!current || !q) { return; }
    var rp = q.report || {};
    if (!canSubmit()) {
      flashHint(rp.kind === "image" ? "先把这一关做出来的图传上来，再交。" : "再多写两句吧，别交个空的。");
      return;
    }
    state.report = state.report || {};
    var r = { at: stamp() };
    var v = $("taskTa").value.trim();
    if (v) { r.text = v; }
    if (pickImg) { r.img = pickImg; }
    state.report[current.id] = r;
    save();
    AUDIO.sfx("open");
    $("task").hidden = true;
    finishAct(current);
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
    $("storyTitle").textContent = act.id === 0 ? "序幕" : "第 " + act.id + " 关，" + (act.name || "");
    $("storyBody").innerHTML = html;
    $("storyBox").scrollTop = 0;
  }

  function openStory(act) {
    if (!act || !act.story || !act.story.length) { return; }
    renderStory(act);
    $("story").hidden = false;
    fitStory();
  }
  function closeStory() { $("story").hidden = true; }

  function initTask() {
    $("taskClose").onclick = closeTask;
    $("taskStart").onclick = startQuest;
    $("taskStory").onclick = function () { if (current) { openStory(current); } };
    $("taskBag").onclick = function () { openBag(); };
    $("taskDone").onclick = submitReport;

    $("taskTip").onclick = openTip;
    $("tipClose").onclick = closeTip;
    $("tipVeil").onclick = closeTip;

    $("taskCoach").onclick = openCoach;
    $("coachClose").onclick = closeCoach;
    $("coachVeil").onclick = closeCoach;
    $("coachCopy").onclick = copyCoach;
    $("coachReset").onclick = resetCoach;
    $("coachTa").oninput = onCoachInput;

    /* 反馈要交图（海报那关）：先选图 → 压一下 → 预览 */
    $("taskUpBtn").onclick = function () { $("taskUpFile").click(); };
    $("taskUpFile").onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) { return; }
      var rd = new FileReader();
      rd.onload = function () {
        shrink(rd.result, function (data) {
          pickImg = data;
          state.poster = data;          /* 老字段留着，兼容旧存档 */
          save();
          $("taskUpImg").src = data;
          $("taskUpImg").hidden = false;
          AUDIO.sfx("tap");
        });
      };
      rd.readAsDataURL(f);
    };
  }

  var pickImg = "";

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
      '<div class="bag__dmain"><b class="bag__dname">' + it.name + "</b>" +
      '<p class="bag__dtext">' + (act.reward || "") + "</p>" +
      '<span class="bag__dfrom">第 ' + bagPick + " 关 · " + (act.name || "") + "</span></div>" +
      '<div class="bag__rep">' + renderRep(reportOf(bagPick)) + "</div>" +
      '<div class="bag__editrow">' +
        (reportOf(bagPick) ? '<button type="button" class="gbtn gbtn--ghost" id="bagEdit">编辑</button>' : "") +
      "</div>";
    var eb = $("bagEdit");
    if (eb) { eb.onclick = function () { openEdit(bagPick); }; }
  }

  /* ---------------- 4b. 改一改已经交过的反馈 ---------------- */
  var editAct = 0, editImg = "";
  function openEdit(id) {
    var act = actById(id) || {};
    var qq = questOf(act);
    var rp = qq.report || {};
    var r = reportOf(id) || {};
    editAct = id;
    editImg = r.img || "";
    $("editName").textContent = "第 " + id + " 关：" + (qq.title || act.name || "");
    $("editAsk").textContent = rp.ask || "";
    $("editAsk").hidden = !rp.ask;
    $("editTa").hidden = rp.kind !== "text";
    $("editTa").value = r.text || "";
    $("editUpRow").hidden = rp.kind !== "image";
    var im = $("editUpImg");
    im.hidden = !editImg;
    if (editImg) { im.src = editImg; } else { im.removeAttribute("src"); }
    $("edit").hidden = false;
  }
  function closeEdit() { $("edit").hidden = true; editAct = 0; editTyping = false; syncTyping(); }
  function saveEdit() {
    if (!editAct) { return; }
    var act = actById(editAct) || {};
    var rp = questOf(act).report || {};
    var v = $("editTa").value.trim();
    if (rp.kind === "image") {
      if (!editImg) { flashHint("还没选图呢，先选一张。"); return; }
    } else if (v.length < (rp.min || 1)) {
      flashHint("再多写两句吧，别交个空的。");
      return;
    }
    var r = state.report[editAct] || {};
    r.at = stamp();
    if (rp.kind === "image") { r.img = editImg; delete r.text; }
    else { r.text = v; delete r.img; }
    state.report[editAct] = r;
    save();
    renderBagDetail();
    closeEdit();
    flashHint("改好了。");
  }
  function initEdit() {
    $("editSave").onclick = saveEdit;
    $("editClose").onclick = closeEdit;
    $("editVeil").onclick = closeEdit;
    $("editUpBtn").onclick = function () { $("editUpFile").click(); };
    $("editUpFile").onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) { return; }
      var rd = new FileReader();
      rd.onload = function () {
        shrink(rd.result, function (data) {
          editImg = data;
          $("editUpImg").src = data;
          $("editUpImg").hidden = false;
          AUDIO.sfx("tap");
        });
      };
      rd.readAsDataURL(f);
      e.target.value = "";
    };
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

  function openBag() { renderBag(); $("bag").hidden = false; fitBag(); }
  function closeBag() { $("bag").hidden = true; }

  /* ---------------- 改名字（点左上角的玩家卡片） ---------------- */
  function openProfile() {
    if (!state.player) { return; }
    $("meInput").value = state.player.name || "";
    $("profile").hidden = false;
    $("meInput").focus();
    $("meInput").select();
  }
  function closeProfile() { $("profile").hidden = true; syncTyping(); }

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
    if (b.id === "taskDone" || b.id === "editSave") { return "win"; }
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
        b.id === "startBtn" || b.id === "taskUpBtn" || b.id === "bagEdit" || b.id === "editUpBtn") { return "open"; }
    if (b.id === "editClose" || b.id === "editVeil") { return "close"; }
    return "tap";
  }

  /* 有东西盖在地图上时，把音乐压下去一点 */
  function refreshDuck() {
    var any = !$("dlg").hidden || !$("story").hidden || !$("bag").hidden ||
              !$("settings").hidden || !$("confirm").hidden || !$("profile").hidden ||
              !$("tip").hidden || !$("edit").hidden;
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
      ["dlg", "story", "task", "bag", "settings", "confirm", "profile", "tip", "edit"].forEach(function (id) {
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
        player: null, done: {}, free: false, poster: "", seen: {}, report: {},
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
    initEdit();
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
      if (!$("edit").hidden) { closeEdit(); return; }
      if (!$("profile").hidden) { closeProfile(); return; }
      if (!$("bag").hidden) { closeBag(); return; }
      if (!$("settings").hidden) { closeSettings(); return; }
      if (!$("story").hidden) { closeStory(); return; }
      if (!$("task").hidden) { closeTask(); }
    });
    /* 网页字体加载完之后再重算一次布局（见 styles.css 里 .dlg__main 的注释） */
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(function () { applyFlip(); });
    }
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
