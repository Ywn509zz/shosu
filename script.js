// === Elements ===
const searchInput = document.getElementById("songName");
const resultsDiv = document.getElementById("results");
const micButton = document.getElementById("micButton");
const searchButton = document.getElementById("searchButton");
const themeBtn = document.getElementById("theme-toggle");
const clearButton = document.getElementById("clearButton");
const account = document.getElementById("account");

function showLoginSuccess() {
  if (new URLSearchParams(window.location.search).get("login") !== "success") return;

  const notice = document.createElement("div");
  notice.className = "login-notice";
  notice.setAttribute("role", "status");
  notice.innerHTML = "<strong>Vous êtes connecté à osu!</strong><span>Redirection vers shOsu!...</span>";
  document.body.appendChild(notice);

  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("login");
  window.history.replaceState({}, "", cleanUrl);
  window.setTimeout(() => notice.remove(), 4000);
}

showLoginSuccess();

async function loadAccount() {
  if (!account) return;
  try {
    const response = await fetch("/api/auth/me", { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const data = await response.json();
    if (!data.authenticated) return;

    const user = document.createElement("span");
    user.textContent = `Connecté : ${data.user.username} (${data.plan})`;
    const logout = document.createElement("button");
    logout.type = "button";
    logout.textContent = "Se déconnecter";
    logout.addEventListener("click", async () => {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (response.ok) window.location.reload();
    });
    account.replaceChildren(user, logout);
  } catch (error) {
    console.error("Erreur de chargement du compte :", error);
  }
}

loadAccount();

// === Pagination ===
let allResults = [];
let currentPage = 1;
const resultsPerPage = 50;

// === Star rating couleur ===
function getStarColor(stars) {
  const s = Math.floor(stars);
  switch(s) {
    case 1: return "#4FC0FF";
    case 2: return "#4FFFD5";
    case 3: return "#7CFF4F";
    case 4: return "#F6F05C";
    case 5: return "#FF8068";
    case 6: return "#FF3C71";
    case 7: return "#FF00A0";
    case 8: return "#6563DE";
    case 9: return "#AA00FF";
    default: return "#000000"; // 10+
  }
}

// === Stop audios ===
function stopAllAudios() {
  document.querySelectorAll("audio").forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
  document.querySelectorAll(".play-btn").forEach(btn => {
    btn.innerHTML = "▶ <span>Écouter</span>";
  });
}

// === Affichage page ===
function displayPage(page) {
  resultsDiv.innerHTML = "";
  const start = (page - 1) * resultsPerPage;
  const end = start + resultsPerPage;
  const pageResults = allResults.slice(start, end);

  pageResults.forEach(mapset => {
    const modesInSet = mapset.beatmaps
      ? [...new Set(mapset.beatmaps.map(bm => bm.mode.toLowerCase()))]
      : [mapset.mode ? mapset.mode.toLowerCase() : ""];
    const coverUrl = `https://assets.ppy.sh/beatmaps/${mapset.id}/covers/cover.jpg`;

    // Nouveau : URL audio directe depuis osu
    const previewUrl = mapset.preview_url || "";

    const div = document.createElement("article");
    div.className = "beatmap-card";

    div.innerHTML = `
      <div class="card-cover-wrap">
        <img class="card-cover" src="${coverUrl}" alt="Cover de ${mapset.title}" loading="lazy">
        <span class="status-badge">${mapset.status}</span>
      </div>
      <div class="card-content">
        <div class="card-heading">
          <div>
            <p class="card-kicker">${modesInSet.join(" · ")}</p>
            <h3>${mapset.title}</h3>
            <p class="card-artist">${mapset.artist} <span>·</span> ${mapset.creator}</p>
          </div>
          ${mapset.beatmaps && mapset.beatmaps.length > 0 ? `<p class="star-rating">⭐ ${mapset.beatmaps[0].difficulty_rating.toFixed(2)}★</p>` : ""}
        </div>
        <div class="card-footer">
          <a href="https://osu.ppy.sh/beatmapsets/${mapset.id}" target="_blank" rel="noopener noreferrer">Voir le beatmap <span aria-hidden="true">↗</span></a>
          ${previewUrl ? `<button class="play-btn" type="button">▶ <span>Écouter</span></button><audio src="https://b.ppy.sh/preview/${previewUrl.split('/').pop()}" preload="none"></audio>` : ""}
        </div>
      </div>
    `;

    if (mapset.beatmaps && mapset.beatmaps.length > 0) {
      const starP = div.querySelector(".star-rating");
      starP.style.color = getStarColor(mapset.beatmaps[0].difficulty_rating);
    }

    resultsDiv.appendChild(div);

    if (previewUrl) {
      const playBtn = div.querySelector(".play-btn");
      const audio = div.querySelector("audio");

      playBtn.addEventListener("click", () => {
        if (audio.paused) {
          stopAllAudios();
          audio.play();
          playBtn.innerHTML = "⏸ <span>Pause</span>";
        } else {
          audio.pause();
          playBtn.innerHTML = "▶ <span>Écouter</span>";
        }
      });

      audio.addEventListener("ended", () => {
        playBtn.innerHTML = "▶ <span>Écouter</span>";
      });
    }
  });

  // Pagination
  const totalPages = Math.ceil(allResults.length / resultsPerPage);
  if (totalPages > 1) {
    const paginationDiv = document.createElement("div");
    paginationDiv.classList.add("pagination");
    paginationDiv.style.display = "flex";
    paginationDiv.style.justifyContent = "center";
    paginationDiv.style.gap = "10px";
    paginationDiv.style.marginTop = "10px";

    if (page > 1) {
      const prevBtn = document.createElement("button");
      prevBtn.textContent = "← Previous";
      prevBtn.addEventListener("click", () => { currentPage--; displayPage(currentPage); });
      paginationDiv.appendChild(prevBtn);
    }

    if (page < totalPages) {
      const nextBtn = document.createElement("button");
      nextBtn.textContent = "Next →";
      nextBtn.addEventListener("click", () => { currentPage++; displayPage(currentPage); });
      paginationDiv.appendChild(nextBtn);
    }

    resultsDiv.appendChild(paginationDiv);
  }
}

// === Recherche Beatmap ===
async function searchBeatmap() {
  const query = searchInput.value.trim();
  if (!query) {
    alert("Please enter a song name or artist.");
    return;
  }

  resultsDiv.innerHTML = `<div class="spinner"></div>`;

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (!data.beatmapsets || data.beatmapsets.length === 0) {
      resultsDiv.innerHTML = "<span style='color: red;'>No beatmaps found.</span>";
      return;
    }

    const modeFilter = document.getElementById("mode").value.toLowerCase();
    const statusFilter = document.getElementById("status").value.toLowerCase();

    allResults = data.beatmapsets.filter(mapset => {
      const modesInSet = mapset.beatmaps
        ? [...new Set(mapset.beatmaps.map(bm => bm.mode.toLowerCase()))]
        : [mapset.mode ? mapset.mode.toLowerCase() : ""];
      const status = mapset.status ? mapset.status.toLowerCase() : "";

      if (modeFilter && modeFilter !== "all" && !modesInSet.includes(modeFilter)) return false;
      if (statusFilter && statusFilter !== "all" && status !== statusFilter) return false;

      return true;
    });

    if (allResults.length === 0) {
      resultsDiv.innerHTML = "<span style='color: red;'>No beatmaps found.</span>";
      return;
    }

    currentPage = 1;
    displayPage(currentPage);

  } catch (error) {
    console.error(error);
    resultsDiv.innerHTML = "<span style='color: red;'>Error fetching data. Try again later.</span>";
  }
}

// === Clear Search ===
function clearSearch() {
  searchInput.value = "";
  resultsDiv.innerHTML = "";
}
searchInput.addEventListener("keydown", e => { if (e.key === "Enter") searchBeatmap(); });
searchButton.addEventListener("click", searchBeatmap);
clearButton.addEventListener("click", clearSearch);

// === Reconnaissance vocale ===
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  micButton.addEventListener("click", () => recognition.start());
  recognition.onresult = e => { searchInput.value = e.results[0][0].transcript; searchBeatmap(); };
  recognition.onerror = e => console.error("Erreur reconnaissance vocale :", e.error);
} else micButton.style.display = "none";

// === Toggle Thème ===
themeBtn.addEventListener("click", () => {
  document.body.classList.toggle("light-mode");
  themeBtn.textContent = document.body.classList.contains("light-mode") ? '☀️' : '🌙';
});

// === Ripple effect ===
document.querySelectorAll('button').forEach(button => {
  button.style.position = 'relative';
  button.style.overflow = 'hidden';
  button.addEventListener('click', function(e) {
    const circle = document.createElement('span');
    circle.classList.add('ripple');
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    circle.style.width = circle.style.height = size + 'px';
    circle.style.left = (e.clientX - rect.left - size/2) + 'px';
    circle.style.top = (e.clientY - rect.top - size/2) + 'px';
    this.appendChild(circle);
    circle.addEventListener('animationend', () => circle.remove());
  });
});
