const DATA_FILE = "./stories_dedup_latest.json";
const PAGE_SIZE = 12;

const gridEl = document.getElementById("storyGrid");
const resultEl = document.getElementById("resultText");
const navEl = document.querySelector(".member-category");
const selectEl = document.getElementById("categorySelect");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const modalEl = document.getElementById("storyModal");
const modalContentEl = document.getElementById("modalContent");
const closeModalBtn = document.getElementById("closeModalBtn");

let allStories = [];
let filteredStories = [];
let visibleCount = PAGE_SIZE;
let currentCategory = "all";

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

function pickImageFromStory(story) {
  const content = story.post_content || "";
  const urlMatches = [
    ...content.matchAll(
      /(?:https?:)?\/\/[^\s"'<>]+\/wp-content\/uploads\/[^\s"'<>]+/gi
    ),
  ];
  if (urlMatches.length) {
    return urlMatches[0][0].replace(/^\/\//, `${window.location.protocol}//`);
  }
  return fallbackImage;
}

function getCategories(story) {
  const terms = story.terms || [];
  return terms
    .filter((t) => t.taxonomy === "story_category")
    .map((t) => decodeWpTags(t.name))
    .filter(Boolean);
}

function normalizeStory(record, storyImages) {
  const post = record.post || record;
  const postId = String(post.ID || post.id || "");
  const localPath = storyImages && storyImages[postId];
  const image =
    localPath
      ? (localPath.startsWith("http") ? localPath : new URL(localPath, window.location.href).href)
      : pickImageFromStory(post);
  return {
    id: post.ID || post.id,
    slug: post.post_name || post.slug || "",
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

function categorySet(stories) {
  const set = new Set();
  stories.forEach((s) => s.categories.forEach((c) => set.add(c)));
  return [...set].sort((a, b) => a.localeCompare(b));
}

function renderFilters(categories) {
  categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn";
    btn.textContent = cat;
    btn.dataset.category = cat;
    navEl.appendChild(btn);

    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat;
    selectEl.appendChild(option);
  });
}

function applyFilter() {
  filteredStories =
    currentCategory === "all"
      ? [...allStories]
      : allStories.filter((s) => s.categories.includes(currentCategory));
  visibleCount = PAGE_SIZE;
  renderGrid();
}

function makeCard(story) {
  const col = document.createElement("div");
  col.className = "col-md-4 col-sm-6 col-xs-12";
  col.innerHTML = `
    <div class="single-blog recent-news">
      <div class="blog-image">
        <a class="image-scale" href="#${story.slug}" data-slug="${story.slug}">
          <img class="story-thumb" src="${story.image}" alt="${story.title}">
        </a>
      </div>
      <div class="blog-content">
        <div class="blog-title">
          <a href="#${story.slug}" data-slug="${story.slug}">
            <h3>${story.title}</h3>
          </a>
        </div>
        <div class="blog-meta">
          <span class="date-type">${formatDate(story.date)}</span>
        </div>
        <div class="blog-link">
          <a class="read-more" href="#${story.slug}" data-slug="${story.slug}">Read Story</a>
        </div>
      </div>
    </div>`;
  return col;
}

function renderGrid() {
  const show = filteredStories.slice(0, visibleCount);
  gridEl.innerHTML = "";
  show.forEach((story) => gridEl.appendChild(makeCard(story)));

  resultEl.textContent = `${filteredStories.length} Results in ${
    currentCategory === "all" ? "All Category" : currentCategory
  }`;

  loadMoreBtn.hidden = visibleCount >= filteredStories.length;
}

function openStoryModal(slug) {
  const story = allStories.find((s) => s.slug === slug);
  if (!story) return;

  const excerpt = story.excerpt || stripHtml(story.post_content).slice(0, 240);
  modalContentEl.innerHTML = `
    <h2 class="detail-title">${story.title}</h2>
    <div class="detail-meta">${formatDate(story.date)}</div>
    <div class="blog-image">
      <img class="story-thumb" src="${story.image}" alt="${story.title}">
    </div>
    <p>${excerpt}</p>
    <div class="detail-content">${story.post_content || ""}</div>
    <div class="tag-list">
      ${(story.categories || []).map((c) => `<span class="tag">${c}</span>`).join("")}
    </div>
    <p class="detail-meta">Source: ${story.sourceSql || "-"}</p>
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
  navEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    currentCategory = btn.dataset.category;
    navEl.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectEl.value = currentCategory;
    applyFilter();
  });

  selectEl.addEventListener("change", () => {
    currentCategory = selectEl.value;
    navEl.querySelectorAll(".filter-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.category === currentCategory);
    });
    applyFilter();
  });

  loadMoreBtn.addEventListener("click", () => {
    visibleCount += PAGE_SIZE;
    renderGrid();
  });

  gridEl.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-slug]");
    if (!a) return;
    e.preventDefault();
    const slug = a.dataset.slug;
    if (slug) {
      openStoryModal(slug);
      window.location.hash = slug;
    }
  });

  closeModalBtn.addEventListener("click", closeModal);
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeModal();
  });

  window.addEventListener("hashchange", () => {
    const slug = window.location.hash.replace(/^#/, "");
    if (!slug) {
      closeModal();
      return;
    }
    openStoryModal(slug);
  });
}

async function init() {
  try {
    const [storiesRes, imagesRes] = await Promise.all([
      fetch(DATA_FILE),
      fetch("./story_images.json").catch(() => null),
    ]);
    if (!storiesRes.ok) throw new Error(`HTTP ${storiesRes.status}`);
    const data = await storiesRes.json();
    const storyImages = imagesRes && imagesRes.ok ? await imagesRes.json() : {};
    allStories = (Array.isArray(data) ? data : [])
      .map((r) => normalizeStory(r, storyImages))
      .sort(byDateDesc);

    renderFilters(categorySet(allStories));
    bindEvents();
    applyFilter();

    const startSlug = window.location.hash.replace(/^#/, "");
    if (startSlug) openStoryModal(startSlug);
  } catch (err) {
    resultEl.textContent = `Failed to load stories: ${err.message}`;
  }
}

init();
