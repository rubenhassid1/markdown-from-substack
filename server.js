const express = require("express");
const cheerio = require("cheerio");
const TurndownService = require("turndown");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});

// Keep images as markdown
turndown.addRule("images", {
  filter: "img",
  replacement: (content, node) => {
    const alt = node.getAttribute("alt") || "";
    const src = node.getAttribute("src") || "";
    if (!src) return "";
    return `![${alt}](${src})`;
  },
});

// Handle Substack buttons/links nicely
turndown.addRule("substackButtons", {
  filter: (node) =>
    node.nodeName === "A" && node.classList && node.classList.contains("button"),
  replacement: (content, node) => {
    const href = node.getAttribute("href") || "";
    return `[${content.trim()}](${href})`;
  },
});

// Handle captions
turndown.addRule("figcaption", {
  filter: "figcaption",
  replacement: (content) => `*${content.trim()}*\n\n`,
});

app.post("/api/convert", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  // Validate it looks like a Substack URL or at least a URL
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      return res
        .status(400)
        .json({ error: `Failed to fetch article (HTTP ${response.status})` });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract metadata
    const title =
      $("h1.post-title").first().text().trim() ||
      $("meta[property='og:title']").attr("content") ||
      $("title").text().trim() ||
      "Untitled";

    const subtitle =
      $("h3.subtitle").first().text().trim() ||
      $("meta[property='og:description']").attr("content") ||
      "";

    const author =
      $("a.frontend-pencraft-Text-module__decoration-hover-underline--BEYAn")
        .first()
        .text()
        .trim() ||
      $("meta[name='author']").attr("content") ||
      $(".author-name").first().text().trim() ||
      "";

    const publishDate =
      $("time").first().attr("datetime") ||
      $("meta[property='article:published_time']").attr("content") ||
      "";

    // Extract main article content
    // Substack uses different selectors depending on the version
    let articleHtml = "";

    const selectors = [
      ".body.markup",
      ".post-content",
      "article .body",
      ".available-content",
      "article",
    ];

    for (const selector of selectors) {
      const el = $(selector).first();
      if (el.length && el.html()) {
        // Remove subscribe buttons, share buttons, and other non-content elements
        el.find(".subscription-widget-wrap").remove();
        el.find(".subscribe-widget").remove();
        el.find(".share-dialog").remove();
        el.find(".post-footer").remove();
        el.find(".pencraft.pc-display-flex.pc-gap-4").remove();
        el.find("button").remove();
        el.find(".captioned-button-wrap").remove();
        el.find(".footer").remove();
        el.find(".comment-list-wrap").remove();

        articleHtml = el.html();
        break;
      }
    }

    if (!articleHtml) {
      return res.status(400).json({
        error:
          "Could not find article content. Make sure this is a valid Substack post URL.",
      });
    }

    // Convert to markdown
    let markdown = "";

    // Add frontmatter-style header
    markdown += `# ${title}\n\n`;

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

    if (metaParts.length > 0) {
      markdown += metaParts.join(" | ") + "\n\n---\n\n";
    }

    // Convert article body
    const bodyMarkdown = turndown.turndown(articleHtml);

    // Clean up the markdown
    markdown += bodyMarkdown
      // Remove excessive blank lines
      .replace(/\n{4,}/g, "\n\n\n")
      // Clean up any leftover HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      // Trim each line
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim();

    markdown += "\n";

    // Generate filename from title
    const filename =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) + ".md";

    res.json({
      markdown,
      title,
      filename,
      metadata: { title, subtitle, author, publishDate },
    });
  } catch (err) {
    console.error("Conversion error:", err);
    res.status(500).json({
      error: "Failed to convert article. Please check the URL and try again.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
