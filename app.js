"use strict";
/* ==========================================================================
   المرحلة 2 — منطق اللعبة الأساسي
   الملف مقسّم إلى طبقات منفصلة كما اتُّفق عليه في المرحلة 1:
     1) CONFIG  : الثوابت
     2) ENGINE  : قواعد اللعبة — لا يعرف شيئًا عن الشاشة أو HTML إطلاقًا
     3) RENDER  : الرسم فقط
     4) INPUT   : السحب ولوحة المفاتيح
     5) APP     : الربط بينها
   ========================================================================== */

/* ------------------------------ 1) CONFIG ------------------------------ */
const CONFIG = {
  COLS: 5,             // عدد الأعمدة
  ROWS: 7,             // عدد الصفوف
  GAP_RATIO: 0.09,     // المسافة بين المربعات كنسبة من حجم المربع
  SPAWN_POOL:    [2, 4, 8],        // القيم الممكنة للقطعة القادمة
  SPAWN_WEIGHTS: [0.50, 0.35, 0.15],
  WIN_VALUE: 2048,     // قيمة الفوز
  // توقيت الحركة بالمللي ثانية
  HAMMERS: 3,          // مطارق مجانية في كل جولة (تتجدد مع كل لعبة جديدة)
  /* الاقتصاد — مضبوط على قياس حقيقي: الجولة الوسيطة للاعب عادي 2136 نقطة،
     فبمعدل عملة لكل 50 نقطة يربح نحو 43 عملة في الجولة، أي مطرقة كل جولة ونصف. */
  COIN_PER: 50,        // نقطة واحدة من الدمج لكل ... نقطة تعطي عملة
  SHOP: [
    { id: "hammer1",  kind: "hammer", n: 1,  price: 60  },
    { id: "hammer5",  kind: "hammer", n: 5,  price: 250 },
    { id: "hammer15", kind: "hammer", n: 15, price: 650 }
  ],
  ANIM: { DROP: 150, SLIDE: 110, COLLAPSE: 70, POP: 500, FALL: 120, SMASH: 220 },
  /* إحساس السحب:
     MAGNET = قوة انجذاب القطعة لمركز العمود (0 = حرة تمامًا، 1 = تقفز بين الأعمدة)
     FOLLOW = سرعة لحاقها بالإصبع في كل إطار (أصغر = ألزج وأنعم) */
  DRAG: { MAGNET: 0.15, FOLLOW: 0.6 }
};

/* --------------------- لوحة تشخيص (مطفأة افتراضيًا) ---------------------
   تُظهر ما يصل فعلًا من أحداث اللمس على جهازك. اضغط زر «تشخيص». */
const Diag = (function () {
  const el = document.getElementById("diag");
  let on = false, n = 0;
  function toggle() {
    on = !on;
    if (!el) return;
    el.style.display = on ? "block" : "none";
    el.textContent = on ? "التشخيص يعمل — المس الشاشة الآن" : "";
  }
  function set(o) {
    if (!on || !el) return;
    n++;
    el.textContent = "#" + n + "  " + Object.keys(o).map(k => k + "=" + o[k]).join("   ");
  }
  return { toggle: toggle, set: set, isOn: () => on };
})();

/* ==========================================================================
   الحفظ — يخزّن الجولة الجارية وأفضل نتيجة في ذاكرة الجهاز.
   كل عملية محاطة بحماية: لو كانت الذاكرة ممنوعة (تصفّح خاص) أو البيانات
   تالفة أو من نسخة أقدم، تُهمل بهدوء وتبدأ اللعبة نظيفة بلا انهيار.
   ========================================================================== */
const Save = (function () {
  const KEY = "g2048.save.v1";
  const VERSION = 1;
  let usable = null;

  function can() {
    if (usable !== null) return usable;
    try {
      localStorage.setItem(KEY + ".t", "1");
      localStorage.removeItem(KEY + ".t");
      usable = true;
    } catch (e) { usable = false; }
    return usable;
  }

  function write(s) {
    if (!can() || !s) return false;
    try {
      const data = {
        v: VERSION,
        best: s.best | 0,
        coins: s.coins | 0,
        coinAcc: s.coinAcc | 0,
        hammerStock: s.hammerStock | 0,
        game: {
          rows: s.rows, cols: s.cols,
          score: s.score | 0,
          hammers: s.hammers | 0,
          drops: s.drops | 0,
          won: !!s.won, keepPlaying: !!s.keepPlaying, over: !!s.over,
          current: s.current ? s.current.value : null,
          next: s.next ? s.next.value : null,
          tiles: s.tiles.map(t => [t.r, t.c, t.value])
        }
      };
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  }

  function read() {
    if (!can()) return null;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || d.v !== VERSION) return null;
      return d;
    } catch (e) { return null; }
  }

  function clear() {
    if (!can()) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  // يتحقق أن المحفوظ يطابق قواعد اللعبة قبل استعماله
  function valid(g) {
    if (!g || g.rows !== CONFIG.ROWS || g.cols !== CONFIG.COLS) return false;
    if (!Array.isArray(g.tiles) || g.tiles.length > g.rows * g.cols) return false;
    const seen = {};
    for (const t of g.tiles) {
      if (!Array.isArray(t) || t.length !== 3) return false;
      const [r, c, v] = t;
      if (!(r >= 0 && r < g.rows && c >= 0 && c < g.cols)) return false;
      if (!(v >= 2) || (v & (v - 1)) !== 0) return false;
      const k = r + "," + c;
      if (seen[k]) return false;                 // خانتان في مكان واحد
      seen[k] = 1;
    }
    // الأعمدة مرصوصة من الأعلى بلا ثقوب
    for (let c = 0; c < g.cols; c++) {
      let gap = false;
      for (let r = 0; r < g.rows; r++) {
        const has = !!seen[r + "," + c];
        if (!has) gap = true;
        else if (gap) return false;
      }
    }
    if (!(g.current >= 2) || !(g.next >= 2)) return false;
    return true;
  }

  // يُلبس الحالة الحالية ما حُفظ. يعيد true لو استُعيدت جولة كاملة
  function restore(s) {
    const d = read();
    if (!d) return false;
    // ملك اللاعب (لا ملك الجولة) يُستعاد دائمًا حتى لو كانت الجولة تالفة
    if (typeof d.best === "number") s.best = d.best;
    if (typeof d.coins === "number" && d.coins >= 0) s.coins = d.coins | 0;
    if (typeof d.coinAcc === "number" && d.coinAcc >= 0) s.coinAcc = d.coinAcc % CONFIG.COIN_PER;
    if (typeof d.hammerStock === "number" && d.hammerStock >= 0) s.hammerStock = d.hammerStock | 0;
    const g = d.game;
    if (!valid(g)) return false;

    s.grid = [];
    for (let r = 0; r < s.rows; r++) s.grid.push(new Array(s.cols).fill(null));
    s.tiles = [];
    s.nextId = 1;
    for (const [r, c, v] of g.tiles) {
      const t = { id: s.nextId++, r: r, c: c, value: v };
      s.grid[r][c] = t;
      s.tiles.push(t);
    }
    s.score = g.score | 0;
    s.hammers = Math.max(0, Math.min(CONFIG.HAMMERS, g.hammers | 0));
    s.drops = g.drops | 0;
    s.won = !!g.won; s.keepPlaying = !!g.keepPlaying; s.over = !!g.over;
    s.current = { id: s.nextId++, value: g.current };
    s.next = { id: s.nextId++, value: g.next };
    return true;
  }

  return { write, read, restore, clear, available: can };
})();

/* ==========================================================================
   الصوت — يُولَّد داخل المتصفح بـ Web Audio، بلا أي ملف صوتي.
   السبب: نغمة الدمج تتغيّر مع قيمة الرقم، فسلسلة الدمج تُسمع كسُلَّم صاعد
   بدل تكرار نفس النقرة. النغمات على سلّم خماسي فأي تتابع منها يبقى متناغمًا.
   ========================================================================== */
const Sound = (function () {
  let ctx = null, on = true, master = null;

  function ready() {
    if (!on) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended" && ctx.resume) ctx.resume();
    return ctx;
  }

  // سلّم خماسي: أي نغمتين منه متآلفتان مهما تتابعتا
  const PENTA = [0, 2, 4, 7, 9];
  function noteFor(value) {
    const e = Math.round(Math.log(value) / Math.LN2);   // 4→2، 8→3 ...
    const i = Math.max(0, e - 2);
    return 392 * Math.pow(2, (PENTA[i % 5] + 12 * Math.floor(i / 5)) / 12);
  }

  // نقرة بداية قصيرة تعطي الصوت "حافة" يُحسّها الإصبع
  function transient(c, dest, t, amp) {
    const n = Math.floor(c.sampleRate * 0.028);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 1.2;
    const g = c.createGain(); g.gain.value = amp;
    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(t); src.stop(t + 0.05);
  }

  /* صوت الدمج: نغمة أساسية + ثامنة خفيفة فوقها، بهجمة سريعة وذيل قصير.
     كلما كبر الرقم ارتفعت النغمة وطال الذيل وزاد العمق. */
  function merge(value) {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const f = noteFor(value || 4);
    const tier = Math.max(0, Math.min(1, (Math.log(value || 4) / Math.LN2 - 2) / 9));
    const dur = 0.26 + 0.18 * tier;

    const g = c.createGain();
    g.connect(master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26 + 0.10 * tier, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(f * 0.97, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.045);   // انزلاق صاعد خفيف
    o.connect(g);

    const o2 = c.createOscillator();                          // ثامنة تعطي لمعانًا
    o2.type = "sine";
    o2.frequency.value = f * 2;
    const g2 = c.createGain(); g2.gain.value = 0.28;
    o2.connect(g2); g2.connect(g);

    o.start(t); o2.start(t);
    o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);

    transient(c, master, t, 0.05 + 0.05 * tier);

    if (tier > 0.45) {                                        // عمق للأرقام الكبيرة
      const sub = c.createOscillator(); sub.type = "sine";
      sub.frequency.setValueAtTime(f / 4, t);
      const sg = c.createGain(); sg.connect(master);
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(0.16 * tier, t + 0.02);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      sub.connect(sg); sub.start(t); sub.stop(t + 0.24);
    }
  }

  function unlock() { ready(); }
  function setEnabled(v) { on = !!v; if (!on && ctx && ctx.suspend) ctx.suspend(); }
  function enabled() { return on; }

  return { merge: merge, noteFor: noteFor, unlock: unlock, setEnabled: setEnabled, enabled: enabled };
})();

/* مبدّل الشاشات: الواجهة الأساسية ↔ شاشة اللعب */
const Screens = (function () {
  const map = { home: document.getElementById("screen-home"),
                store: document.getElementById("screen-store"),
                settings: document.getElementById("screen-settings"),
                game: document.getElementById("screen-game") };
  let cur = "home";
  function show(name) {
    if (!map[name]) return;
    for (const k in map) map[k].classList.toggle("on", k === name);
    cur = name;
  }
  return { show: show, current: () => cur };
})();

/* رسالة عابرة لميزات لم تُبنَ بعد */
const Toast = (function () {
  const el = document.getElementById("toast");
  let t = null;
  function show(msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(t);
    t = setTimeout(() => el.classList.remove("on"), 1900);
  }
  return { show: show };
})();

/* ==========================================================================
   الإعدادات المحفوظة (الصوت واللغة) — مفتاح منفصل عن حفظ الجولة عمدًا،
   حتى لا يتأثر أي منهما بتغييرات الآخر أو بقواعد التحقق الخاصة بالجولة.
   ========================================================================== */
const Prefs = (function () {
  const KEY = "g2048.prefs.v1";
  function can() { try { return !!window.localStorage; } catch (e) { return false; } }
  function read() {
    if (!can()) return {};
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) || {}) : {};
    } catch (e) { return {}; }
  }
  function write(p) {
    if (!can()) return;
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
  }
  return { read: read, write: write };
})();

/* ==========================================================================
   الترجمة — عربي/إنجليزي. كل نص ظاهر في الواجهة مربوط بمفتاح هنا،
   وعناصر HTML تحمل data-i18n بنفس المفتاح فتُحدَّث تلقائيًا عند التبديل.
   ========================================================================== */
const I18N = (function () {
  const STR = {
    ar: {
      home_sub: "اجمع الأرقام حتى ٢٠٤٨",
      home_best_label: "أفضل نتيجة",
      home_play: "العب",
      home_settings: "الإعدادات",
      home_store: "المتجر",
      home_stats: "الإحصائيات",
      home_noads: "إزالة<br>الإعلانات",
      home_noads_short: "إزالة الإعلانات",
      store_title: "المتجر",
      store_tools_head: "أدوات",
      store_soon_head: "قريبًا",
      store_tab_tools: "أدوات",
      store_tab_gold: "الذهب",
      store_gold1_name: "100 ذهب",
      store_gold2_name: "550 ذهب",
      store_gold3_name: "1200 ذهب",
      store_gold4_name: "2600 ذهب",
      store_hammer1_name: "مطرقة",
      store_hammer1_desc: "ضربة واحدة تكسر أي رقم",
      store_hammer5_name: "5 مطارق",
      store_hammer5_desc: "أوفر بنسبة 17%",
      store_hammer5_badge: "الأكثر شراءً",
      store_hammer15_name: "15 مطرقة",
      store_hammer15_desc: "أوفر بنسبة 28%",
      store_hammer15_badge: "أفضل قيمة",
      soon_pill: "قريبًا",
      store_undo_name: "تراجع",
      store_undo_desc: "تراجع عن آخر إطلاق",
      store_delete_name: "حذف القطعة",
      store_delete_desc: "تخلّص من رقم لا مكان له",
      store_swap_name: "تبديل القطعة",
      store_swap_desc: "بدّل الحالية بالتالية",
      store_continue_name: "إكمال بعد الخسارة",
      store_continue_desc: "أفرغ مساحة وأكمل جولتك",
      store_themes_name: "المظاهر",
      store_themes_desc: "ألوان وخلفيات جديدة",
      settings_title: "الإعدادات",
      settings_sound_name: "الصوت",
      settings_sound_desc: "أصوات الدمج داخل اللعبة",
      settings_lang_name: "اللغة",
      settings_lang_desc: "لغة عرض الواجهة",
      back_title: "رجوع",
      game_home_title: "الواجهة الأساسية",
      diag_title: "تشخيص اللمس",
      hammer_title: "اكسر رقمًا عند الازدحام",
      new_game_label: "لعبة جديدة",
      nav_undo_label: "تراجع",
      nav_stats_label: "إحصائيات",
      nav_next_label: "التالي",
      nav_themes_label: "المظاهر",
      nav_achv_label: "الإنجازات",
      stat_best_label: "الأفضل",
      stat_score_label: "النتيجة",
      hint_play: "اضغط في أي مكان بالعمود لإسقاط القطعة فورًا، أو اسحبها يمينًا ويسارًا لضبط مكانها بدقة",
      hint_hammer: "اضغط على الرقم الذي تريد كسره — أو اضغط الشاكوش للإلغاء",
      overlay_keep_btn: "أكمل اللعب",
      overlay_gameover_title: "انتهت اللعبة",
      overlay_score_prefix: "النتيجة: ",
      overlay_win_prefix: "وصلت إلى ",
      crown_name: "التاج",
      toast_unavailable: "هذا العنصر غير متاح",
      watch_ad_label: "شاهد إعلان",
      watch_ad_loading: "جاري تحميل الإعلان...",
      watch_ad_reward: "حصلت على 5 ذهب! 🎉"
    },
    en: {
      home_sub: "Merge numbers to reach 2048",
      home_best_label: "Best Score",
      home_play: "Play",
      home_settings: "Settings",
      home_store: "Store",
      home_stats: "Stats",
      home_noads: "Remove<br>Ads",
      home_noads_short: "Remove Ads",
      store_title: "Store",
      store_tools_head: "Tools",
      store_soon_head: "Coming Soon",
      store_tab_tools: "Tools",
      store_tab_gold: "Gold",
      store_gold1_name: "100 Gold",
      store_gold2_name: "550 Gold",
      store_gold3_name: "1200 Gold",
      store_gold4_name: "2600 Gold",
      store_hammer1_name: "Hammer",
      store_hammer1_desc: "One tap breaks any tile",
      store_hammer5_name: "5 Hammers",
      store_hammer5_desc: "Save 17%",
      store_hammer5_badge: "Best Seller",
      store_hammer15_name: "15 Hammers",
      store_hammer15_desc: "Save 28%",
      store_hammer15_badge: "Best Value",
      soon_pill: "Soon",
      store_undo_name: "Undo",
      store_undo_desc: "Undo your last move",
      store_delete_name: "Delete Tile",
      store_delete_desc: "Remove a tile with no room",
      store_swap_name: "Swap Tile",
      store_swap_desc: "Swap the current tile for the next",
      store_continue_name: "Continue After Loss",
      store_continue_desc: "Clear space and keep playing",
      store_themes_name: "Themes",
      store_themes_desc: "New colors and backgrounds",
      settings_title: "Settings",
      settings_sound_name: "Sound",
      settings_sound_desc: "In-game merge sounds",
      settings_lang_name: "Language",
      settings_lang_desc: "Interface display language",
      back_title: "Back",
      game_home_title: "Home",
      diag_title: "Touch Diagnostics",
      hammer_title: "Break a tile when stuck",
      new_game_label: "New Game",
      nav_undo_label: "Undo",
      nav_stats_label: "Stats",
      nav_next_label: "Next",
      nav_themes_label: "Themes",
      nav_achv_label: "Achievements",
      stat_best_label: "Best",
      stat_score_label: "Score",
      hint_play: "Tap anywhere in a column to drop instantly, or drag left and right to aim precisely",
      hint_hammer: "Tap the tile you want to break — or tap the hammer to cancel",
      overlay_keep_btn: "Keep Playing",
      overlay_gameover_title: "Game Over",
      overlay_score_prefix: "Score: ",
      overlay_win_prefix: "You reached ",
      crown_name: "Crown",
      toast_unavailable: "This item is unavailable",
      watch_ad_label: "Watch Ad",
      watch_ad_loading: "Loading ad...",
      watch_ad_reward: "You got 5 gold! 🎉"
    }
  };

  let lang = "ar";

  function t(key) {
    const d = STR[lang] || STR.ar;
    return (d && d[key] != null) ? d[key] : key;
  }

  function needCoins(n) {
    return lang === "ar" ? ("تنقصك " + n + " عملة") : ("You need " + n + " more coin" + (n === 1 ? "" : "s"));
  }
  function addedHammer(n) {
    if (lang === "ar") return "أُضيفت " + n + (n === 1 ? " مطرقة" : " مطارق");
    return "Added " + n + " hammer" + (n === 1 ? "" : "s");
  }
  function soonToast(label) {
    return lang === "ar" ? ("«" + label + "» قريبًا") : ("“" + label + "” — coming soon");
  }

  function applyLang(next) {
    lang = (next === "en") ? "en" : "ar";
    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === "ar") ? "rtl" : "ltr";

    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (el) {
      el.textContent = t(el.dataset.i18n);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-html]"), function (el) {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-title]"), function (el) {
      el.title = t(el.dataset.i18nTitle);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-soon]"), function (el) {
      el.dataset.soon = t(el.dataset.i18nSoon);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".lang-btn"), function (el) {
      el.classList.toggle("active", el.dataset.lang === lang);
    });

    Prefs.write(Object.assign({}, Prefs.read(), { lang: lang }));
  }

  function current() { return lang; }

  return { applyLang: applyLang, current: current, t: t, needCoins: needCoins, addedHammer: addedHammer, soonToast: soonToast };
})();

/* ------------------------------ 2) ENGINE ------------------------------
   محرك الإسقاط: القطعة تنطلق من الأسفل إلى أعلى العمود، فتستقر تحت
   ما فوقها. الجاذبية للأعلى، لذلك الفراغ يتجمع في أسفل اللوحة.
   المحرك لا يعرف شيئًا عن الشاشة؛ يعيد فقط قائمة "خطوات" ترسمها الواجهة.
   ---------------------------------------------------------------------- */
const Engine = (function () {

  function createState(rng) {
    const s = {
      rows: CONFIG.ROWS, cols: CONFIG.COLS,
      grid: null, tiles: [],
      current: null, next: null,
      score: 0, best: 0,
      won: false, keepPlaying: false, over: false,
      hammers: CONFIG.HAMMERS,   // المجانية، تتجدد كل جولة
      hammerStock: 0,            // المشتراة، تبقى بين الجولات
      coins: 0, coinAcc: 0,      // الرصيد وكسور النقاط التي لم تكتمل عملة بعد
      drops: 0, nextId: 1,
      rng: rng || Math.random
    };
    reset(s);
    return s;
  }

  function emptyGrid(rows, cols) {
    const g = new Array(rows);
    for (let r = 0; r < rows; r++) g[r] = new Array(cols).fill(null);
    return g;
  }

  function reset(s) {
    s.grid = emptyGrid(s.rows, s.cols);
    s.tiles = [];
    s.score = 0;
    s.won = false; s.keepPlaying = false; s.over = false;
    s.hammers = CONFIG.HAMMERS;   // العملات والمخزون لا تُمسّ: ملك اللاعب لا ملك الجولة
    s.drops = 0; s.nextId = 1;
    s.current = queued(s);
    s.next = queued(s);
    return s;
  }

  // قيمة القطعة القادمة حسب الاحتمالات المضبوطة في CONFIG
  function randomValue(s) {
    const pool = CONFIG.SPAWN_POOL, w = CONFIG.SPAWN_WEIGHTS;
    let x = s.rng(), acc = 0;
    for (let i = 0; i < pool.length; i++) { acc += w[i]; if (x < acc) return pool[i]; }
    return pool[pool.length - 1];
  }
  function queued(s) { return { id: s.nextId++, value: randomValue(s) }; }

  function addTile(s, t) { s.grid[t.r][t.c] = t; s.tiles.push(t); }
  function removeTile(s, t) {
    if (s.grid[t.r][t.c] === t) s.grid[t.r][t.c] = null;
    const i = s.tiles.indexOf(t);
    if (i >= 0) s.tiles.splice(i, 1);
  }

  // العمود ممتلئ من الأعلى، فالقطعة تستقر في أول خانة فارغة من الأعلى
  function landingRow(s, c) {
    for (let r = 0; r < s.rows; r++) if (!s.grid[r][c]) return r;
    return -1;                     // العمود ممتلئ
  }
  function canDrop(s, c) {
    if (s.over) return false;
    if (s.won && !s.keepPlaying) return false;
    if (c < 0 || c >= s.cols) return false;
    return landingRow(s, c) >= 0;
  }

  // الجيران الأربعة الذين يحملون نفس القيمة
  function sameNeighbors(s, t) {
    const out = [], d = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of d) {
      const r = t.r + dr, c = t.c + dc;
      if (r < 0 || r >= s.rows || c < 0 || c >= s.cols) continue;
      const n = s.grid[r][c];
      if (n && n.value === t.value) out.push(n);
    }
    return out;
  }

  // أي زوج متجاور متساوٍ في اللوحة (بترتيب ثابت: الأعلى ثم الأيسر)
  function findAnyGroup(s) {
    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        const t = s.grid[r][c];
        if (!t) continue;
        const g = sameNeighbors(s, t);
        if (g.length) return { tile: t, group: g };
      }
    }
    return null;
  }

  // الجاذبية للأعلى: كل عمود يُرصّ إلى أعلاه
  function gravity(s) {
    const moves = [];
    for (let c = 0; c < s.cols; c++) {
      const col = [];
      for (let r = 0; r < s.rows; r++) {
        const t = s.grid[r][c];
        if (t) col.push(t);
        s.grid[r][c] = null;
      }
      for (let i = 0; i < col.length; i++) {
        const t = col[i];
        if (t.r !== i) { t.r = i; moves.push({ id: t.id, r: i, c: c }); }
        s.grid[i][c] = t;
      }
    }
    return moves;
  }

  /* إسقاط القطعة الحالية في العمود c.
     يعيد { ok, steps } — و steps قائمة مرتّبة ترسمها الواجهة:
       { t:'land',  id, r, c, value }
       { t:'merge', id, r, c, value, absorbed:[{id,r,c}...] }
       { t:'fall',  moves:[{id,r,c}...] }                        */
  function drop(s, c) {
    if (!canDrop(s, c)) return { ok: false, steps: [] };

    const r = landingRow(s, c);
    const t = { id: s.current.id, r: r, c: c, value: s.current.value };
    addTile(s, t);
    const steps = [{ t: 'land', id: t.id, r: r, c: c, value: t.value }];

    s.current = s.next;
    s.next = queued(s);
    s.drops++;

    resolve(s, steps, t);

    if (emptyCount(s) === 0) s.over = true;
    if (s.score > s.best) s.best = s.score;
    return { ok: true, steps: steps, won: s.won, over: s.over };
  }

  /* سلسلة الدمج: القطعة تبتلع كل جيرانها المتساوين دفعة واحدة،
     ثم تسقط اللوحة، ثم يُعاد الفحص حتى تستقر — فلا يبقى أي جارين متساويين. */
  function resolve(s, steps, active) {
    let guard = 0;
    while (guard++ < 400) {
      let tile = active, group = active ? sameNeighbors(s, active) : [];
      if (!group.length) {
        const found = findAnyGroup(s);
        if (!found) break;
        tile = found.tile; group = found.group;
      }

      const value = tile.value * Math.pow(2, group.length);
      const absorbed = [{ id: tile.id, r: tile.r, c: tile.c }];
      for (const g of group) absorbed.push({ id: g.id, r: g.r, c: g.c });

      const at = { r: tile.r, c: tile.c };
      for (const g of group) removeTile(s, g);
      removeTile(s, tile);

      const merged = { id: s.nextId++, r: at.r, c: at.c, value: value };
      addTile(s, merged);
      s.score += value;
      earn(s, value);
      if (value >= CONFIG.WIN_VALUE) s.won = true;

      steps.push({ t: 'merge', id: merged.id, r: at.r, c: at.c, value: value, absorbed: absorbed });

      const moves = gravity(s);
      if (moves.length) steps.push({ t: 'fall', moves: moves });

      active = merged;
    }
  }

  /* الشاكوش: يكسر رقمًا واحدًا عند الازدحام.
     بعد الكسر تسقط اللوحة وقد تنشأ تجاورات جديدة فتندمج تلقائيًا. */
  function hammersLeft(s) { return (s.hammers | 0) + (s.hammerStock | 0); }
  function canSmash(s) {
    return !s.over && !(s.won && !s.keepPlaying) && hammersLeft(s) > 0 && s.tiles.length > 0;
  }
  function smash(s, r, c) {
    if (!canSmash(s)) return { ok: false, steps: [] };
    if (r < 0 || r >= s.rows || c < 0 || c >= s.cols) return { ok: false, steps: [] };
    const t = s.grid[r][c];
    if (!t) return { ok: false, steps: [] };

    const steps = [{ t: 'smash', id: t.id, r: r, c: c, value: t.value }];
    removeTile(s, t);
    if (s.hammers > 0) s.hammers--; else s.hammerStock--;   // المجانية أولًا

    const moves = gravity(s);
    if (moves.length) steps.push({ t: 'fall', moves: moves });
    resolve(s, steps, null);          // الدمج التلقائي بعد السقوط

    return { ok: true, steps: steps };
  }

  // كل دمج يقرّب اللاعب من عملة؛ الكسور تتراكم فلا تضيع نقطة
  function earn(s, points) {
    s.coinAcc += points;
    while (s.coinAcc >= CONFIG.COIN_PER) { s.coinAcc -= CONFIG.COIN_PER; s.coins++; }
  }

  function itemById(id) {
    for (const it of CONFIG.SHOP) if (it.id === id) return it;
    return null;
  }
  /* الشراء: يعيد سبب الرفض بدل رميه، حتى تعرض الواجهة رسالة مفهومة */
  function buy(s, id) {
    const it = itemById(id);
    if (!it) return { ok: false, why: "unknown" };
    if (s.coins < it.price) return { ok: false, why: "poor", need: it.price - s.coins };
    s.coins -= it.price;
    if (it.kind === "hammer") s.hammerStock += it.n;
    return { ok: true, item: it };
  }

  function emptyCount(s) {
    let n = 0;
    for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) if (!s.grid[r][c]) n++;
    return n;
  }
  function highestTile(s) {
    let m = 0;
    for (const t of s.tiles) if (t.value > m) m = t.value;
    return m;
  }
  function toValues(s) {
    return s.grid.map(row => row.map(t => t ? t.value : 0));
  }
  // هل يوجد أي عمود يقبل إسقاطًا؟
  function anyDropAvailable(s) {
    for (let c = 0; c < s.cols; c++) if (landingRow(s, c) >= 0) return true;
    return false;
  }

  return {
    createState, reset, drop, canDrop, landingRow, gravity, smash, canSmash,
    buy, itemById, hammersLeft, earn,
    sameNeighbors, findAnyGroup, emptyCount, highestTile, toValues, anyDropAvailable
  };
})();

/* ------------------------------ 3) RENDER ------------------------------ */
const Render = (function () {
  const $ = sel => document.querySelector(sel);
  const elBoard = $("#board"), elTiles = $("#tiles"), elCells = $("#cells"), elFx = $("#fx");
  const elMark = $("#col-mark");
  const elScore = $("#score"), elBest = $("#best");
  const elOverlay = $("#overlay"), elOvTitle = $("#overlay-title"),
        elOvSub = $("#overlay-sub"), elKeep = $("#btn-keep");
  const elNext = $("#lch-next"), elFrame = $("#carriage-frame");

  const G = CONFIG.GAP_RATIO;
  const UW = CONFIG.COLS + (CONFIG.COLS + 1) * G;
  const UF = CONFIG.ROWS + (CONFIG.ROWS + 1) * G;   // ارتفاع إطار اللعب
  const UH = UF + 1 + G;                            // + صف القطعة الجاهزة أسفله
  const CELL_X = 100 / UW, GAP_X = 100 * G / UW;
  const CELL_Y = 100 / UH, GAP_Y = 100 * G / UH;
  const STEP = (1 + G) * 100;
  const AIM_MS = 90;

  if (elBoard) {
    elBoard.style.aspectRatio = UW + " / " + UH;
    elBoard.style.setProperty("--lane-top", (UF / UH * 100).toFixed(4) + "%");
    elBoard.style.setProperty("--aim", AIM_MS + "ms");
    elBoard.style.setProperty("--tile-w", CELL_X.toFixed(4) + "%");
    elBoard.style.setProperty("--tile-h", CELL_Y.toFixed(4) + "%");
    elBoard.style.setProperty("--pad-x", GAP_X.toFixed(4) + "%");
    elBoard.style.setProperty("--pad-y", GAP_Y.toFixed(4) + "%");
    elBoard.style.setProperty("--cellw", CELL_X.toFixed(4));
  }

  const nodes = new Map();
  let timers = [];
  let pendingState = null;

  const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const D = reduced
    ? { drop: 1, slide: 1, collapse: 1, pop: 1, fall: 1, smash: 1 }
    : { drop: CONFIG.ANIM.DROP, slide: CONFIG.ANIM.SLIDE, collapse: CONFIG.ANIM.COLLAPSE,
        pop: CONFIG.ANIM.POP, fall: CONFIG.ANIM.FALL, smash: CONFIG.ANIM.SMASH };
  if (elBoard) elBoard.style.setProperty("--slide", D.slide + "ms");

  const posX = c => GAP_X + c * (CELL_X + GAP_X);
  const posY = r => GAP_Y + r * (CELL_Y + GAP_Y);
  const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const tierOf = v => Math.max(0, Math.min(1, (Math.log(v) / Math.LN2 - 2) / 9));

  function buildCells(rows, cols) {
    elCells.innerHTML = "";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d = document.createElement("div");
        d.className = "cell";
        d.style.top = posY(r).toFixed(4) + "%";
        d.style.left = posX(c).toFixed(4) + "%";
        elCells.appendChild(d);
      }
    }
  }

  function place(n, r, c) {
    n.el.style.transform = "translate(" + (c * STEP).toFixed(4) + "%," + (r * STEP).toFixed(4) + "%)";
  }
  function setValue(n, v) {
    n.inner.textContent = String(v);
    n.inner.dataset.len = String(String(v).length);
    n.el.dataset.value = String(v);
    n.el.classList.toggle("super", v > 2048);
  }
  function makeNode(t) {
    const el = document.createElement("div");
    el.className = "tile";
    el.dataset.id = String(t.id);
    el.style.transition = "none";
    const inner = document.createElement("div");
    inner.className = "tile-inner";
    el.appendChild(inner);
    elTiles.appendChild(el);
    const n = { el, inner };
    setValue(n, t.value);
    place(n, t.r, t.c);
    void el.offsetWidth;
    el.style.transition = "";
    nodes.set(t.id, n);
    return n;
  }
  function dropNode(id) {
    const n = nodes.get(id);
    if (n) { n.el.remove(); nodes.delete(id); }
  }

  /* العربة: القطعة الجاهزة، تقف في الصف الإضافي أسفل اللوحة
     ويحرّكها اللاعب بإصبعه بين الأعمدة قبل الإطلاق. */
  let carriage = null;
  let aimCol = Math.floor(CONFIG.COLS / 2);

  // الموضع يقبل كسورًا، فتتحرك القطعة بحرية بين الأعمدة لا بالقفز بينها
  function placeF(n, r, colF) {
    n.el.style.transform =
      "translate(" + (colF * STEP).toFixed(4) + "%," + (r * STEP).toFixed(4) + "%)";
  }
  function frameAt(colF) {
    if (!elFrame) return;
    elFrame.style.transform =
      "translate(" + (colF * STEP).toFixed(4) + "%," + (CONFIG.ROWS * STEP).toFixed(4) + "%)";
  }
  function markAt(c) {
    if (!elMark) return;
    elMark.style.left = posX(c).toFixed(4) + "%";
    elMark.classList.add("on");
  }
  const clampCol = v => Math.max(0, Math.min(CONFIG.COLS - 1, v));

  function buildCarriage(s) {
    if (carriage) { carriage.el.remove(); carriage = null; }
    if (!s.current || s.over || (s.won && !s.keepPlaying)) {
      if (elFrame) elFrame.style.opacity = "0";
      return;
    }
    if (elFrame) elFrame.style.opacity = "";
    const n = makeNode({ id: "carriage", r: CONFIG.ROWS, c: aimCol, value: s.current.value });
    nodes.delete("carriage");            // ليست قطعة على اللوحة
    n.el.classList.add("carriage");
    n.el.style.transitionDuration = AIM_MS + "ms";
    n.el.style.zIndex = "2";
    carriage = n;
    frameAt(aimCol);
  }

  // نقل القطعة إلى عمود محدد (لوحة المفاتيح، أو استقرارها بعد رفع الإصبع)
  function aim(c) {
    if (c === null || c === undefined) { if (elMark) elMark.classList.remove("on"); return; }
    aimCol = clampCol(Math.round(c));
    if (carriage) {
      carriage.el.style.transitionDuration = AIM_MS + "ms";
      place(carriage, CONFIG.ROWS, aimCol);
    }
    if (elFrame) elFrame.style.transitionDuration = "";
    frameAt(aimCol);
    markAt(aimCol);
  }
  function aimed() { return aimCol; }

  /* ---------- السحب الحر باللزوجة ----------
     القطعة لا تقفز بين الأعمدة: تلاحق الإصبع كل إطار بنعومة (FOLLOW)،
     مع انجذاب مغناطيسي نحو مركز أقرب عمود (MAGNET) فتُحسّ باستقرارها في مكانها.
     نفس الفكرة تنطبق رأسيًا: القطعة تقدر تدخل داخل الصندوق فعليًا وهي بيد
     اللاعب (مو محصورة بخط الممر السفلي)، وعند الإفلات تكمل حركتها من نفس
     نقطتها بسلاسة نحو خانتها النهائية بدل ما ترجع تُجبر لأسفل أول. */
  let dragging = false, dragTarget = 0, dragShown = 0, raf = null;
  let dragTargetRow = CONFIG.ROWS, dragShownRow = CONFIG.ROWS;
  const clampRow = v => Math.max(0, Math.min(CONFIG.ROWS, v));

  function dragStart(colF, rowF) {
    if (!carriage) return;
    dragging = true;
    dragShown = aimCol;
    dragTarget = clampCol(colF);
    dragShownRow = CONFIG.ROWS;
    dragTargetRow = clampRow(rowF === undefined ? CONFIG.ROWS : rowF);
    carriage.el.style.transitionDuration = "0ms";
    if (elFrame) elFrame.style.transitionDuration = "0ms";
    if (raf === null) tick();
  }
  function dragMove(colF, rowF) {
    if (!dragging) return;
    dragTarget = clampCol(colF);
    if (rowF !== undefined) dragTargetRow = clampRow(rowF);
  }
  function tick() {
    const near = Math.round(dragTarget);
    const M = CONFIG.DRAG.MAGNET, F = CONFIG.DRAG.FOLLOW;
    const sticky = near + (dragTarget - near) * (1 - M);   // انجذاب نحو مركز العمود
    dragShown += (sticky - dragShown) * F;                 // لحاق لزج بالإصبع أفقيًا
    if (Math.abs(sticky - dragShown) < 0.002) dragShown = sticky;
    dragShownRow += (dragTargetRow - dragShownRow) * F;    // لحاق حر بالإصبع رأسيًا (بلا انجذاب)
    if (Math.abs(dragTargetRow - dragShownRow) < 0.002) dragShownRow = dragTargetRow;
    if (carriage) placeF(carriage, dragShownRow, dragShown);
    frameAt(dragShown);
    markAt(clampCol(Math.round(dragShown)));
    raf = dragging ? requestAnimationFrame(tick) : null;
  }
  /* رفع الإصبع: العبرة بموضع الإصبع (dragTarget) لا بموضع القطعة المتأخر عنه
     (dragShown). كان هذا هو الخطأ: الضغطة السريعة كانت تُطلق من العمود القديم
     لأن القطعة لم تكن قد لحقت بالإصبع بعد.
     كذلك، لا نُجبر القطعة على القفز رأسيًا لخط الممر عند الإفلات — نتركها في
     مكانها الحالي (وهو نفس مكان إصبع اللاعب لحظة الرفع) لتكمل منه حركة
     "الهبوط" بسلاسة نحو خانتها النهائية بدل قفزتين منفصلتين. */
  function dragEnd() {
    if (!dragging) return aimCol;
    dragging = false;
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    aimCol = clampCol(Math.round(dragTarget));
    if (elFrame) elFrame.style.transitionDuration = AIM_MS + "ms";
    frameAt(aimCol);
    if (elMark) elMark.classList.remove("on");
    return aimCol;
  }
  function isDragging() { return dragging; }

  function syncLauncher(s) {
    if (elNext) {
      const inner = elNext.querySelector(".tile-inner");
      if (!s.next) elNext.classList.add("empty");
      else {
        elNext.classList.remove("empty");
        elNext.dataset.value = String(s.next.value);
        elNext.classList.toggle("super", s.next.value > 2048);
        inner.textContent = String(s.next.value);
        inner.dataset.len = String(String(s.next.value).length);
      }
    }
    buildCarriage(s);
  }

  function snap(s) {
    const alive = new Set(s.tiles.map(t => t.id));
    for (const id of Array.from(nodes.keys())) if (!alive.has(id)) dropNode(id);
    for (const t of s.tiles) {
      let n = nodes.get(t.id);
      if (!n) { makeNode(t); continue; }
      setValue(n, t.value);
      n.inner.style.animation = "";
      n.el.style.zIndex = "";
      n.el.style.transition = "none";
      place(n, t.r, t.c);
      void n.el.offsetWidth;
      n.el.style.transition = "";
    }
    elFx.innerHTML = "";
    syncLauncher(s);
    syncHud(s);
  }

  function commit() {
    clearTimers();
    if (pendingState) { const s = pendingState; pendingState = null; snap(s); }
  }

  function burst(r, c, tier) {
    if (reduced) return;
    const wrap = document.createElement("div");
    wrap.className = "fx";
    wrap.style.transform = "translate(" + (c * STEP).toFixed(4) + "%," + (r * STEP).toFixed(4) + "%)";
    wrap.style.setProperty("--fx-a", (0.36 + 0.55 * tier).toFixed(2));
    wrap.style.setProperty("--fx-s", (1.5 + 1.35 * tier).toFixed(2));
    const glow = document.createElement("div"); glow.className = "fx-glow";
    const ring = document.createElement("div"); ring.className = "fx-ring";
    wrap.appendChild(glow); wrap.appendChild(ring);
    // موجة ثانية متأخرة قليلًا للدمجات الأقوى — إحساس صدمتين متتاليتين
    if (tier > 0.4) {
      const ring2 = document.createElement("div");
      ring2.className = "fx-ring";
      ring2.style.animationDelay = "70ms";
      ring2.style.setProperty("--fx-s", (1.1 + 0.9 * tier).toFixed(2));
      wrap.appendChild(ring2);
    }
    const sparks = tier < 0.2 ? 4 : Math.round(7 + 11 * tier);
    for (let i = 0; i < sparks; i++) {
      const sp = document.createElement("i");
      sp.className = "fx-spark";
      const a = (i / sparks) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 30 + 46 * tier;
      sp.style.setProperty("--dx", (Math.cos(a) * dist).toFixed(1) + "px");
      sp.style.setProperty("--dy", (Math.sin(a) * dist).toFixed(1) + "px");
      sp.style.animationDelay = Math.round(Math.random() * 40) + "ms";
      wrap.appendChild(sp);
    }
    elFx.appendChild(wrap);
    setTimeout(() => wrap.remove(), 700);
    if (tier > 0.16 && elBoard) {
      elBoard.style.setProperty("--nudge-y", (2.5 + 4.5 * tier).toFixed(1) + "px");
      elBoard.style.setProperty("--nudge-r", ((tier > 0.5 ? 1 : 0.4) * (0.4 + 0.7 * tier)).toFixed(2) + "deg");
      elBoard.style.setProperty("--nudge-ms", Math.round(170 + 60 * tier) + "ms");
      elBoard.classList.remove("nudge");
      void elBoard.offsetWidth;
      elBoard.classList.add("nudge");
      setTimeout(() => elBoard.classList.remove("nudge"), 260);
    }
  }

  /* رقم النقاط العائم فوق مكان الدمج */
  function scorePopup(r, c, value) {
    if (reduced) return;
    const wrap = document.createElement("div");
    wrap.className = "fx-score";
    wrap.style.transform = "translate(" + (c * STEP).toFixed(4) + "%," + (r * STEP).toFixed(4) + "%)";
    const span = document.createElement("span");
    span.textContent = "+" + value;
    wrap.appendChild(span);
    elFx.appendChild(wrap);
    setTimeout(() => wrap.remove(), 850);
  }

  /* تشغيل خطوات المحرك واحدة بعد الأخرى */
  function play(s, steps) {
    clearTimers();
    pendingState = s;
    let i = 0;

    function step() {
      if (i >= steps.length) {
        later(() => { pendingState = null; snap(s); }, D.pop);
        return;
      }
      const st = steps[i++];

      if (st.t === 'land') {
        // العنصر نفسه الذي كان بيد اللاعب هو الذي ينطلق — بلا استبدال
        let n = carriage;
        if (n) {
          carriage = null;
          n.el.classList.remove("carriage");   // صارت قطعة لعب حقيقية
          n.el.dataset.id = String(st.id);
          setValue(n, st.value);
          nodes.set(st.id, n);
        } else {
          n = makeNode({ id: st.id, r: CONFIG.ROWS, c: st.c, value: st.value });
        }
        n.el.style.zIndex = "3";
        n.el.style.transitionDuration = D.drop + "ms";
        place(n, st.r, st.c);
        syncLauncher(s);                       // القطعة التالية تحل مكانها فورًا
        later(step, D.drop + 15);

      } else if (st.t === 'merge') {
        // (1) كل القطع المندمجة تنزلق إلى خانة واحدة
        for (const a of st.absorbed) {
          const n = nodes.get(a.id);
          if (!n) continue;
          n.el.style.zIndex = "1";
          n.el.style.transitionDuration = D.slide + "ms";
          place(n, st.r, st.c);
        }
        later(() => {
          // (2) تنكمش وتختفي
          for (const a of st.absorbed) {
            const n = nodes.get(a.id);
            if (n) n.inner.style.animation = "src-collapse " + D.collapse + "ms ease-in forwards";
          }
          later(() => {
            // (3) تُحذف، ثم يظهر الرقم الجديد وحده في مركز الخانة
            for (const a of st.absorbed) dropNode(a.id);
            const n = makeNode({ id: st.id, r: st.r, c: st.c, value: st.value });
            const tier = tierOf(st.value);
            const popMs = Math.round(D.pop + 45 * tier);
            const rot = (Math.random() < 0.5 ? -1 : 1) * Math.round(2 + 4 * tier);
            n.el.style.zIndex = "3";
            n.inner.style.setProperty("--pop-max", (1.07 + 0.09 * tier).toFixed(3));
            n.inner.style.setProperty("--pop-rot", rot + "deg");
            n.inner.style.setProperty("--glow-a", (0.34 + 0.5 * tier).toFixed(2));
            n.inner.style.setProperty("--glow-blur", Math.round(8 + 20 * tier) + "px");
            n.inner.style.setProperty("--glow-spread", (1.5 + 5 * tier).toFixed(1) + "px");
            n.inner.style.animation = reduced ? ""
              : "tile-pop " + popMs + "ms cubic-bezier(.32,1.28,.55,1) both, "
              + "merge-glow " + (popMs + 130) + "ms ease-out";
            if (!reduced) {
              const flash = document.createElement("div");
              flash.className = "tile-flash";
              flash.style.setProperty("--flash-a", (0.55 + 0.35 * tier).toFixed(2));
              flash.style.setProperty("--flash-ms", Math.round(220 + 140 * tier) + "ms");
              n.el.appendChild(flash);
              setTimeout(() => flash.remove(), 400);
            }
            burst(st.r, st.c, tier);
            scorePopup(st.r, st.c, st.value);
            Sound.merge(st.value);          // الصوت مع ظهور الرقم لا قبله
            elScore.textContent = String(s.score);
            elBest.textContent = String(s.best);
            later(step, Math.round(D.pop * 0.55));   // السلسلة تكمل بسرعة
          }, D.collapse);
        }, D.slide);

      } else if (st.t === 'smash') {
        const n = nodes.get(st.id);
        if (n) {
          n.el.style.zIndex = "3";
          n.inner.style.animation = reduced ? "" : "tile-smash " + D.smash + "ms cubic-bezier(.3,.1,.5,1) both";
          burst(st.r, st.c, tierOf(st.value));
        }
        later(() => { dropNode(st.id); step(); }, D.smash);

      } else if (st.t === 'fall') {
        for (const m of st.moves) {
          const n = nodes.get(m.id);
          if (!n) continue;
          n.el.style.zIndex = "2";
          n.el.style.transitionDuration = D.fall + "ms";
          place(n, m.r, m.c);
        }
        later(step, D.fall + 15);

      } else {
        step();
      }
    }
    step();
  }

  function markColumn(c) {
    if (!elMark) return;
    if (c == null) { elMark.classList.remove("on"); return; }
    elMark.style.left = posX(c).toFixed(4) + "%";
    elMark.classList.add("on");
  }

  /* من إحداثيات اللمس إلى خانة في الشبكة — يحتاجه الشاكوش */
  function cellAt(x, y) {
    const rect = elBoard.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ux = ((x - rect.left) / rect.width) * UW;     // بوحدة "مربع واحد"
    const uy = ((y - rect.top) / rect.height) * UH;
    const c = Math.floor((ux - G) / (1 + G));
    const r = Math.floor((uy - G) / (1 + G));
    if (r < 0 || r >= CONFIG.ROWS || c < 0 || c >= CONFIG.COLS) return null;  // الممر مستثنى
    return { r: r, c: c };
  }

  let hammerOn = false;
  function setHammer(on) {
    hammerOn = !!on;
    if (elBoard) elBoard.classList.toggle("hammer-on", hammerOn);
  }
  function hammerActive() { return hammerOn; }

  function syncHud(s) {
    elScore.textContent = String(s.score);
    elBest.textContent = String(s.best);
    if (s.over) {
      elOvTitle.textContent = I18N.t("overlay_gameover_title");
      elOvSub.textContent = I18N.t("overlay_score_prefix") + s.score;
      elKeep.style.display = "none";
      elOverlay.classList.add("show");
    } else if (s.won && !s.keepPlaying) {
      elOvTitle.textContent = I18N.t("overlay_win_prefix") + CONFIG.WIN_VALUE;
      elOvSub.textContent = I18N.t("overlay_score_prefix") + s.score;
      elKeep.style.display = "";
      elOverlay.classList.add("show");
    } else {
      elOverlay.classList.remove("show");
    }
  }

  return {
    buildCells, draw: snap, play, commit, syncHud, syncLauncher,
    aim, aimed, dragStart, dragMove, dragEnd, isDragging, markColumn,
    cellAt, setHammer, hammerActive,
    isAnimating: () => pendingState !== null
  };
})();

/* ------------------------------ 4) INPUT -------------------------------
   ثلاث طبقات متتالية حتى لا يبقى جهاز بلا استجابة:
     1) Pointer Events  — الأحدث، يغطي اللمس والفأرة معًا
     2) Touch + Mouse   — للأجهزة التي لا تدعم Pointer
     3) click           — احتياط أخير: الضغطة وحدها تُسقط القطعة
   ---------------------------------------------------------------------- */
const Input = (function () {
  function attach(area, board, H) {
    // موضع الإصبع → عمود كسري: مركز العمود c عند القيمة c بالضبط
    function colFloatAt(x) {
      const rect = board.getBoundingClientRect();
      if (!rect.width) return null;
      return ((x - rect.left) / rect.width) * CONFIG.COLS - 0.5;
    }
    // موضع الإصبع → صف كسري: من 0 (أعلى الصندوق) إلى ROWS (ممر الإطلاق أسفله)
    // حتى تقدر القطعة تدخل داخل الصندوق فعليًا وهي بيد اللاعب، مو محصورة بالممر.
    function rowFloatAt(y) {
      const rect = board.getBoundingClientRect();
      if (!rect.height) return null;
      return ((y - rect.top) / rect.height) * (CONFIG.ROWS + 1) - 0.5;
    }
    const isBtn = e => !!(e.target && e.target.closest && e.target.closest("button"));

    let active = false, lastEnd = 0;

    function begin(x, y, src) {
      Sound.unlock();                        // أول لمسة تفتح الصوت (شرط المتصفحات)
      // وضع الشاكوش: اللمسة تكسر رقمًا بدل أن تحرّك القطعة
      if (H.hammerActive()) {
        const cell = H.cellAt(x, y);
        Diag.set({ حدث: "شاكوش", س: Math.round(x), ص: Math.round(y),
                   خانة: cell ? (cell.r + "," + cell.c) : "خارج الشبكة" });
        if (cell) H.smash(cell.r, cell.c);
        return false;
      }
      const c = colFloatAt(x), r = rowFloatAt(y);
      Diag.set({ حدث: src + "↓", س: Math.round(x), عمود: c === null ? "؟" : c.toFixed(2) });
      if (c === null) return false;
      active = true;
      H.dragStart(c, r);
      return true;
    }
    function moveTo(x, y, src) {
      if (!active) return;
      const c = colFloatAt(x), r = rowFloatAt(y);
      if (c === null) return;
      Diag.set({ حدث: src + "→", س: Math.round(x), عمود: c.toFixed(2) });
      H.dragMove(c, r);
    }
    function finish(x, y, src) {
      if (!active) return;
      active = false;
      const c = colFloatAt(x), r = rowFloatAt(y);
      if (c !== null) H.dragMove(c, r);
      const col = H.dragEnd();
      lastEnd = Date.now();
      Diag.set({ حدث: src + "↑", س: Math.round(x), عمود: col, يقبل: H.canDrop(col) ? "نعم" : "لا" });
      H.drop(col);
    }
    function abort() { if (!active) return; active = false; H.dragEnd(); }

    if (window.PointerEvent) {
      area.addEventListener("pointerdown", e => {
        if (isBtn(e)) return;
        if (e.pointerId != null && area.setPointerCapture) {
          try { area.setPointerCapture(e.pointerId); } catch (_) {}
        }
        if (begin(e.clientX, e.clientY, "لمس") && e.cancelable) e.preventDefault();
      });
      area.addEventListener("pointermove", e => {
        moveTo(e.clientX, e.clientY, "لمس");
        if (active && e.cancelable) e.preventDefault();
      });
      area.addEventListener("pointerup", e => finish(e.clientX, e.clientY, "لمس"));
      window.addEventListener("pointerup", e => finish(e.clientX, e.clientY, "لمس"));
      area.addEventListener("pointercancel", abort);
    } else {
      area.addEventListener("touchstart", e => {
        if (isBtn(e) || e.touches.length !== 1) return;
        if (begin(e.touches[0].clientX, e.touches[0].clientY, "لمس") && e.cancelable) e.preventDefault();
      }, { passive: false });
      area.addEventListener("touchmove", e => {
        if (!e.touches.length) return;
        moveTo(e.touches[0].clientX, e.touches[0].clientY, "لمس");
        if (active && e.cancelable) e.preventDefault();
      }, { passive: false });
      area.addEventListener("touchend", e => finish(e.changedTouches[0].clientX, e.changedTouches[0].clientY, "لمس"));
      area.addEventListener("touchcancel", abort);
      area.addEventListener("mousedown", e => { if (!isBtn(e)) begin(e.clientX, e.clientY, "فأرة"); });
      window.addEventListener("mousemove", e => moveTo(e.clientX, e.clientY, "فأرة"));
      window.addEventListener("mouseup", e => finish(e.clientX, e.clientY, "فأرة"));
    }

    // الاحتياط الأخير: لو لم يصل أي حدث سحب أصلًا، تكفي الضغطة
    area.addEventListener("click", e => {
      if (isBtn(e)) return;
      if (H.hammerActive()) return;               // الشاكوش يُعالَج في begin
      if (Date.now() - lastEnd < 600) return;     // كانت ضغطة تابعة لسحبة، تُتجاهل
      const c = colFloatAt(e.clientX);
      if (c === null) return;
      const col = Math.max(0, Math.min(CONFIG.COLS - 1, Math.round(c)));
      Diag.set({ حدث: "ضغطة-احتياط", س: Math.round(e.clientX), عمود: col });
      H.aim(col);
      H.drop(col);
    });

    // لوحة المفاتيح: الأرقام 1-5 إطلاق مباشر، الأسهم تحريك، Enter إطلاق
    window.addEventListener("keydown", e => {
      if (e.key === "Escape") { H.cancelHammer(); return; }
      if (H.hammerActive()) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= CONFIG.COLS) { e.preventDefault(); H.aim(num - 1); H.drop(num - 1); return; }
      const cur = H.aimed();
      if (e.key === "ArrowLeft")  { e.preventDefault(); H.aim(Math.max(0, cur - 1)); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); H.aim(Math.min(CONFIG.COLS - 1, cur + 1)); return; }
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); H.drop(cur); }
    });
  }
  return { attach: attach };
})();

/* -------------------------------- 5) APP -------------------------------- */
const App = (function () {
  let state = null;

  function newGame() {
    Render.commit();
    if (!state) state = Engine.createState();
    const best = state.best;
    Engine.reset(state);
    state.best = best;   // الأفضل يبقى داخل الجلسة (الحفظ الدائم في المرحلة 6)
    Render.setHammer(false);
    Render.draw(state);
    syncHammer();
    syncHome();
    Save.write(state);
  }

  function doDrop(col) {
    if (!Engine.canDrop(state, col)) { Render.syncHud(state); return { ok: false }; }
    Render.commit();
    const res = Engine.drop(state, col);
    if (res.ok) Render.play(state, res.steps);
    else Render.syncHud(state);
    syncHammer();
    syncHome();
    Save.write(state);
    return res;
  }

  function keepPlaying() {
    state.keepPlaying = true;
    Render.syncHud(state);
    Save.write(state);
  }

  /* ---- الشاكوش ---- */
  const elHammer = () => document.getElementById("btn-hammer");
  const elCount  = () => document.getElementById("hammer-count");
  const elHint   = () => document.querySelector(".hint");

  function syncHome() {
    const b = document.getElementById("home-best");
    if (b) b.textContent = String(state.best);
    const c = document.getElementById("home-coins");
    if (c) c.textContent = String(state.coins);
  }

  /* ---- المتجر ---- */
  function syncShop() {
    const c = document.getElementById("shop-coins");
    if (c) c.textContent = String(state.coins);
    Array.prototype.forEach.call(document.querySelectorAll("[data-buy]"), function (row) {
      const it = Engine.itemById(row.dataset.buy);
      row.classList.toggle("cant", !it || state.coins < it.price);
    });
  }
  function openShop() {
    Render.commit();
    cancelHammer();
    syncShop();
    Screens.show("store");
  }
  let settingsFrom = "home";
  function openSettings() {
    Render.commit();
    cancelHammer();
    settingsFrom = Screens.current() === "game" ? "game" : "home";
    syncSettings();
    Screens.show("settings");
  }
  function syncSettings() {
    const chk = document.getElementById("chk-sound");
    if (chk) chk.checked = Sound.enabled();
    Array.prototype.forEach.call(document.querySelectorAll(".lang-btn"), function (el) {
      el.classList.toggle("active", el.dataset.lang === I18N.current());
    });
  }
  function doBuy(id) {
    const res = Engine.buy(state, id);
    if (!res.ok) {
      Toast.show(res.why === "poor"
        ? I18N.needCoins(res.need)
        : I18N.t("toast_unavailable"));
      return res;
    }
    Save.write(state);
    syncShop(); syncHome(); syncHammer();
    Toast.show(I18N.addedHammer(res.item.n));
    return res;
  }

  function syncHammer() {
    const b = elHammer(), n = elCount();
    if (n) n.textContent = String(Engine.hammersLeft(state));
    if (b) {
      b.classList.toggle("active", Render.hammerActive());
      b.disabled = !Engine.canSmash(state);
    }
    if (elHint()) elHint().textContent = Render.hammerActive() ? I18N.t("hint_hammer") : I18N.t("hint_play");
  }
  function toggleHammer() {
    if (!Render.hammerActive() && !Engine.canSmash(state)) { syncHammer(); return; }
    Render.commit();
    Render.setHammer(!Render.hammerActive());
    syncHammer();
  }
  function cancelHammer() {
    if (!Render.hammerActive()) return;
    Render.setHammer(false);
    syncHammer();
  }
  function doSmash(r, c) {
    Render.commit();
    const res = Engine.smash(state, r, c);
    Render.setHammer(false);            // ضربة واحدة لكل تفعيل
    if (res.ok) Render.play(state, res.steps);
    else Render.syncHud(state);
    syncHammer();
    Save.write(state);
    return res;
  }

  function start() {
    const prefs = Prefs.read();
    I18N.applyLang(prefs.lang === "en" ? "en" : "ar");
    Sound.setEnabled(prefs.sound !== false);

    state = Engine.createState();
    const resumed = Save.restore(state);       // استعادة الجولة السابقة إن وُجدت
    Render.buildCells(state.rows, state.cols);
    Render.draw(state);
    Input.attach(document.getElementById("play-area"),
                 document.getElementById("board"), {
      dragStart: Render.dragStart,
      dragMove:  Render.dragMove,
      dragEnd:   Render.dragEnd,
      aim:       Render.aim,
      aimed:     Render.aimed,
      canDrop:   c => Engine.canDrop(state, c),
      drop:      doDrop,
      cellAt:    Render.cellAt,
      hammerActive: Render.hammerActive,
      cancelHammer: cancelHammer,
      smash:     doSmash
    });
    const hm = document.getElementById("btn-hammer");
    if (hm) hm.addEventListener("click", toggleHammer);

    // التنقل بين الواجهة الأساسية وشاشة اللعب
    const bPlay = document.getElementById("btn-play");
    if (bPlay) bPlay.addEventListener("click", function () {
      Screens.show("game");
      Render.commit();
      Render.draw(state);
      syncHammer();
    });
    const bStore = document.getElementById("btn-store-home");
    if (bStore) {
      bStore.classList.remove("soon");          // المتجر صار حقيقيًا
      bStore.removeAttribute("data-soon");
      bStore.addEventListener("click", openShop);
    }
    // مشاهدة إعلان مقابل 5 عملات ذهب
    const bWatchAd = document.getElementById("btn-watch-ad");
    if (bWatchAd) {
      bWatchAd.addEventListener("click", function () {
        if (bWatchAd.classList.contains("loading")) return;
        bWatchAd.classList.add("loading");
        Toast.show(I18N.t("watch_ad_loading"));
        // TODO: استبدل هذا الجزء باستدعاء SDK إعلانات حقيقي (مثل AdMob/AdSense)
        // عند دمج شبكة إعلانات فعلية؛ حاليًا محاكاة بسيطة لتجربة المستخدم.
        setTimeout(function () {
          state.coins += 5;
          Save.write(state);
          syncHome();
          Toast.show(I18N.t("watch_ad_reward"));
          bWatchAd.classList.remove("loading");
        }, 1500);
      });
    }
    const bBack = document.getElementById("btn-store-back");
    if (bBack) bBack.addEventListener("click", function () { syncHome(); Screens.show("home"); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-buy]"), function (row) {
      row.addEventListener("click", function () { doBuy(row.dataset.buy); });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".shop-tab"), function (tab) {
      tab.addEventListener("click", function () {
        Array.prototype.forEach.call(document.querySelectorAll(".shop-tab"), function (x) { x.classList.toggle("active", x === tab); });
        const toolsPanel = document.getElementById("panel-tools");
        const goldPanel = document.getElementById("panel-gold");
        const showGold = tab.dataset.tab === "gold";
        if (toolsPanel) toolsPanel.style.display = showGold ? "none" : "";
        if (goldPanel) goldPanel.style.display = showGold ? "" : "none";
      });
    });

    // الإعدادات: يمكن فتحها من الواجهة الرئيسية أو من داخل اللعب، وتعود لنفس الشاشة
    const bSetHome = document.getElementById("btn-settings-home");
    if (bSetHome) bSetHome.addEventListener("click", openSettings);
    const bSetGame = document.getElementById("btn-settings");
    if (bSetGame) bSetGame.addEventListener("click", openSettings);
    const bSetBack = document.getElementById("btn-settings-back");
    if (bSetBack) bSetBack.addEventListener("click", function () {
      if (settingsFrom === "game") {
        Screens.show("game");
        Render.draw(state);
        syncHammer();
      } else {
        syncHome();
        Screens.show("home");
      }
    });
    const chkSound = document.getElementById("chk-sound");
    if (chkSound) chkSound.addEventListener("change", function () {
      Sound.setEnabled(chkSound.checked);
      Prefs.write(Object.assign({}, Prefs.read(), { sound: chkSound.checked }));
      if (chkSound.checked) Sound.unlock();
    });
    Array.prototype.forEach.call(document.querySelectorAll(".lang-btn"), function (btn) {
      btn.addEventListener("click", function () {
        I18N.applyLang(btn.dataset.lang);
        syncHammer();
        Render.syncHud(state);
      });
    });

    const bHome = document.getElementById("btn-home");
    if (bHome) bHome.addEventListener("click", function () {
      Render.commit();
      cancelHammer();
      syncHome();
      Screens.show("home");
    });

    // الميزات المعروضة في التصميم ولم تُبنَ بعد: تُظهر رسالة بدل أن تكون أزرارًا ميتة
    Array.prototype.forEach.call(document.querySelectorAll(".soon"), function (b) {
      b.addEventListener("click", function () {
        Toast.show(I18N.soonToast(b.dataset.soon || I18N.t("store_title")));
      });
    });
    syncHammer();
    syncHome();
    Screens.show("home");          // التطبيق يفتح على الواجهة الأساسية

    // شبكة أمان: احفظ أيضًا عند إغلاق التطبيق أو تصغيره
    window.addEventListener("pagehide", function () { Save.write(state); });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") Save.write(state);
    });
    const dg = document.getElementById("btn-diag");
    if (dg) dg.addEventListener("click", Diag.toggle);
    document.getElementById("btn-new").addEventListener("click", newGame);
    document.getElementById("btn-retry").addEventListener("click", newGame);
    document.getElementById("btn-keep").addEventListener("click", keepPlaying);

    // واجهة للاختبار الآلي فقط
    window.G2048 = {
      Engine, Render, CONFIG,
      getState: () => state,
      drop: doDrop,
      smash: doSmash,
      Sound: Sound,
      Save: Save,
      Screens: Screens,
      buy: doBuy,
      openShop: openShop,
      toggleHammer, cancelHammer,
      aim: Render.aim,
      dragStart: Render.dragStart,
      dragMove: Render.dragMove,
      dragEnd: Render.dragEnd,
      newGame, keepPlaying,
      values: () => Engine.toValues(state)
    };
  }

  return { start };
})();

document.addEventListener("DOMContentLoaded", App.start);
