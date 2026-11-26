import { initSouthBeachScene } from "./scene.js";

const canvas = document.getElementById("beach-canvas");
const telemetryEl = document.getElementById("sky-telemetry");
const timeButtons = document.querySelectorAll("[data-time]");
const layoutButtons = document.querySelectorAll("[data-layout-target]");
const postListEl = document.getElementById("post-list");
const postReaderEl = document.getElementById("post-reader");
const readerMetaEl = document.getElementById("reader-meta");
const readerBodyEl = document.getElementById("reader-body");
const backBtn = document.getElementById("back-to-posts");
const tagButtons = document.querySelectorAll("[data-tag]");

let posts = [];
let activeTag = "All";

function formatClock(hourFloat) {
  const wrapped = ((hourFloat % 24) + 24) % 24;
  const h = Math.floor(wrapped);
  const m = Math.floor((wrapped - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

let beach = { setHourOverride() {} };
try {
  beach = initSouthBeachScene(canvas, ({ hour, phase, isLive, fireActive }) => {
    const modeTag = isLive ? "LIVE" : "PREVIEW";
    const fireTag = fireActive ? " · CAMPFIRE" : "";
    telemetryEl.textContent = `SOUTH · ${formatClock(hour)} · ${phase}${fireTag} (${modeTag})`;
  });
} catch (err) {
  telemetryEl.textContent = "SOUTH · 2D FALLBACK (WEBGL UNAVAILABLE)";
  console.error("WebGL initialization failed:", err);
}

function setTimePreset(val) {
  timeButtons.forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-time") === String(val));
  });
  if (val === "live") {
    beach.setHourOverride(null);
  } else {
    const parsed = Number(val);
    if (!Number.isNaN(parsed)) {
      beach.setHourOverride(parsed);
    }
  }
}

timeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setTimePreset(btn.getAttribute("data-time"));
  });
});

function setLayout(mode) {
  const normalized = mode === "side" || mode === "hidden" ? mode : "wide";
  document.body.setAttribute("data-layout", normalized);
  layoutButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-layout-target") === normalized);
  });
}

layoutButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setLayout(btn.getAttribute("data-layout-target"));
  });
});

// Allow deterministic URL preview: ?time=dawn|noon|dusk|night or ?hour=22.5&ui=side|hidden
(function applyUrlTime() {
  const params = new URLSearchParams(window.location.search);
  const t = (params.get("time") || "").toLowerCase();
  const h = params.get("hour");
  const map = { dawn: "6.1", noon: "12.5", dusk: "18.15", night: "22.8" };
  if (map[t]) {
    setTimePreset(map[t]);
  } else if (h !== null && !Number.isNaN(Number(h))) {
    beach.setHourOverride(Number(h));
    timeButtons.forEach((b) => b.classList.remove("active"));
  }
  const ui = (params.get("ui") || "").toLowerCase();
  if (ui === "hidden" || ui === "side" || ui === "wide") {
    setLayout(ui);
  }
})();

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderInline(md) {
  return escapeHtml(md)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeLists();
      continue;
    }
    if (line.startsWith("### ")) {
      closeLists();
      out.push(`<h3>${renderInline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      closeLists();
      out.push(`<h2>${renderInline(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      closeLists();
      out.push(`<h1>${renderInline(line.slice(2))}</h1>`);
    } else if (line.startsWith("- ")) {
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${renderInline(line.slice(2))}</li>`);
    } else if (/^\d+\.\s+/.test(line)) {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${renderInline(line.replace(/^\d+\.\s+/, ""))}</li>`);
    } else {
      closeLists();
      out.push(`<p>${renderInline(line)}</p>`);
    }
  }
  closeLists();
  return out.join("\n");
}

function renderPostList() {
  const filtered = activeTag === "All" ? posts : posts.filter((p) => p.tag === activeTag);
  postListEl.innerHTML = "";
  for (const post of filtered) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "post-card";
    btn.innerHTML = `
      <div class="post-meta">${escapeHtml(post.date)} · ${escapeHtml(post.tag)} · ${escapeHtml(post.readTime)}</div>
      <h3>${escapeHtml(post.title)}</h3>
      <p>${escapeHtml(post.summary)}</p>
    `;
    btn.addEventListener("click", () => openPost(post.slug));
    postListEl.appendChild(btn);
  }
}

async function openPost(slug) {
  const meta = posts.find((p) => p.slug === slug);
  if (!meta) return;
  postListEl.classList.add("hidden");
  postReaderEl.classList.remove("hidden");
  readerMetaEl.textContent = `${meta.date} · ${meta.tag} · ${meta.readTime}`;
  readerBodyEl.innerHTML = "<p>Loading post...</p>";

  try {
    const res = await fetch(`posts/${slug}.md`, { cache: "no-cache" });
    if (!res.ok) throw new Error("Failed to fetch markdown");
    const md = await res.text();
    readerBodyEl.innerHTML = renderMarkdown(md);
    window.history.replaceState({}, "", `?post=${encodeURIComponent(slug)}${window.location.search.includes("time=") ? "" : ""}`);
  } catch (_) {
    readerBodyEl.innerHTML = `<p>${escapeHtml(meta.summary)}</p>`;
  }
}

backBtn.addEventListener("click", () => {
  postReaderEl.classList.add("hidden");
  postListEl.classList.remove("hidden");
});

tagButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    activeTag = btn.getAttribute("data-tag") || "All";
    tagButtons.forEach((b) => b.classList.toggle("active", b === btn));
    postReaderEl.classList.add("hidden");
    postListEl.classList.remove("hidden");
    renderPostList();
  });
});

async function initBlog() {
  try {
    const res = await fetch("posts/index.json", { cache: "no-cache" });
    posts = await res.json();
    renderPostList();

    const params = new URLSearchParams(window.location.search);
    const slug = params.get("post");
    if (slug) {
      openPost(slug);
    }
  } catch (_) {
    postListEl.innerHTML = "<p class='bio'>Could not load mini-blog index.</p>";
  }
}

initBlog();
