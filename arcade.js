// Swish Arcade games. Plain script: exposes window.SwishArcade.
// Each game renders into a container and calls onEnd(score, extra) when finished. Returns a stop() function.
(function () {
  const vib = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
  function pop(text, color) {
    const p = document.createElement("div"); p.className = "arc-pop"; p.textContent = text; p.style.color = color || "#fff";
    document.body.appendChild(p); setTimeout(() => p.remove(), 1000);
  }

  // ---------------- Flick Shot ----------------
  function flick(root, opts) {
    const sfx = opts.sfx || {};
    root.innerHTML = `<div class="arc-hud"><div class="chip"><b id="arcSc">0</b><span>score</span></div><div class="chip"><b id="arcTm">30</b><span>time</span></div><div class="chip"><b id="arcSt">–</b><span>streak</span></div></div>
      <canvas class="arc-cv"></canvas><div class="arc-hint">Swipe up from the ball. A swish through the middle is +2, and 3 in a row puts you 🔥 on fire.</div>`;
    const cv = root.querySelector("canvas"), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth, H = Math.max(380, Math.min(Math.round(W * 1.45), window.innerHeight - 210));
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + "px"; const g = cv.getContext("2d"); g.scale(dpr, dpr);
    const G = 2000, rimY = H * 0.26, rimW = Math.min(86, W * 0.24), startX = W / 2, startY = H - 70, R0 = Math.min(30, W * 0.08);
    let score = 0, streak = 0, t0 = performance.now(), left = 30, running = true, rim = { x: W / 2, t: 0 }, ball, drag = null, raf, swishFx = 0, last = performance.now();
    const reset = () => { ball = { x: startX, y: startY, vx: 0, vy: 0, live: false, scored: false }; };
    reset();
    const rimSpeed = () => 0.8 + Math.min(score, 30) * 0.09;
    const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }; };
    cv.addEventListener("pointerdown", (e) => { if (!running || ball.live) return; drag = { pts: [pt(e)] }; try { cv.setPointerCapture(e.pointerId); } catch {} });
    cv.addEventListener("pointermove", (e) => { if (!drag) return; drag.pts.push(pt(e)); if (drag.pts.length > 8) drag.pts.shift(); });
    const release = () => {
      if (!drag) return; const p = drag.pts, a = p[0], b = p[p.length - 1]; drag = null; const dt = Math.max((b.t - a.t) / 1000, 0.016);
      const dy = b.y - a.y, dx = b.x - a.x; if (dy > -25) return;
      // shot power scales with the screen: a firm swipe clears the rim, a lazy flick falls short
      const need = Math.sqrt(2 * G * (startY - rimY + 30)), power = Math.max(0, Math.min(1, (-dy / dt) / 1400));
      ball.vy = -need * (0.86 + 0.32 * power); ball.vx = Math.max(-560, Math.min(560, (dx / dt) * 0.55)); ball.live = true; vib(8);
    };
    cv.addEventListener("pointerup", release); cv.addEventListener("pointercancel", () => (drag = null));
    function step(now) {
      const dt = Math.min((now - last) / 1000, 0.033); last = now;
      left = Math.max(0, 30 - (now - t0) / 1000); const tm = root.querySelector("#arcTm"); if (tm) tm.textContent = Math.ceil(left);
      rim.t += dt * rimSpeed(); rim.x = W / 2 + Math.sin(rim.t) * (W / 2 - rimW * 0.95 - 10);
      if (ball.live) {
        const prevY = ball.y; ball.vy += G * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.x < 14 || ball.x > W - 14) { ball.vx *= -0.6; ball.x = Math.max(14, Math.min(W - 14, ball.x)); }
        if (ball.vy > 0 && prevY < rimY && ball.y >= rimY && !ball.scored) {
          const off = Math.abs(ball.x - rim.x);
          if (off < rimW / 2 - 6) {
            ball.scored = true; streak++; const fire = streak >= 3, perfect = off < rimW * 0.14, pts = (perfect ? 2 : 1) * (fire ? 2 : 1);
            score += pts; root.querySelector("#arcSc").textContent = score; root.querySelector("#arcSt").textContent = streak >= 3 ? `🔥${streak}` : streak; swishFx = 1; sfx.swish && sfx.swish();
            pop(perfect ? (fire ? "🔥 SWISH ×2!" : "SWISH! +2") : fire ? "🔥 ON FIRE +2" : "+1", perfect ? "#c8f43c" : fire ? "#ff9a3d" : "#fff"); vib(18);
          } else if (off < rimW / 2 + 12) { ball.vy *= -0.45; ball.vx += (ball.x < rim.x ? -1 : 1) * 260; sfx.rim && sfx.rim(); }
        }
        if (ball.y > H + 60 || (ball.y > startY + 10 && ball.vy > 0)) {
          if (!ball.scored) { if (streak >= 3) pop("❄️ Cooled off", "#5ab0ff"); streak = 0; const st = root.querySelector("#arcSt"); if (st) st.textContent = "–"; }
          reset();
        }
      }
      draw();
      if (left <= 0 && !ball.live) { running = false; opts.onEnd(score); return; }
      raf = requestAnimationFrame(step);
    }
    function drawBall(x, y, r) {
      g.save(); g.translate(x, y); g.fillStyle = "#ff6b1a"; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      g.strokeStyle = "#1a0b02"; g.lineWidth = Math.max(1.5, r / 12); g.beginPath(); g.arc(0, 0, r, 0, 7); g.moveTo(-r, 0); g.lineTo(r, 0); g.moveTo(0, -r); g.lineTo(0, r); g.stroke();
      g.beginPath(); g.ellipse(-r * 0.55, 0, r * 0.35, r * 0.9, 0, 0, 7); g.stroke(); g.beginPath(); g.ellipse(r * 0.55, 0, r * 0.35, r * 0.9, 0, 0, 7); g.stroke(); g.restore();
    }
    function draw() {
      g.clearRect(0, 0, W, H);
      g.strokeStyle = "rgba(255,255,255,.05)"; g.lineWidth = 2; g.beginPath(); g.arc(W / 2, H + 40, W * 0.45, Math.PI, 0); g.stroke();
      g.fillStyle = "rgba(255,255,255,.04)"; g.fillRect(0, startY + 34, W, H);
      g.fillStyle = "rgba(255,255,255,.08)"; g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 2.5;
      g.beginPath(); if (g.roundRect) g.roundRect(rim.x - rimW * 0.95, rimY - 78, rimW * 1.9, 70, 6); else g.rect(rim.x - rimW * 0.95, rimY - 78, rimW * 1.9, 70); g.fill(); g.stroke();
      g.strokeRect(rim.x - rimW * 0.35, rimY - 52, rimW * 0.7, 40);
      const r = R0 * (0.5 + 0.5 * Math.max(0, Math.min(1, (ball.y - rimY) / (startY - rimY))));
      const net = () => {
        const sw = swishFx; g.strokeStyle = "rgba(244,242,238,.9)"; g.lineWidth = 2; const top = rimY, bot = rimY + 46 + sw * 14, hw = rimW / 2, bw = rimW * 0.32;
        for (let i = 0; i <= 4; i++) { const t = i / 4; g.beginPath(); g.moveTo(rim.x - hw + t * rimW, top); g.lineTo(rim.x - bw + t * bw * 2 + Math.sin(performance.now() / 60 + i) * sw * 4, bot); g.stroke(); }
        g.beginPath(); g.moveTo(rim.x - hw * 0.85, top + 18); g.lineTo(rim.x + hw * 0.85, top + 18); g.moveTo(rim.x - bw, bot); g.lineTo(rim.x + bw, bot); g.stroke();
        g.strokeStyle = "#ff6b1a"; g.lineWidth = 6; g.lineCap = "round"; g.beginPath(); g.moveTo(rim.x - hw, top); g.lineTo(rim.x + hw, top); g.stroke(); g.lineCap = "butt";
      };
      if (ball.live && ball.vy > 0 && ball.y > rimY - 20) { drawBall(ball.x, ball.y, r); net(); } else { net(); drawBall(ball.x, ball.y, r); }
      swishFx = Math.max(0, swishFx - 0.04);
      if (!ball.live) { g.fillStyle = "rgba(255,255,255,.35)"; g.font = "700 13px 'Bricolage Grotesque', sans-serif"; g.textAlign = "center"; g.fillText("↑ swipe", startX, startY + 52); }
    }
    raf = requestAnimationFrame(step);
    return () => { running = false; cancelAnimationFrame(raf); };
  }

  // ---------------- Lebanese Hoops Trivia ----------------
  // Same 5 questions for everyone on a given day; the bank is walked through in a fixed shuffled order.
  function seeded(seed) { return () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }; }
  function todaysQuestions(bank, date) {
    const rnd = seeded(2026); const order = bank.map((q, i) => [rnd(), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const d = date || new Date(); const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
    const start = (day * 5) % order.length; return Array.from({ length: 5 }, (_, k) => bank[order[(start + k) % order.length]]);
  }
  function trivia(root, bank, opts) {
    const sfx = opts.sfx || {}; const qs = todaysQuestions(bank); const rnd = seeded(Math.floor(Date.now() / 864e5));
    let i = 0, score = 0, correct = 0, timer, alive = true;
    function show() {
      const [text, answers, fact] = qs[i]; const order = answers.map((o, k) => [rnd(), o, k]).sort((a, b) => a[0] - b[0]);
      root.innerHTML = `<div class="arc-hud"><div class="chip"><b>${score}</b><span>points</span></div><div class="chip"><b>${i + 1}/5</b><span>question</span></div><div class="chip"><b>🇱🇧</b><span>today</span></div></div>
        <div class="arc-q"><div class="n">Question ${i + 1} of 5</div><h2></h2><div class="tbar"><i></i></div></div>
        <div class="arc-opts">${order.map(([, , k]) => `<button class="arc-opt" data-k="${k}"></button>`).join("")}</div><div class="arc-fact"></div>`;
      root.querySelector("h2").textContent = text;
      root.querySelectorAll(".arc-opt").forEach((b, j) => (b.textContent = order[j][1]));
      const tb = root.querySelector(".tbar i"), t0 = Date.now(), LIM = 15000; let done = false;
      timer = setInterval(() => { const l = Math.max(0, LIM - (Date.now() - t0)); tb.style.width = (l / LIM) * 100 + "%"; if (l <= 0) answer(-1); }, 50);
      function answer(k) {
        if (done || !alive) return; done = true; clearInterval(timer);
        const right = k === 0, secs = (Date.now() - t0) / 1000;
        if (right) { const pts = Math.round(100 + Math.max(0, 15 - secs) * 10); score += pts; correct++; sfx.swish && sfx.swish(); pop(`+${pts}`, "#c8f43c"); vib(15); }
        else { pop(k === -1 ? "⏰ Time!" : "❌ Nope", "#ff4d5e"); sfx.miss && sfx.miss(); vib([30, 40, 30]); }
        root.querySelectorAll(".arc-opt").forEach((b) => { const kk = Number(b.dataset.k); b.disabled = true; if (kk === 0) b.classList.add("right"); else if (kk === k) b.classList.add("wrong"); });
        const f = root.querySelector(".arc-fact"); f.textContent = "💡 " + fact; f.classList.add("show");
        setTimeout(() => { if (!alive) return; i++; if (i < 5) show(); else opts.onEnd(score, correct); }, 2600);
      }
      root.querySelectorAll(".arc-opt").forEach((b) => (b.onclick = () => answer(Number(b.dataset.k))));
    }
    show();
    return () => { alive = false; clearInterval(timer); };
  }

  window.SwishArcade = { flick, trivia, todaysQuestions };
})();
