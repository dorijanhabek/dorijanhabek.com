import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/controls/OrbitControls.js";

/* ---------------------------
   Scene / Camera / Renderer
----------------------------*/
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 3;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
document.body.style.margin = "0";
document.body.appendChild(renderer.domElement);

/* ---------------------------
   Orbit Controls
----------------------------*/
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
controls.mouseButtons.MIDDLE = null;
controls.mouseButtons.RIGHT = null;

/* ---------------------------
   Auto rotation
----------------------------*/
let autoRotate = true;
let lastUserInteraction = 0;
let resumePending = false;
let rampStart = 0;
const resumeDelay = 2000;
const rampDuration = 1500;
const baseAutoSpeed = { x: 0.0005, y: 0.001 };
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
controls.addEventListener("start", () => {
  autoRotate = false;
  resumePending = false;
  rampStart = 0;
  lastUserInteraction = performance.now();
});
controls.addEventListener("end", () => {
  lastUserInteraction = performance.now();
  resumePending = true;
});

/* ========= Particle Sphere (with random drift + audio radius) ========= */
function makeCircleTexture() {
  const size = 64, c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const rad = size / 2;
  const gr = g.createRadialGradient(rad, rad, 0, rad, rad, rad);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.6, "rgba(255,255,255,0.8)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.beginPath(); g.arc(rad, rad, rad, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}

const BASE_RADIUS = 1.0;         // sphere radius at silence
const POINTS_COUNT = 1000;

const positions = new Float32Array(POINTS_COUNT * 3);
const baseDir     = new Float32Array(POINTS_COUNT * 3); // unit vectors for each point
const velocities  = new Float32Array(POINTS_COUNT * 3); // small per-point velocities
const randomSeed  = new Float32Array(POINTS_COUNT * 3); // seeds for noise/wobble

for (let i = 0; i < POINTS_COUNT; i++) {
  const t = i / POINTS_COUNT;
  const phi = Math.acos(1 - 2 * t);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;

  const ux = Math.sin(phi) * Math.cos(theta);
  const uy = Math.sin(phi) * Math.sin(theta);
  const uz = Math.cos(phi);

  const idx = i * 3;
  baseDir[idx] = ux; baseDir[idx + 1] = uy; baseDir[idx + 2] = uz;

  positions[idx]     = ux * BASE_RADIUS;
  positions[idx + 1] = uy * BASE_RADIUS;
  positions[idx + 2] = uz * BASE_RADIUS;

  randomSeed[idx]     = Math.random() * 1000;
  randomSeed[idx + 1] = Math.random() * 1000;
  randomSeed[idx + 2] = Math.random() * 1000;
}

const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

const mat = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.03,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  map: makeCircleTexture(),
  alphaTest: 0.01,
});

const points = new THREE.Points(geo, mat);
scene.add(points);

/* --- motion tuning --- */
const DAMPING        = 0.94;
const SHELL_SPRING   = 0.030;
const ANGLE_SPRING   = 0.010;
const NOISE_STRENGTH = 0.0012;     // random drift (higher = looser)
const MAX_SPEED      = 0.06;

/* ---------------------------
   Minimal text buttons + dropdown styles
----------------------------*/
if (!document.querySelector("#nav-text-btn-style")) {
  const css = `
    .nav-text-btn{
      font-family: "Poppins","Segoe UI","Inter",system-ui,sans-serif;
      font-size: 22px;
      font-weight: 500;
      color: #fff;
      background: transparent;
      border: none;
      padding: 4px 6px;
      cursor: pointer;
      position: relative;
      letter-spacing: .4px;
      line-height: 1.2;
      transition: color .3s ease;
    }
    .nav-text-btn:hover { color: #9e9e9eff; }
    .nav-text-btn:focus { outline: none; }

    .nav-text-btn::after{
      content: "";
      position: absolute;
      left: 0;
      bottom: -4px;
      height: 1px;
      width: 100%;
      background: currentColor;
      transform: scaleX(0);
      transform-origin: left center;
      transition: transform 420ms cubic-bezier(.4,0,.2,1);
      pointer-events: none;
    }
    .nav-text-btn:hover::after,
    .nav-text-btn.active::after {
      transform: scaleX(1);
    }

    .nav-text-btn::before{
      content:"";
      position:absolute;
      left:0;
      top: calc(100% + 3px);
      width:1px;
      height:0;
      background: currentColor;
      transform-origin: top;
      transition: height 420ms cubic-bezier(.4,0,.2,1);
      pointer-events:none;
    }
    .nav-text-btn.active::before{ height: var(--dd-height, 0px); }

    :root{
      --item-underline-offset: 3px;
      --item-underline-thickness: 1px;
    }

    .dropdown {
      display: flex;
      flex-direction: column;
      gap: 8px;
      position: absolute;
      top: 60px;
      left: 0;
      background: transparent;
      padding: 6px 0 0 12px;
      border-radius: 0;
      z-index: 2000;
      min-width: 180px;
      transform-origin: top;
      transition: opacity 160ms ease, transform 160ms ease;
    }
    .dropdown.closed { opacity: 0; transform: translateY(-6px); pointer-events: none; }
    .dropdown.open   { opacity: 1; transform: translateY(0);    pointer-events: auto; }

    .dropdown a,
    .dropdown .dd-item {
      display: block;
      position: relative;
      color: #fff;
      text-decoration: none;
      font-family: "Poppins","Segoe UI","Inter",system-ui,sans-serif;
      font-size: 16px;
      line-height: 1.35;
      padding: 4px 0;
      white-space: nowrap;
    }

    .dropdown a::after,
    .dropdown .dd-item::after {
      content: "";
      position: absolute;
      left: 0;
      bottom: calc(-1 * var(--item-underline-offset));
      height: var(--item-underline-thickness);
      width: 100%;
      background: currentColor;
      opacity: .7;
      transform: scaleX(1);
      transform-origin: left center;
      transition: opacity .2s ease;
    }
    .dropdown a:hover::after,
    .dropdown .dd-item:hover::after { opacity: 1; }

    .has-sub { position: relative; }
    .has-sub .dd-title {
      display: block;
      position: relative;
      color: #fff;
      font-family: "Poppins","Segoe UI","Inter",system-ui,sans-serif;
      font-size: 16px;
      line-height: 1.35;
      padding: 4px 0;
      cursor: pointer;
    }
    .has-sub .dd-title::after {
      content: "";
      position: absolute;
      left: 0;
      bottom: calc(-1 * var(--item-underline-offset));
      height: var(--item-underline-thickness);
      width: 100%;
      background: currentColor;
      opacity: .7;
    }
    .has-sub .dd-title:hover::after { opacity: 1; }

    .has-sub .caret { margin-left: 8px; font-size: .8em; opacity: .7; }

    .sub-dropdown {
      display: flex;
      flex-direction: column;
      gap: 8px;
      position: absolute;
      left: calc(100% + 12px);
      top: 0;
      background: transparent;
      padding: 0 0 0 12px;
      min-width: 180px;
      transform-origin: left top;
      transition: opacity 140ms ease, transform 140ms ease;
    }
    .sub-dropdown.closed { opacity: 0; transform: translateX(-6px); pointer-events: none; }
    .sub-dropdown.open   { opacity: 1; transform: translateX(0);    pointer-events: auto; }
  `;
  const s = document.createElement("style");
  s.id = "nav-text-btn-style";
  s.textContent = css;
  document.head.appendChild(s);
}

/* ---------------------------
   Top-Left Navigation Buttons
----------------------------*/
const navButtons = [
  { name: "Contact" },
  { name: "Projects" },
  { name: "Skills" },
  { name: "Education" },
];

const navContainer = document.createElement("div");
Object.assign(navContainer.style, {
  position: "fixed",
  top: "20px",
  left: "20px",
  display: "flex",
  flexDirection: "row",
  gap: "16px",
  zIndex: "1000",
  alignItems: "flex-start",
  flexWrap: "wrap",
});
document.body.appendChild(navContainer);

const openDropdowns = new Set();
function closeAllDropdowns(except) {
  openDropdowns.forEach((d) => {
    if (d !== except) {
      d.classList.remove("open");
      d.classList.add("closed");
      const btn = d.parentElement?.querySelector(".nav-text-btn");
      if (btn) btn.classList.remove("active");
      openDropdowns.delete(d);
    }
  });
}

// --- Compute vertical line height for underline column ---
function updateLineHeight(btnEl, dropdownEl) {
  positionDropdown(dropdownEl);

  const items = dropdownEl.querySelectorAll('.dd-item, a');
  const ddRect = dropdownEl.getBoundingClientRect();

  let height = dropdownEl.offsetHeight;

  if (items.length) {
    const last = items[items.length - 1];
    const lastRect = last.getBoundingClientRect();

    const rootStyle = getComputedStyle(document.documentElement);
    const underlineOffset = parseFloat(rootStyle.getPropertyValue('--item-underline-offset')) || 3;
    const underlineThickness = parseFloat(rootStyle.getPropertyValue('--item-underline-thickness')) || 1;

    const distanceToUnderline = (lastRect.bottom - ddRect.top) + underlineOffset + underlineThickness;

    const OVERHANG = 3; // px
    height = Math.ceil(distanceToUnderline + OVERHANG) + 20;
  }

  btnEl.style.setProperty('--dd-height', `${height}px`);
}

function positionDropdown(dd) {
  if (!dd) return;
  dd.style.position = "absolute";
  dd.style.left = "0";
  dd.style.top = "60px";
}

function repositionOpenDropdowns() {
  openDropdowns.forEach((dd) => {
    if (dd.classList.contains("open")) {
      positionDropdown(dd);
      const btn = dd.parentElement?.querySelector(".nav-text-btn");
      if (btn) updateLineHeight(btn, dd);
    }
  });
}

navButtons.forEach((btn) => {
  const wrapper = document.createElement("div");
  Object.assign(wrapper.style, { position: "relative", display: "inline-block" });
  const b = document.createElement("button");
  b.title = btn.name;
  b.className = "nav-text-btn";
  b.textContent = btn.name;
  if (btn.name === "Contact") b.classList.add("nav-contact");
  wrapper.appendChild(b);
  navContainer.appendChild(wrapper);

  /* Contact */
  if (btn.name === "Contact") {
    const links = [
      { label: "Mail", url: "mailto:hrdodoro@gmail.com" },
      { label: "Instagram", url: "https://instagram.com/dorijanhabek" },
      { label: "Facebook", url: "https://facebook.com/dorijanhabek" },
      { label: "GitHub", url: "https://github.com/dorijanhabek" },
    ];
    const dropdown = document.createElement("div");
    dropdown.className = "dropdown closed";
    links.forEach((l) => {
      const a = document.createElement("a");
      a.href = l.url;
      a.textContent = l.label;
      a.target = "_blank";
      dropdown.appendChild(a);
    });
    wrapper.appendChild(dropdown);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = dropdown.classList.contains("closed");
      closeAllDropdowns(dropdown);
      dropdown.classList.toggle("open", open);
      dropdown.classList.toggle("closed", !open);
      if (open) {
        openDropdowns.add(dropdown);
        positionDropdown(dropdown);
        updateLineHeight(b, dropdown);
        b.classList.add("active");
      } else {
        openDropdowns.delete(dropdown);
        b.classList.remove("active");
      }
    });
  }

  /* Projects */
  else if (btn.name === "Projects") {
    const items = [
      "Prometheus & Grafana","Game Server Infrastructure","DFS Server","Storage Servers",
      "Zabbix Monitoring","NFS Servers","Web Servers","Web Hosting Services","WordPress Sites",
      "Proxy Servers","Database Servers","Microsoft Exchange Migration","Microsoft Entra ID Implementation",
      "Microsoft Defender Security","Hacker Attack Remediation","Infrastructure Hardening","DHCP & DNS Management",
      "Group Policy Management","Data Migration Projects","Team Mentoring","Process Improvement",
      "Home Lab Research","Security Solutions","Technical Documentation","Presales Support",
      "Red Teaming","Custom Linux Distribution","VMWare infrastructure configuration",
    ];
    const dropdown = document.createElement("div");
    dropdown.className = "dropdown closed";
    dropdown.style.minWidth = "360px";
    dropdown.style.maxWidth = "520px";
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "1fr 1fr";
    grid.style.columnGap = "24px";
    grid.style.rowGap = "12px";
    items.forEach((t) => {
      const div = document.createElement("div");
      div.className = "dd-item";
      div.textContent = t;
      grid.appendChild(div);
    });
    dropdown.appendChild(grid);
    wrapper.appendChild(dropdown);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = dropdown.classList.contains("closed");
      closeAllDropdowns(dropdown);
      dropdown.classList.toggle("open", open);
      dropdown.classList.toggle("closed", !open);
      if (open) {
        openDropdowns.add(dropdown);
        positionDropdown(dropdown);
        updateLineHeight(b, dropdown);
        b.classList.add("active");
      } else {
        openDropdowns.delete(dropdown);
        b.classList.remove("active");
      }
    });
  }

  /* Skills (with right-side sub-menus) */
  else if (btn.name === "Skills") {
    const sections = [
      {
        title: "IT Infrastructure & System Administration",
        items: [
          "Windows Infrastructure and System Administration",
          "Linux Server Management and Configuration",
          "Backup and disaster recovery management",
          "L1, L2, and L3 Technical Support",
          "System hardening and security implementation",
          "Data and service migration projects",
          "Cross-team collaboration and communication",
          "Mentoring and training new employees",
          "Maintaining a personal lab for testing and automation"
        ],
      },
      {
        title: "Microsoft Technologies",
        items: [
          "Microsoft Exchange Administration",
          "Microsoft Entra ID",
          "Microsoft Azure",
          "Microsoft Defender",
          "Office 365 Administration",
          "Windows Server",
          "Active Directory",
          "Group Policy Management"
        ],
      },
      {
        title: "IT Tools & Platforms",
        items: [
          "Jira","Confluence","Atlassian Suite","Prometheus","Grafana","Docker","Proxmox",
          "Git","GitHub","Zabbix","Plesk","Bash Scripting","PowerShell Scripting",
          "Tailscale Management","Python","Unity","Ubiquiti"
        ],
      },
      {
        title: "Storage & Networking",
        items: [
          "Storage Management","Distributed File System","Dynamic Host Configuration Protocol",
          "DNS Management","NFS","Network Infrastructure Troubleshooting"
        ],
      },
      {
        title: "Web Technologies & Databases",
        items: [
          "Nginx Proxy","Apache2 Web Server","WordPress","MySQL","MariaDB","PostgreSQL",
          "HTML","CSS","JavaScript","Node.js","Lua"
        ],
      },
      {
        title: "Design Tools and Skills",
        items: [
          "Adobe Premiere Pro","Adobe Photoshop","Adobe Illustrator",
          "Adobe After Effects","FL Studio","Ableton Live 11","Blender"
        ],
      },
    ];

    const dropdown = document.createElement("div");
    dropdown.className = "dropdown closed";
    dropdown.style.minWidth = "260px";
    dropdown.addEventListener("click", (e) => e.stopPropagation());

    sections.forEach((sec) => {
      const row = document.createElement("div");
      row.className = "has-sub";

      const title = document.createElement("div");
      title.className = "dd-title";
      title.textContent = sec.title;

      const caret = document.createElement("span");
      caret.className = "caret";
      caret.textContent = "▶";
      title.appendChild(caret);

      row.appendChild(title);

      // Sub-menu to the right
      const sub = document.createElement("div");
      sub.className = "sub-dropdown closed";

      if (sec.items.length > 12) {
        sub.style.display = "grid";
        sub.style.gridTemplateColumns = "1fr 1fr";
        sub.style.columnGap = "24px";
        sub.style.rowGap = "10px";
        sub.style.minWidth = "420px";
      }

      sec.items.forEach((label) => {
        const item = document.createElement("div");
        item.className = "dd-item";
        item.textContent = label;
        sub.appendChild(item);
      });

      row.appendChild(sub);
      dropdown.appendChild(row);

      // Desktop hover open/close
      row.addEventListener("mouseenter", () => {
        sub.classList.remove("closed");
        sub.classList.add("open");
      });
      row.addEventListener("mouseleave", () => {
        sub.classList.add("closed");
        sub.classList.remove("open");
      });

      title.addEventListener("click", (e) => {
        e.stopPropagation();
        const opening = sub.classList.contains("closed");
        if (opening) {
          sub.classList.remove("closed");
          sub.classList.add("open");
        } else {
          sub.classList.add("closed");
          sub.classList.remove("open");
        }
      });
    });

    wrapper.appendChild(dropdown);

    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = dropdown.classList.contains("closed");
      closeAllDropdowns(dropdown);
      dropdown.classList.toggle("open", open);
      dropdown.classList.toggle("closed", !open);
      if (open) {
        openDropdowns.add(dropdown);
        positionDropdown(dropdown);
        updateLineHeight(b, dropdown);
        b.classList.add("active");

        const manualLineHeight = dropdown.offsetHeight * 1.1;
        b.style.setProperty("--dd-height", `${manualLineHeight}px`);
      } else {
        openDropdowns.delete(dropdown);
        b.classList.remove("active");
      }
    });
  }

  /* Education */
  else if (btn.name === "Education") {
    const links = [
      { label: "Prva Gimnazija Varaždin", url: "https://gimnazija-varazdin.skole.hr/" },
      { label: "Faculty of Organisation and Informatics", url: "https://www.foi.unizg.hr/hr" },
    ];
    const dropdown = document.createElement("div");
    dropdown.className = "dropdown closed";
    links.forEach((l) => {
      const a = document.createElement("a");
      a.href = l.url;
      a.textContent = l.label;
      a.target = "_blank";
      dropdown.appendChild(a);
    });
    wrapper.appendChild(dropdown);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = dropdown.classList.contains("closed");
      closeAllDropdowns(dropdown);
      dropdown.classList.toggle("open", open);
      dropdown.classList.toggle("closed", !open);
      if (open) {
        openDropdowns.add(dropdown);
        positionDropdown(dropdown);
        updateLineHeight(b, dropdown);
        b.classList.add("active");
      } else {
        openDropdowns.delete(dropdown);
        b.classList.remove("active");
      }
    });
  }
});

document.addEventListener("click", (e) => {
  if (!navContainer.contains(e.target)) closeAllDropdowns();
});
window.addEventListener("resize", repositionOpenDropdowns);
window.addEventListener("scroll", repositionOpenDropdowns);

/* ---------------------------
   Music Toggle (with fade)
----------------------------*/
if (!document.querySelector("#music-toggle-style")) {
  const css = `
    #music-toggle{
      position: fixed;
      left: 20px;
      bottom: 20px;
      z-index: 1500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 16px;
      min-width: 148px;
      background: transparent;
      color: #fff;
      border: 1px solid rgba(255,255,255,0.95);
      border-radius: 12px;
      font-family: "Poppins","Segoe UI","Inter",system-ui,sans-serif;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      user-select: none;
      transition: background .22s ease, box-shadow .22s ease, transform .18s ease;
    }
    #music-toggle:hover{ background: rgba(255,255,255,0.08); }
    #music-toggle:active{ transform: translateY(1px); }

    #music-toggle .swap{ position: relative; display: block; width: 100%; height: 1.2em; overflow: hidden; }
    #music-toggle .label{
      position: absolute; left: 0; top: 0; width: 100%; text-align: center;
      opacity: 0; transform: translateY(100%); transition: transform .35s ease, opacity .35s ease; white-space: nowrap;
    }
    #music-toggle .label-off { opacity: 1; transform: translateY(0); }
    #music-toggle.state-on .label-on{ opacity: 1; transform: translateY(0); }
    #music-toggle.state-on .label-off{ opacity: 0; transform: translateY(-100%); }
    #music-toggle.state-off .label-off{ opacity: 1; transform: translateY(0); }
    #music-toggle.state-off .label-on{ opacity: 0; transform: translateY(100%); }
  `;
  const s = document.createElement("style");
  s.id = "music-toggle-style";
  s.textContent = css;
  document.head.appendChild(s);
}

let bgm = document.getElementById("bgm");
if (!bgm) {
  bgm = document.createElement("audio");
  bgm.id = "bgm";
  bgm.src = "song.mp3";
  bgm.loop = true;
  bgm.preload = "auto";
  bgm.playsInline = true;
  bgm.muted = true;
  bgm.volume = 0.15;
  bgm.style.display = "none";
  document.body.appendChild(bgm);
  bgm.play().catch(()=>{});
}

let musicBtn = document.getElementById("music-toggle");
if (!musicBtn) {
  musicBtn = document.createElement("button");
  musicBtn.id = "music-toggle";
  musicBtn.innerHTML = `
    <span class="swap">
      <span class="label label-on">Music: On</span>
      <span class="label label-off">Music: Off</span>
    </span>
  `;
  document.body.appendChild(musicBtn);
}

function musicIsOn(){
  return !bgm.muted && !bgm.paused && bgm.volume > 0.001;
}
function refreshMusicLabel(){
  const on = musicIsOn();
  musicBtn.classList.toggle("state-on", on);
  musicBtn.classList.toggle("state-off", !on);
  if (!musicBtn.classList.contains("state-on") && !musicBtn.classList.contains("state-off")) {
    musicBtn.classList.add("state-off");
  }
}
refreshMusicLabel();

function fadeVolume(target, duration = 600) {
  return new Promise((resolve) => {
    const start = bgm.volume;
    const diff = target - start;
    const startTime = performance.now();

    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      bgm.volume = start + diff * eased;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

/* ========= Audio analyser for music reactivity ========= */
let audioCtx, analyser, fftData;
let audioLevel = 0;             // smoothed 0..1 level
const AUDIO_BASE   = 0.98;      // base scale when silent
const AUDIO_REACT  = 0.18;      // how much to grow with music
const AUDIO_MIN    = 0.96;      // hard floor
const AUDIO_MAX    = 1.12;      // hard ceiling
const AUDIO_SMOOTH = 0.08;      // low-pass strength

function ensureAnalyser() {
  if (analyser) return;
  if (!bgm) return;

  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  const src = audioCtx.createMediaElementSource(bgm);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.85;
  fftData = new Uint8Array(analyser.frequencyBinCount);
  src.connect(analyser);
  analyser.connect(audioCtx.destination);
}

document.addEventListener("click", () => {
  try { if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); } catch {}
  ensureAnalyser();
}, { once: true });

bgm?.addEventListener("play", () => { ensureAnalyser(); });
bgm?.addEventListener("volumechange", () => { ensureAnalyser(); });
ensureAnalyser();

/* --- Click handler with fade in/out --- */
musicBtn.addEventListener("click", async () => {
  const turningOff = musicIsOn();
  musicBtn.classList.toggle("state-on", !turningOff);
  musicBtn.classList.toggle("state-off", turningOff);

  if (turningOff) {
    // Fade OUT
    fadeVolume(0, 700).then(() => {
      bgm.pause();
      bgm.muted = true;
      refreshMusicLabel();
    });
  } else {
    // Fade IN
    bgm.muted = false;
    bgm.volume = 0;
    try { await bgm.play(); } catch {}
    fadeVolume(0.15, 900).then(refreshMusicLabel);
  }
});

/* ======================================================
   WINDOW RESIZE HANDLER — auto scale and reposition
   ====================================================== */
function handleResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  const scaleFactor = Math.min(width, height) / 900;
  points.scale.set(scaleFactor, scaleFactor, scaleFactor);

  repositionOpenDropdowns();

  const nav = document.querySelector(".nav-container") || document.getElementById("nav-container");
  if (nav) {
    if (width < 520) {
      nav.style.top = "0px";
      nav.style.left = "0px";
      nav.style.right = "0px";
    } else {
      nav.style.top = "20px";
      nav.style.left = "20px";
      nav.style.right = "auto";
    }
  }
}
window.addEventListener("resize", handleResize);
handleResize();

/* ===============================
   Controls Panel (3 sliders)
   =============================== */
(function addControls() {
  const styleId = "controls-style";
  if (!document.getElementById(styleId)) {
    const st = document.createElement("style");
    st.id = styleId;
    st.textContent = `
      #controls {
        position: fixed;
        right: 20px;
        bottom: 40px;
        z-index: 1600;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px 16px;
        border-radius: 12px;
        background: transparent;
        color: #fff;
        font-family: "Poppins","Segoe UI","Inter",system-ui,sans-serif;
        font-size: 14px;
        backdrop-filter: blur(8px);
        min-width: 260px;
      }
      #controls label {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 10px;
      }
      #controls input[type="range"] {
        grid-column: 1 / -1;
        accent-color: #cc00ff;
        cursor: pointer;
      }
      #controls .val {
        opacity: .85;
        font-variant-numeric: tabular-nums;
      }
      @media (max-width: 520px) {
        #controls { right: 12px; left: 12px; bottom: 90px; min-width: 0; }
      }
    `;
    document.head.appendChild(st);
  }

  const wrap = document.createElement("div");
  wrap.id = "controls";
  wrap.innerHTML = `
    <label>Particle Wobble <span class="val" id="wobbleVal"></span>
      <input id="wobbleSlider" type="range" min="0" max="0.05" step="0.001" value="0.019" />
    </label>
    <label>Audio Reactivity <span class="val" id="audioVal"></span>
      <input id="audioSlider" type="range" min="0" max="2" step="0.05" value="1" />
    </label>
    <label>Rotation Speed <span class="val" id="rotVal"></span>
      <input id="rotationSlider" type="range" min="0" max="0.01" step="0.0001" value="0.0006" />
    </label>
  `;
  document.body.appendChild(wrap);
})();

// ============ Credit link below sliders ============
const credit = document.createElement("div");
credit.innerHTML = `Made by <a href="https://www.linkedin.com/in/dorijan-habek/" target="_blank" rel="noopener noreferrer">Dorijan Habek</a>`;
credit.style.position = "fixed";
credit.style.bottom = "20px";
credit.style.right = "20px";
credit.style.color = "white";
credit.style.fontFamily = '"Poppins", "Segoe UI", sans-serif';
credit.style.fontSize = "15px";
credit.style.opacity = "0.8";
credit.style.userSelect = "none";
credit.style.zIndex = "1600";
credit.querySelector("a").style.color = "white";
credit.querySelector("a").style.textDecoration = "underline";
credit.querySelector("a").style.fontWeight = "500";
document.body.appendChild(credit);

// Slider-controlled parameters (defaults match UI)
// ===============================
//  SLIDERS SETUP (LIVE WORKING VERSION)
// ===============================
window.wobbleStrength = 0.019;
window.audioReactivity = 1.0;
window.rotationSpeed = 0.0006;

function setupSliderBindings() {
  const wobbleSlider = document.getElementById("wobbleSlider");
  const audioSlider = document.getElementById("audioSlider");
  const rotationSlider = document.getElementById("rotationSlider");
  const wobbleVal = document.getElementById("wobbleVal");
  const audioVal = document.getElementById("audioVal");
  const rotVal = document.getElementById("rotVal");

  if (!wobbleSlider || !audioSlider || !rotationSlider) {
    // controls not yet attached — retry in next frame
    requestAnimationFrame(setupSliderBindings);
    return;
  }

  const fmt = (n, d = 3) => Number(n).toFixed(d);
  function refreshVals() {
    if (wobbleVal) wobbleVal.textContent = fmt(window.wobbleStrength);
    if (audioVal) audioVal.textContent = fmt(window.audioReactivity, 2);
    if (rotVal) rotVal.textContent = fmt(window.rotationSpeed, 4);
  }
  refreshVals();

  wobbleSlider.addEventListener("input", (e) => {
    window.wobbleStrength = parseFloat(e.target.value);
    console.log("wobbleStrength:", window.wobbleStrength);
    refreshVals();
  });
  audioSlider.addEventListener("input", (e) => {
    window.audioReactivity = parseFloat(e.target.value);
    console.log("audioReactivity:", window.audioReactivity);
    refreshVals();
  });
  rotationSlider.addEventListener("input", (e) => {
    window.rotationSpeed = parseFloat(e.target.value);
    console.log("rotationSpeed:", window.rotationSpeed);
    refreshVals();
  });
}

// wait for DOM + dynamic controls to exist
if (document.readyState === "complete" || document.readyState === "interactive") {
  setupSliderBindings();
} else {
  document.addEventListener("DOMContentLoaded", setupSliderBindings);
}

/* ========= Animate (random drift + music-reactive radius + gentle rotation) ========= */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const now = performance.now();

  // auto-rotate easing state (kept, but rotation won't be fully gated by it)
  if (!autoRotate && resumePending && now - lastUserInteraction > resumeDelay) {
    autoRotate = true;
    resumePending = false;
    rampStart = now;
  }

  let speedScale = 1; // default to 1 so rotation always happens
  if (autoRotate) {
    if (rampStart) {
      const k = Math.min((now - rampStart) / rampDuration, 1);
      speedScale = easeInOutCubic(k);
      if (k >= 1) rampStart = 0;
    } else {
      speedScale = 1;
    }
  } else {
    // user is interacting — still allow slow rotation
    speedScale = 1;
  }

  // 1) audio reactivity: compute gentle scale from spectrum average (smoothed)
  let audioScale = 1.0;
  if (analyser && fftData) {
    analyser.getByteFrequencyData(fftData);

    const avg = fftData.reduce((a, b) => a + b, 0) / fftData.length;
    let norm = Math.sqrt(avg / 255);          // compress peaks
    audioLevel += (norm - audioLevel) * AUDIO_SMOOTH;

    // Improved audio reactivity curve (more natural and useful range)
    const react = Math.pow(window.audioReactivity, 1.5);      // nonlinear curve: finer control near low end
    const dynamicRange = 0.06 + react * 0.25;                 // how wide the radius can vary
    audioScale = 1.0 + (audioLevel - 0.3) * dynamicRange;     // center around 1.0

    // clamp gently to prevent over-expansion or collapse
    audioScale = Math.max(0.7, Math.min(1.6, audioScale));
  }

  // target radius is BASE_RADIUS scaled by music
  const targetR = BASE_RADIUS * audioScale;

  // 2) per-point physics
  const pos = geo.attributes.position.array;
  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i], y = pos[i + 1], z = pos[i + 2];
    let vx = velocities[i], vy = velocities[i + 1], vz = velocities[i + 2];

    const bx = baseDir[i], by = baseDir[i + 1], bz = baseDir[i + 2];
    // point on target shell along original direction
    const tx = bx * targetR, ty = by * targetR, tz = bz * targetR;

    // small organic wobble
    const sx = randomSeed[i], sy = randomSeed[i + 1], sz = randomSeed[i + 2];
    const wobbleX = Math.sin(t * 0.40 + sx) * window.wobbleStrength;
    const wobbleY = Math.cos(t * 0.33 + sy) * window.wobbleStrength;
    const wobbleZ = Math.sin(t * 0.47 + sz) * window.wobbleStrength;

    // springs toward shell point and direction
    const rlen = Math.hypot(x, y, z) || 1;
    const fx = (tx - x) * SHELL_SPRING + (bx - x / rlen) * ANGLE_SPRING;
    const fy = (ty - y) * SHELL_SPRING + (by - y / rlen) * ANGLE_SPRING;
    const fz = (tz - z) * SHELL_SPRING + (bz - z / rlen) * ANGLE_SPRING;

    vx = (vx + fx + Math.sin(t * 0.8 + sx * 1.7) * NOISE_STRENGTH) * DAMPING;
    vy = (vy + fy + Math.cos(t * 0.9 + sy * 1.9) * NOISE_STRENGTH) * DAMPING;
    vz = (vz + fz + Math.sin(t * 1.0 + sz * 2.1) * NOISE_STRENGTH) * DAMPING;

    const sp = Math.hypot(vx, vy, vz);
    if (sp > MAX_SPEED) { const s = MAX_SPEED / sp; vx *= s; vy *= s; vz *= s; }

    x += wobbleX + vx; y += wobbleY + vy; z += wobbleZ + vz;
    velocities[i] = vx; velocities[i + 1] = vy; velocities[i + 2] = vz;
    pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
  }
  geo.attributes.position.needsUpdate = true;

  // 3) rotation – always progresses; speedScale eases in subtly
  points.rotation.y += window.rotationSpeed * speedScale;
  points.rotation.x += window.rotationSpeed * 0.6 * speedScale;

  controls.update();
  renderer.render(scene, camera);
}
animate();
