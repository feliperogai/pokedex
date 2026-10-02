// Selecting DOM elements
const stage = document.querySelector("#stage");
const pokedex = document.querySelector("#pokedex");
const searchForm = document.querySelector("#search-form");
const search = document.querySelector("#search");
const pokemonList = document.querySelector("#pokemon-list");
const number = document.querySelector("#number");
const pokemonImage = document.querySelector("#pokemon-image");
const pokemonName = document.querySelector("#pokemon-name");
const genus = document.querySelector("#genus");
const types = document.querySelector("#types");
const height = document.querySelector("#height");
const weight = document.querySelector("#weight");
const abilities = document.querySelector("#abilities");
const total = document.querySelector("#total");
const statNumber = document.querySelectorAll(".stat-number");
const barInner = document.querySelectorAll(".bar-inner");
const message = document.querySelector("#message");
const loading = document.querySelector("#loading");
const statusLight = document.querySelector("#status-light");
const prevButton = document.querySelector("#prev");
const nextButton = document.querySelector("#next");
const randomButton = document.querySelector("#random");
const shinyButton = document.querySelector("#shiny");
const cryButton = document.querySelector("#cry");
const root = document.documentElement;

const API = "https://pokeapi.co/api/v2";
// Highest Pokémon number available on PokéAPI
const MAX_POKEMON = 1025;
// Highest possible base stat, used to scale the bars
const MAX_STAT = 255;
// Design sizes of each layout (must match style.css)
const LAYOUTS = {
    tall: { width: 380, height: 800 },
    wide: { width: 900, height: 540 }
};
const MAX_SCALE = 2;

// Object containing colors for different Pokémon types
const typeColors = {
    "rock": [182, 158, 49],
    "ghost": [112, 85, 155],
    "steel": [183, 185, 208],
    "water": [100, 147, 235],
    "grass": [116, 203, 72],
    "psychic": [251, 85, 132],
    "ice": [154, 214, 223],
    "dark": [117, 87, 76],
    "fairy": [230, 158, 172],
    "normal": [170, 166, 127],
    "fighting": [193, 34, 57],
    "flying": [168, 145, 236],
    "poison": [164, 62, 158],
    "ground": [222, 193, 107],
    "bug": [167, 183, 35],
    "fire": [245, 125, 49],
    "electric": [249, 207, 48],
    "dragon": [112, 55, 255]
};

// Current state
let currentPokemon = null;
let currentId = 1;
let shiny = false;
let requestCounter = 0;
let typingTimer = null;
let cryAudio = null;
let messageText = message.textContent;

const rgb = (c, alpha = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
const prettyName = (name) => name.replace(/-/g, " ");

// Small wrappers so the page still works when storage is blocked
const storage = {
    get(key) {
        try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
        try { localStorage.setItem(key, value); } catch { /* ignore */ }
    }
};

/* ---------- Fit the Pokédex to the screen (no scroll) ---------- */

// Picks the layout that gives the biggest Pokédex and scales it to fit the stage
const fitToScreen = () => {
    const gap = Math.max(16, Math.min(stage.clientWidth, stage.clientHeight) * 0.04);
    const availWidth = stage.clientWidth - gap * 2;
    const availHeight = stage.clientHeight - gap * 2;

    let best = null;
    for (const [name, size] of Object.entries(LAYOUTS)) {
        const scale = Math.min(availWidth / size.width, availHeight / size.height);
        if (!best || scale > best.scale) best = { name, scale };
    }

    pokedex.classList.toggle("tall", best.name === "tall");
    pokedex.classList.toggle("wide", best.name === "wide");
    root.style.setProperty("--scale", Math.max(0.1, Math.min(best.scale, MAX_SCALE)).toFixed(4));
    pokedex.classList.add("ready");

    // Text boxes have different sizes in each layout
    if (fitToScreen.layout !== best.name) {
        fitToScreen.layout = best.name;
        refitTexts();
    }
};

new ResizeObserver(fitToScreen).observe(stage);
window.addEventListener("orientationchange", fitToScreen);
fitToScreen();

// Pixel fonts change the text size once loaded: measure again
document.fonts?.ready.then(() => refitTexts());

/* ---------- API ---------- */

// Function to fetch Pokémon data from the API
const fetchApi = async (pokemonName) => {
    const pokemonNameApi = pokemonName.toString().trim().toLowerCase().replace(/^#?0*(\d)/, "$1").split(' ').join('-');
    const response = await fetch(`${API}/pokemon/${pokemonNameApi}`);

    if (response.status === 200) {
        return response.json();
    }

    return false;
};

// Fetches the Pokédex entry text and category (in English) for a Pokémon
const fetchSpecies = async (speciesUrl) => {
    try {
        const response = await fetch(speciesUrl);
        if (!response.ok) return {};
        const species = await response.json();
        const entry = species.flavor_text_entries?.find((e) => e.language.name === "en");
        const category = species.genera?.find((g) => g.language.name === "en");
        return {
            flavor: entry ? entry.flavor_text.replace(/[\f\n\r­]/g, " ").replace(/\s+/g, " ") : "",
            genus: category ? category.genus : ""
        };
    } catch {
        return {};
    }
};

// Fills the search autocomplete with every Pokémon name
const loadNameList = async () => {
    try {
        const response = await fetch(`${API}/pokemon?limit=${MAX_POKEMON}`);
        if (!response.ok) return;
        const data = await response.json();
        const fragment = document.createDocumentFragment();
        data.results.forEach((p) => {
            const option = document.createElement("option");
            option.value = prettyName(p.name);
            fragment.appendChild(option);
        });
        pokemonList.appendChild(fragment);
    } catch {
        /* autocomplete is optional */
    }
};

/* ---------- Rendering ---------- */

// Picks a pixel-art sprite (Gen V animated when available), with fallbacks
const getSprite = (pokemonData) => {
    const sprites = pokemonData.sprites;
    const key = shiny ? "front_shiny" : "front_default";
    const bw = sprites.versions?.["generation-v"]?.["black-white"];

    return bw?.animated?.[key] || bw?.[key] || sprites[key] || sprites.front_default;
};

// Shrinks the font of an element until its text fits (keeps everything visible without scroll)
function fitText(element, maxSize, minSize) {
    let size = maxSize;
    element.style.fontSize = `${size}px`;
    while (size > minSize && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)) {
        size -= 1;
        element.style.fontSize = `${size}px`;
    }
}

// Re-measures the name and the dialog box (measured with the full text, even mid-typing)
function refitTexts() {
    fitText(pokemonName, 16, 8);
    const shown = message.textContent;
    message.textContent = messageText;
    fitText(message, 20, 13);
    message.textContent = shown;
}

// Writes text in the dialog box letter by letter, like the old games
const setMessage = (text, isError = false) => {
    clearInterval(typingTimer);
    message.classList.toggle("error", isError);

    // Measure with the full text first so the font size doesn't change while typing
    messageText = text;
    message.textContent = text;
    fitText(message, 20, 13);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
        message.textContent = text;
        return;
    }

    let i = 0;
    message.textContent = "";
    typingTimer = setInterval(() => {
        i += 2;
        message.textContent = text.slice(0, i);
        if (i >= text.length) clearInterval(typingTimer);
    }, 25);
};

const setLoading = (isLoading) => {
    loading.hidden = !isLoading;
    statusLight.classList.toggle("busy", isLoading);
    pokemonImage.style.visibility = isLoading ? "hidden" : "visible";
};

// Updates the image with a small "appear" animation
const updateImage = (pokemonData) => {
    pokemonImage.classList.remove("appear");
    void pokemonImage.offsetWidth; // restart animation
    pokemonImage.src = getSprite(pokemonData);
    pokemonImage.alt = prettyName(pokemonData.name);
    pokemonImage.classList.add("appear");
};

// Renders the Pokémon on the screen
const renderPokemon = (pokemonData) => {
    // Setting main color for UI theme
    const mainColor = typeColors[pokemonData.types[0].type.name] || typeColors.normal;
    root.style.setProperty("--main", rgb(mainColor));
    root.style.setProperty("--main-soft", rgb(mainColor, 0.25));

    // Setting Pokémon number and name
    number.textContent = '#' + pokemonData.id.toString().padStart(4, "0");
    pokemonName.textContent = prettyName(pokemonData.name);
    pokemonName.title = prettyName(pokemonData.name);
    fitText(pokemonName, 16, 8);
    search.value = prettyName(pokemonData.name);
    genus.textContent = " ";
    document.title = `${prettyName(pokemonData.name).toUpperCase()} - Rogai Pokédex`;

    // Height (decimeters), weight (hectograms) and abilities
    height.textContent = `${(pokemonData.height / 10).toFixed(1)} m`;
    weight.textContent = `${(pokemonData.weight / 10).toFixed(1)} kg`;
    const abilityNames = pokemonData.abilities.filter((a) => !a.is_hidden).map((a) => prettyName(a.ability.name));
    abilities.textContent = (abilityNames.length ? abilityNames : pokemonData.abilities.map((a) => prettyName(a.ability.name))).join(" / ") || "-";
    abilities.parentElement.title = pokemonData.abilities.map((a) => prettyName(a.ability.name) + (a.is_hidden ? " (hidden)" : "")).join(", ");

    updateImage(pokemonData);

    // Updating "Type" bubbles
    types.innerHTML = "";
    pokemonData.types.forEach((t) => {
        const newType = document.createElement("span");
        const color = typeColors[t.type.name] || typeColors.normal;
        newType.textContent = t.type.name;
        newType.classList.add("type");
        newType.style.backgroundColor = rgb(color);
        types.appendChild(newType);
    });

    // Updating Stats and Stats Bars
    let sum = 0;
    pokemonData.stats.forEach((s, i) => {
        sum += s.base_stat;
        if (!statNumber[i]) return;
        statNumber[i].textContent = s.base_stat.toString().padStart(3, "0");
        barInner[i].style.width = `${Math.min(100, (s.base_stat / MAX_STAT) * 100)}%`;
    });
    total.textContent = sum;

    // Cry button only when there is a sound for this Pokémon
    cryButton.disabled = !(pokemonData.cries?.legacy || pokemonData.cries?.latest);
};

/* ---------- Actions ---------- */

// Loads a Pokémon by name or number
const loadPokemon = async (query) => {
    if (!query.toString().trim()) return;

    const requestId = ++requestCounter;
    setLoading(true);
    setMessage("Searching...");

    let pokemonData = false;
    try {
        pokemonData = await fetchApi(query);
    } catch {
        pokemonData = false;
    }

    // Ignore outdated responses
    if (requestId !== requestCounter) return;

    // Handling non-existent Pokémon
    if (!pokemonData) {
        setLoading(false);
        setMessage(`Oops! "${query.toString().toUpperCase()}" was not found in the POKéDEX.`, true);
        if (currentPokemon) search.value = prettyName(currentPokemon.name);
        return;
    }

    currentPokemon = pokemonData;
    currentId = pokemonData.id;
    storage.set("pokedex:last", pokemonData.id);
    setLoading(false);
    renderPokemon(pokemonData);

    const species = await fetchSpecies(pokemonData.species.url);
    if (requestId !== requestCounter) return;
    genus.textContent = species.genus || " ";
    setMessage(species.flavor || `${prettyName(pokemonData.name).toUpperCase()} was registered in the POKéDEX!`);
};

// Navigation helpers
const goTo = (id) => {
    if (id < 1) id = MAX_POKEMON;
    if (id > MAX_POKEMON) id = 1;
    loadPokemon(id);
};

const goRandom = () => goTo(Math.floor(Math.random() * MAX_POKEMON) + 1);

const toggleShiny = () => {
    shiny = !shiny;
    shinyButton.classList.toggle("active", shiny);
    shinyButton.setAttribute("aria-pressed", shiny);
    if (currentPokemon) updateImage(currentPokemon);
};

// Plays the Pokémon cry (the old 8-bit one when available)
const playCry = () => {
    const src = currentPokemon?.cries?.legacy || currentPokemon?.cries?.latest;
    if (!src) return;

    if (cryAudio) cryAudio.pause();
    cryAudio = new Audio(src);
    cryAudio.volume = 0.5;
    cryButton.classList.add("playing");
    cryAudio.addEventListener("ended", () => cryButton.classList.remove("playing"));
    cryAudio.play().catch(() => cryButton.classList.remove("playing"));
};

/* ---------- Event listeners ---------- */

searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    search.blur();
    loadPokemon(search.value);
});

search.addEventListener("focus", () => search.select());

prevButton.addEventListener("click", () => goTo(currentId - 1));
nextButton.addEventListener("click", () => goTo(currentId + 1));
randomButton.addEventListener("click", goRandom);
shinyButton.addEventListener("click", toggleShiny);
cryButton.addEventListener("click", playCry);

// Keyboard shortcuts (when not typing in the search box)
document.addEventListener("keydown", (event) => {
    if (document.activeElement === search || event.ctrlKey || event.metaKey || event.altKey) return;

    switch (event.key) {
        case "ArrowLeft": goTo(currentId - 1); break;
        case "ArrowRight": goTo(currentId + 1); break;
        case "r": case "R": goRandom(); break;
        case "s": case "S": toggleShiny(); break;
        case "c": case "C": playCry(); break;
        case "/":
            event.preventDefault();
            search.focus();
            break;
        default: return;
    }
});

// Swipe left/right on touch screens to navigate
let touchStartX = null;
let touchStartY = null;
stage.addEventListener("touchstart", (event) => {
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
}, { passive: true });

stage.addEventListener("touchend", (event) => {
    if (touchStartX === null) return;
    const dx = event.changedTouches[0].clientX - touchStartX;
    const dy = event.changedTouches[0].clientY - touchStartY;
    touchStartX = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        goTo(currentId + (dx < 0 ? 1 : -1));
    }
}, { passive: true });

// Initial load: last viewed Pokémon or Bulbasaur
loadPokemon(storage.get("pokedex:last") || 1);
loadNameList();
