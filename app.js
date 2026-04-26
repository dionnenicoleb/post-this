// Post This — single-screen ritual app.
// Saves each thought to Supabase, then opens LinkedIn's composer.

const SUPABASE_URL = "https://rmftvqqxktjwinpypeva.supabase.co";
// Anon key is safe to expose. RLS on the `posts` table allows insert only.
const SUPABASE_ANON_KEY = "sb_publishable_Oh8nexfc-GYcp2PpAO_cxA_mpCf88JT";

const $ = (id) => document.getElementById(id);
const thought = $("thought");
const voice = $("voice");
const sendBtn = $("send");
const formatBtn = $("format");
const copyBtn = $("copy");
const status = $("status");

function refreshButtons() {
  const has = thought.value.trim().length > 0;
  sendBtn.disabled = !has;
  formatBtn.disabled = !has;
  copyBtn.disabled = !has;
}
thought.addEventListener("input", () => {
  refreshButtons();
  if (status.textContent) status.textContent = "";
});
refreshButtons();

formatBtn.addEventListener("click", () => {
  thought.value = thought.value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  refreshButtons();
});

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(thought.value);
  status.textContent = "Copied.";
});

sendBtn.addEventListener("click", async () => {
  const text = thought.value.trim();
  if (!text) return;
  sendBtn.disabled = true;
  sendBtn.textContent = "Sending…";
  status.textContent = "";

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        text,
        voice_url: voice.value.trim() || null,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || res.statusText);
    }

    const url =
      "https://www.linkedin.com/feed/?shareActive=true&text=" +
      encodeURIComponent(text);
    window.open(url, "_blank", "noopener,noreferrer");

    status.textContent = "Logged.";
  } catch (e) {
    console.error(e);
    status.textContent = "Not saved. Try again.";
  } finally {
    sendBtn.textContent = "Send to LinkedIn";
    refreshButtons();
  }
});

// Service worker — silent if it fails.
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
