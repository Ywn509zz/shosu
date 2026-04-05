// === Elements ===
const searchInput = document.getElementById("songName");
const resultsDiv = document.getElementById("results");
const micButton = document.getElementById("micButton");
const searchButton = document.getElementById("searchButton");
const themeBtn = document.getElementById("theme-toggle");
const clearButton = document.getElementById("clearButton");

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
  document.querySelectorAll(".play-btn").forEach(btn => btn.textContent = "▶️ Play");
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

    const div = document.createElement("div");
    div.style.cssText = "display: flex; align-items: center; background: rgba(255,255,255,0.1); padding: 10px; margin-bottom: 10px; border-radius: 6px;";

    div.innerHTML = `
      <img src="${coverUrl}" alt="Cover" style="width: 120px; height: 68px; border-radius: 4px; object-fit: cover; margin-right: 10px;">
      <div style="flex: 1;">
        <h3 style="margin:0;">${mapset.title} - ${mapset.artist}</h3>
        <p style="margin: 4px 0 2px;">Creator: ${mapset.creator}</p>
        <p style="margin: 2px 0;">Status: ${mapset.status}</p>
        <p style="margin: 2px 0;">Modes: ${modesInSet.join(", ")}</p>
        ${mapset.beatmaps && mapset.beatmaps.length > 0 ? `<p class="star-rating">⭐ ${mapset.beatmaps[0].difficulty_rating.toFixed(2)}★</p>` : ""}
        <a href="https://osu.ppy.sh/beatmapsets/${mapset.id}" target="_blank" rel="noopener noreferrer" style="color:#00aaff;">View Beatmap</a>
      </div>
      ${previewUrl ? `<button class="play-btn" style="margin-left: 10px; padding: 8px 12px; cursor: pointer;">▶️ Play</button><audio src="https://b.ppy.sh/preview/${previewUrl.split('/').pop()}" preload="none"></audio>` : ""}
    `;

    if (mapset.beatmaps && mapset.beatmaps.length > 0) {
      const starP = div.querySelector(".star-rating");
      const rating = mapset.beatmaps[0].difficulty_rating;
      starP.style.color = getStarColor(rating);
    }

    resultsDiv.appendChild(div);

    if (previewUrl) {
      const playBtn = div.querySelector(".play-btn");
      const audio = div.querySelector("audio");

      playBtn.addEventListener("click", () => {
        if (audio.paused) {
          stopAllAudios();
          audio.play();
          playBtn.textContent = "⏸️ Pause";
        } else {
          audio.pause();
          playBtn.textContent = "▶️ Play";
        }
      });

      audio.addEventListener('ended', () => playBtn.textContent = "▶️ Play");
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
    const response = await fetch(`https://shosu-backend.onrender.com/search?q=${encodeURIComponent(query)}`);
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
