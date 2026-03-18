let currentMarkdown = "";
let currentFilename = "";

const urlInput = document.getElementById("url-input");
const convertBtn = document.getElementById("convert-btn");
const loading = document.getElementById("loading");
const error = document.getElementById("error");
const result = document.getElementById("result");
const resultTitle = document.getElementById("result-title");
const markdownOutput = document.getElementById("markdown-output");

// Allow Enter key to trigger conversion
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") convert();
});

async function convert() {
  const url = urlInput.value.trim();
  if (!url) return;

  // Reset UI
  error.classList.add("hidden");
  result.classList.add("hidden");
  loading.classList.remove("hidden");
  convertBtn.disabled = true;

  try {
    const res = await fetch("/api/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Something went wrong");
    }

    currentMarkdown = data.markdown;
    currentFilename = data.filename;

    resultTitle.textContent = data.title;
    markdownOutput.textContent = data.markdown;
    result.classList.remove("hidden");
  } catch (err) {
    error.textContent = err.message;
    error.classList.remove("hidden");
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = currentFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
