const DATA_FILE = "./posts_dedup_latest.json";
const IMAGES_FILE = "./post_images.json";
const PAGE_SIZE = 24;

const gridEl = document.getElementById("postGrid");
const resultEl = document.getElementById("resultText");
const typeFiltersEl = document.getElementById("typeFilters");
const typeSelectEl = document.getElementById("typeSelect");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const modalEl = document.getElementById("postModal");
const modalContentEl = document.getElementById("modalContent");
const closeModalBtn = document.getElementById("closeModalBtn");

let allPosts = [];
let filteredPosts = [];
let visibleCount = PAGE_SIZE;
let currentType = "all";

const fallbackImage =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540">
      <rect width="960" height="540" fill="#cae8ed"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
       fill="#2b96a7" font-size="42" font-family="Arial, sans-serif">No image</text>
    </svg>`
  );

function decodeWpTags(raw) {
  if (!raw) return "";
  const en = raw.match(/\[:en\]([\s\S]*?)(?=\[:[a-z]{2}\]|\[:\]|$)/i);
  const kh = raw.match(/\[:kh\]([\s\S]*?)(?=\[:[a-z]{2}\]|\[:\]|$)/i);
  const value = (en && en[1]) || (kh && kh[1]) || raw;
  return value.replace(/\[:[a-z]{2}\]/gi, "").replace(/\[:\]/g, "").trim();
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

function formatDate(isoLike) {
  if (!isoLike) return "";
  const d = new Date(isoLike.replace(" ", "T"));
  if (Number.isNaN(d.valueOf())) return isoLike;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function pickImageFromContent(content) {
  if (!content) return fallbackImage;
  const m = content.match(/(?:https?:)?\/\/[^\s"'<>]+\/wp-content\/uploads\/[^\s"'<>]+/i);
  if (m) return m[0].replace(/^\/\//, `${window.location.protocol}//`);
  return fallbackImage;
}

function getCategories(record) {
  const terms = record.terms || [];
  return terms
    .filter((t) => t.taxonomy === "category")
    .map((t) => decodeWpTags(t.name))
    .filter(Boolean);
}

function normalizePost(record, postImages) {
  const post = record.post || record;
  const postId = String(post.ID || post.id || "");
  const postType = (post.post_type || "post").toLowerCase();
  const slug = post.post_name || post.slug || "";
  const uniqueId = postType + "-" + slug.replace(/#/g, "");
  const localPath = postImages && postImages[postId];
  const image = localPath
    ? (localPath.startsWith("http") ? localPath : new URL(localPath, window.location.href).href)
    : pickImageFromContent(post.post_content);
  return {
    id: post.ID || post.id,
    postType,
    slug,
    uniqueId,
    title: decodeWpTags(post.post_title || post.title || "Untitled"),
    date: post.post_date || post.date || "",
    excerpt: decodeWpTags(post.post_excerpt || post.excerpt || ""),
    post_content: decodeWpTags(post.post_content || post.content || ""),
    categories: getCategories(record),
    image,
    sourceSql: record.source_sql || "",
  };
}

function byDateDesc(a, b) {
  return (b.date || "").localeCompare(a.date || "");
}

function typeSet(posts) {
  const set = new Set();
  posts.forEach((p) => set.add(p.postType));
  return [...set].sort((a, b) => a.localeCompare(b));
}

function renderTypeFilters(types) {
  if (!typeFiltersEl) return;
  typeFiltersEl.querySelectorAll(".filter-btn:not([data-type='all'])").forEach((b) => b.remove());
  types.forEach((t) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn";
    btn.textContent = t;
    btn.dataset.type = t;
    typeFiltersEl.appendChild(btn);
    const option = document.createElement("option");
    option.value = t;
    option.textContent = t;
    if (typeSelectEl) typeSelectEl.appendChild(option);
  });
}

function applyFilter() {
  filteredPosts = allPosts.filter((p) => {
    return currentType === "all" || p.postType === currentType;
  });
  visibleCount = PAGE_SIZE;
  renderGrid();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function makeCard(post) {
  const col = document.createElement("div");
  col.className = "col-md-4 col-sm-6 col-xs-12";
  col.innerHTML = `
    <div class="single-blog recent-news">
      <div class="blog-image">
        <a class="image-scale" href="#${escapeHtml(post.uniqueId)}" data-unique-id="${escapeHtml(post.uniqueId)}">
          <img class="story-thumb" src="${post.image}" alt="${escapeHtml(post.title)}">
        </a>
      </div>
      <div class="blog-content">
        <span class="post-type-badge">${escapeHtml(post.postType)}</span>
        <div class="blog-title">
          <a href="#${escapeHtml(post.uniqueId)}" data-unique-id="${escapeHtml(post.uniqueId)}">
            <h3>${escapeHtml(post.title)}</h3>
          </a>
        </div>
        <div class="blog-meta">
          <span class="date-type">${formatDate(post.date)}</span>
        </div>
        <div class="blog-link">
          <a class="read-more" href="#${escapeHtml(post.uniqueId)}" data-unique-id="${escapeHtml(post.uniqueId)}">Read More</a>
        </div>
      </div>
    </div>`;
  return col;
}

function renderGrid() {
  const show = filteredPosts.slice(0, visibleCount);
  gridEl.innerHTML = "";
  show.forEach((post) => gridEl.appendChild(makeCard(post)));
  const typeLabel = currentType === "all" ? "All Types" : currentType;
  resultEl.textContent = `${filteredPosts.length} Results (${typeLabel})`;
  loadMoreBtn.hidden = visibleCount >= filteredPosts.length;
}

function openPostModal(uniqueId) {
  const post = allPosts.find((p) => p.uniqueId === uniqueId);
  if (!post) return;
  const excerpt = post.excerpt || stripHtml(post.post_content).slice(0, 280);
  modalContentEl.innerHTML = `
    <span class="post-type-badge">${escapeHtml(post.postType)}</span>
    <h2 class="detail-title">${escapeHtml(post.title)}</h2>
    <div class="detail-meta">${formatDate(post.date)}</div>
    <div class="blog-image">
      <img class="story-thumb" src="${post.image}" alt="${escapeHtml(post.title)}">
    </div>
    <p>${excerpt}</p>
    <div class="detail-content">${post.post_content || ""}</div>
    <div class="tag-list">
      ${(post.categories || []).map((c) => `<span class="tag">${escapeHtml(c)}</span>`).join("")}
    </div>
    <p class="detail-meta">Source: ${escapeHtml(post.sourceSql || "-")}</p>
  `;
  modalEl.classList.add("open");
  modalEl.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modalEl.classList.remove("open");
  modalEl.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function bindEvents() {
  typeFiltersEl?.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn[data-type]");
    if (!btn) return;
    currentType = btn.dataset.type;
    typeFiltersEl.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    if (typeSelectEl) typeSelectEl.value = currentType;
    applyFilter();
  });
  typeSelectEl?.addEventListener("change", () => {
    currentType = typeSelectEl.value;
    typeFiltersEl?.querySelectorAll(".filter-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.type === currentType);
    });
    applyFilter();
  });
  loadMoreBtn?.addEventListener("click", () => {
    visibleCount += PAGE_SIZE;
    renderGrid();
  });
  gridEl?.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-unique-id]");
    if (!a) return;
    e.preventDefault();
    const id = a.dataset.uniqueId;
    if (id) {
      openPostModal(id);
      window.location.hash = id;
    }
  });
  closeModalBtn?.addEventListener("click", closeModal);
  modalEl?.addEventListener("click", (e) => {
    if (e.target === modalEl) closeModal();
  });
  window.addEventListener("hashchange", () => {
    const id = window.location.hash.replace(/^#/, "");
    if (!id) {
      closeModal();
      return;
    }
    openPostModal(id);
  });
}

async function init() {
  try {
    const [dataRes, imagesRes] = await Promise.all([
      fetch(DATA_FILE),
      fetch(IMAGES_FILE).catch(() => null),
    ]);
    if (!dataRes.ok) throw new Error(`HTTP ${dataRes.status}`);
    const data = await dataRes.json();
    const postImages = imagesRes && imagesRes.ok ? await imagesRes.json() : {};
    allPosts = (Array.isArray(data) ? data : [])
      .map((r) => normalizePost(r, postImages))
      .filter((p) => p.postType !== "location")
      .sort(byDateDesc);
    renderTypeFilters(typeSet(allPosts));
    bindEvents();
    applyFilter();
    const startId = window.location.hash.replace(/^#/, "");
    if (startId) openPostModal(startId);
  } catch (err) {
    resultEl.textContent = `Failed to load posts: ${err.message}`;
  }
}

init();
