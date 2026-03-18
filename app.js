let currentMarkdown = "";
let currentFilename = "";

const urlInput = document.getElementById("url-input");
const convertBtn = document.getElementById("convert-btn");
const loading = document.getElementById("loading");
const errorEl = document.getElementById("error");
const result = document.getElementById("result");
const resultTitle = document.getElementById("result-title");
const markdownOutput = document.getElementById("markdown-output");

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") convert();
});

// Setup Turndown
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});

turndown.addRule("images", {
  filter: "img",
  replacement: (content, node) => {
    const alt = node.getAttribute("alt") || "";
    const src = node.getAttribute("src") || "";
    if (!src) return "";
    return `![${alt}](${src})`;
  },
});

turndown.addRule("substackButtons", {
  filter: (node) =>
    node.nodeName === "A" &&
    node.classList &&
    node.classList.contains("button"),
  replacement: (content, node) => {
    const href = node.getAttribute("href") || "";
    return `[${content.trim()}](${href})`;
  },
});

turndown.addRule("figcaption", {
  filter: "figcaption",
  replacement: (content) => `*${content.trim()}*\n\n`,
});

async function fetchHTML(url) {
  // Use allorigins as CORS proxy
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`Failed to fetch article (HTTP ${res.status})`);
  return await res.text();
}

function parseArticle(html, url) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const title =
    getText(doc, "h1.post-title") ||
    getMeta(doc, "og:title") ||
    doc.title ||
    "Untitled";

  const subtitle =
    getText(doc, "h3.subtitle") || getMeta(doc, "og:description") || "";

  const author =
    getText(
      doc,
      "a.frontend-pencraft-Text-module__decoration-hover-underline--BEYAn"
    ) ||
    doc.querySelector("meta[name='author']")?.getAttribute("content") ||
    getText(doc, ".author-name") ||
    "";

  const publishDate =
    doc.querySelector("time")?.getAttribute("datetime") ||
    doc
      .querySelector("meta[property='article:published_time']")
      ?.getAttribute("content") ||
    "";

  // Find article content
  const selectors = [
    ".body.markup",
    ".post-content",
    "article .body",
    ".available-content",
    "article",
  ];

  let articleEl = null;
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el && el.innerHTML.trim().length > 100) {
      articleEl = el;
      break;
    }
  }

  if (!articleEl) {
    throw new Error(
      "Could not find article content. Make sure this is a valid Substack post URL."
    );
  }

  // Remove non-content elements
  const removeSelectors = [
    ".subscription-widget-wrap",
    ".subscribe-widget",
    ".share-dialog",
    ".post-footer",
    ".pencraft.pc-display-flex.pc-gap-4",
    "button",
    ".captioned-button-wrap",
    ".footer",
    ".comment-list-wrap",
  ];
  for (const sel of removeSelectors) {
    articleEl.querySelectorAll(sel).forEach((el) => el.remove());
  }

  // Build markdown
  let markdown = `# ${title}\n\n`;

  if (subtitle) {
    markdown += `> ${subtitle}\n\n`;
  }

  const metaParts = [];
  if (author) metaParts.push(`**Author:** ${author}`);
  if (publishDate) {
    const date = new Date(publishDate);
    const formatted = date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    metaParts.push(`**Published:** ${formatted}`);
  }
  metaParts.push(`**Source:** [${url}](${url})`);
  markdown += metaParts.join(" | ") + "\n\n---\n\n";

  // Convert body
  const bodyMarkdown = turndown.turndown(articleEl.innerHTML);

  markdown += bodyMarkdown
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

  markdown += "\n";

  const filename =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) + ".md";

  return { markdown, title, filename };
}

function getText(doc, selector) {
  const el = doc.querySelector(selector);
  return el ? el.textContent.trim() : "";
}

function getMeta(doc, property) {
  const el = doc.querySelector(`meta[property='${property}']`);
  return el ? el.getAttribute("content") || "" : "";
}

async function convert() {
  const url = urlInput.value.trim();
  if (!url) return;

  try {
    new URL(url);
  } catch {
    errorEl.textContent = "Please enter a valid URL";
    errorEl.classList.remove("hidden");
    return;
  }

  errorEl.classList.add("hidden");
  result.classList.add("hidden");
  loading.classList.remove("hidden");
  convertBtn.disabled = true;

  try {
    const html = await fetchHTML(url);
    const data = parseArticle(html, url);

    currentMarkdown = data.markdown;
    currentFilename = data.filename;

    resultTitle.textContent = data.title;
    markdownOutput.textContent = data.markdown;
    result.classList.remove("hidden");
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
  } finally {
    loading.classList.add("hidden");
    convertBtn.disabled = false;
  }
}

function copyMarkdown() {
  navigator.clipboard.writeText(currentMarkdown).then(() => {
    const btn = document.querySelector(".btn-secondary");
    const original = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = original), 1500);
  });
}

function downloadMarkdown() {
  const blob = new Blob([currentMarkdown], { type: "text/markdown" });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = currentFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}
