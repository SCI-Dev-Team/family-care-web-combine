const DATA_FILE = "./reports.json";

const resultEl = document.getElementById("resultText");
const navEl = document.querySelector(".member-category");
const sortSelect = document.getElementById("sortSelect");
const searchInput = document.getElementById("reportSearch");
const tableBody = document.getElementById("reportTableBody");

let allReports = [];
let filteredReports = [];
let currentCategory = "all";
let sortOrder = "desc";

function decodeWpTags(raw) {
  if (!raw) return "";
  const en = raw.match(/\[:en\]([\s\S]*?)(?=\[:[a-z]{2}\]|\[:\]|$)/i);
  const value = (en && en[1]) || raw;
  return value.replace(/\[:[a-z]{2}\]/gi, "").replace(/\[:\]/g, "").trim();
}

function formatDate(isoLike) {
  if (!isoLike) return "";
  const d = new Date(isoLike.replace(" ", "T"));
  if (Number.isNaN(d.valueOf())) return isoLike;
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getCategories(report) {
  const terms = report.terms || [];
  return terms.map((t) => decodeWpTags(t.name)).filter(Boolean);
}

function normalizeReport(record) {
  const categories = getCategories(record);
  return {
    id: record.id,
    slug: record.slug || "",
    title: decodeWpTags(record.title) || "Untitled",
    date: record.date || "",
    categories,
    localFiles: Array.isArray(record.local_files) ? record.local_files : [],
    externalLink: record.external_link || "",
  };
}

function byDate(a, b) {
  const da = (a.date || "").replace(" ", "T");
  const db = (b.date || "").replace(" ", "T");
  if (sortOrder === "asc") return da.localeCompare(db);
  return db.localeCompare(da);
}

function categorySet(reports) {
  const set = new Set();
  reports.forEach((r) => r.categories.forEach((c) => set.add(c)));
  return [...set].sort((a, b) => a.localeCompare(b));
}

function applyFilters() {
  const q = (searchInput?.value || "").trim().toLowerCase();
  filteredReports = allReports.filter((r) => {
    const matchCategory =
      currentCategory === "all" || r.categories.includes(currentCategory);
    const matchSearch =
      !q ||
      r.title.toLowerCase().includes(q) ||
      r.categories.some((c) => c.toLowerCase().includes(q));
    return matchCategory && matchSearch;
  });
  filteredReports.sort(byDate);
  renderTable();
  updateResultText();
}

function updateResultText() {
  const label =
    currentCategory === "all"
      ? "All Category"
      : currentCategory;
  resultEl.textContent = `${filteredReports.length} Results in ${label}`;
}

function renderFilters(categories) {
  if (!navEl) return;
  navEl.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.className = "filter-btn active";
  allBtn.dataset.category = "all";
  allBtn.textContent = "All Categories";
  navEl.appendChild(allBtn);
  categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn";
    btn.dataset.category = cat;
    btn.textContent = cat;
    navEl.appendChild(btn);
  });
}

function getDownloadUrl(report) {
  if (report.externalLink) return report.externalLink;
  const first = report.localFiles[0];
  if (!first) return null;
  return first.startsWith("http") ? first : "./" + first;
}

/** @returns {'pdf'|'docx'|'xlsx'|'xls'|null} */
function getFileType(url) {
  if (!url || typeof url !== "string") return null;
  const path = url.split("?")[0];
  const ext = (path.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (ext === "xlsx") return "xlsx";
  if (ext === "xls") return "xls";
  return null;
}

function setViewerMode(mode) {
  const loading = document.getElementById("reportViewerLoading");
  const frame = document.getElementById("reportViewerFrame");
  const rendered = document.getElementById("reportViewerRendered");
  if (loading) loading.classList.toggle("is-visible", mode === "loading");
  if (frame) frame.classList.toggle("is-visible", mode === "iframe");
  if (rendered) {
    rendered.classList.toggle("is-visible", mode === "rendered");
    if (mode !== "rendered") rendered.innerHTML = "";
  }
}

async function openReportViewer(report) {
  const modal = document.getElementById("reportViewerModal");
  const frame = document.getElementById("reportViewerFrame");
  const rendered = document.getElementById("reportViewerRendered");
  const titleEl = document.getElementById("reportViewerTitle");
  const downloadLink = document.getElementById("reportViewerDownload");
  const downloadUrl = getDownloadUrl(report);
  if (!modal || !downloadUrl) return;

  titleEl.textContent = report.title;
  downloadLink.href = downloadUrl;
  downloadLink.style.display = downloadUrl ? "" : "none";
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  const type = getFileType(downloadUrl);

  if (type === "pdf") {
    setViewerMode("iframe");
    frame.src = downloadUrl;
    return;
  }

  setViewerMode("loading");
  frame.src = "about:blank";

  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    if (type === "docx") {
      const blob = await res.blob();
      if (typeof docx !== "undefined" && docx.renderAsync) {
        rendered.innerHTML = "";
        await docx.renderAsync(blob, rendered);
        setViewerMode("rendered");
      } else {
        rendered.innerHTML = "<p class=\"report-viewer-error\">DOCX preview not available. Please download the file.</p>";
        setViewerMode("rendered");
      }
      return;
    }

    if (type === "xlsx" || type === "xls") {
      const arrayBuffer = await res.arrayBuffer();
      if (typeof XLSX !== "undefined") {
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheetNames = workbook.SheetNames || [];
        if (sheetNames.length === 0) {
          rendered.innerHTML = "<p class=\"report-viewer-error\">No sheets in workbook.</p>";
        } else {
          let html = "";
          if (sheetNames.length > 1) {
            html += "<div class=\"report-viewer-sheets\">";
            sheetNames.forEach((name, i) => {
              const ws = workbook.Sheets[name];
              const tableHtml = XLSX.utils.sheet_to_html(ws, { id: "sheet-" + i });
              html += "<div class=\"report-viewer-sheet\"><h3 class=\"report-viewer-sheet-title\">" + escapeHtml(name) + "</h3>" + tableHtml + "</div>";
            });
            html += "</div>";
          } else {
            html = XLSX.utils.sheet_to_html(workbook.Sheets[sheetNames[0]], { id: "sheet-0" });
          }
          rendered.innerHTML = html;
        }
        setViewerMode("rendered");
      } else {
        rendered.innerHTML = "<p class=\"report-viewer-error\">Excel preview not available. Please download the file.</p>";
        setViewerMode("rendered");
      }
      return;
    }

    rendered.innerHTML = "<p class=\"report-viewer-error\">This file type cannot be previewed. Please download the file.</p>";
    setViewerMode("rendered");
  } catch (err) {
    rendered.innerHTML = "<p class=\"report-viewer-error\">Failed to load: " + escapeHtml(err.message) + ". You can still download the file.</p>";
    setViewerMode("rendered");
  }
}

function closeReportViewer() {
  const modal = document.getElementById("reportViewerModal");
  const frame = document.getElementById("reportViewerFrame");
  const rendered = document.getElementById("reportViewerRendered");
  if (modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }
  if (frame) frame.src = "about:blank";
  if (rendered) rendered.innerHTML = "";
  setViewerMode("iframe");
  document.body.style.overflow = "";
}

function renderTable() {
  if (!tableBody) return;
  tableBody.innerHTML = "";
  if (filteredReports.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="3" class="no-results">No reports match the current filters.</td>';
    tableBody.appendChild(tr);
    return;
  }
  filteredReports.forEach((r) => {
    const tr = document.createElement("tr");
    const downloadUrl = getDownloadUrl(r);
    const viewBtn = downloadUrl
      ? `<button type="button" class="btn-view" data-report-id="${r.id}">View</button>`
      : "";
    const downloadBtn = downloadUrl
      ? `<a href="${escapeHtml(downloadUrl)}" class="btn-download" download target="_blank" rel="noopener">Download</a>`
      : "";
    const actionsCell = (viewBtn || downloadBtn)
      ? `<span class="cell-actions-btns">${viewBtn}${downloadBtn}</span>`
      : "";
    tr.innerHTML = `
      <td class="cell-date">${formatDate(r.date)}</td>
      <td class="cell-title">${escapeHtml(r.title)}</td>
      <td class="cell-actions">${actionsCell}</td>
    `;
    tableBody.appendChild(tr);
    const viewButton = tr.querySelector(".btn-view");
    if (viewButton) {
      viewButton.addEventListener("click", () => openReportViewer(r));
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function bindEvents() {
  navEl?.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    currentCategory = btn.dataset.category;
    navEl.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    applyFilters();
  });

  sortSelect?.addEventListener("change", () => {
    sortOrder = sortSelect.value;
    applyFilters();
  });

  searchInput?.addEventListener("input", () => {
    applyFilters();
  });

  searchInput?.addEventListener("keyup", (e) => {
    if (e.key === "Enter") applyFilters();
  });
}

function bindViewerModal() {
  const modal = document.getElementById("reportViewerModal");
  const backdrop = modal?.querySelector(".report-viewer-backdrop");
  const closeBtn = modal?.querySelector(".report-viewer-close");
  const close = () => closeReportViewer();
  backdrop?.addEventListener("click", close);
  closeBtn?.addEventListener("click", close);
  modal?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

async function init() {
  try {
    const res = await fetch(DATA_FILE);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allReports = (Array.isArray(data) ? data : []).map(normalizeReport);
    sortOrder = sortSelect?.value || "desc";
    filteredReports = [...allReports].sort(byDate);

    renderFilters(categorySet(allReports));
    bindEvents();
    bindViewerModal();
    updateResultText();
    renderTable();
  } catch (err) {
    resultEl.textContent = `Failed to load reports: ${err.message}`;
  }
}

init();
