// Selecting DOM elements
const searchForm = document.querySelector("#search-form");
const search = document.querySelector("#search");
const number = document.querySelector("#number");
const pokemonImage = document.querySelector("#pokemon-image");
const pokemonName = document.querySelector("#pokemon-name");
const types = document.querySelector("#types");
const height = document.querySelector("#height");
const weight = document.querySelector("#weight");
const statNumber = document.querySelectorAll(".stat-number");
const barInner = document.querySelectorAll(".bar-inner");
const message = document.querySelector("#message");
const loading = document.querySelector("#loading");
const statusLight = document.querySelector("#status-light");
const prevButton = document.querySelector("#prev");
const nextButton = document.querySelector("#next");
const randomButton = document.querySelector("#random");
const shinyButton = document.querySelector("#shiny");
const root = document.documentElement;

// Highest Pokémon number available on PokéAPI
const MAX_POKEMON = 1025;
// Highest possible base stat, used to scale the bars
const MAX_STAT = 255;

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

const rgb = (c, alpha = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;

// Function to fetch Pokémon data from the API
const fetchApi = async (pokemonName) => {
    const pokemonNameApi = pokemonName.toString().trim().toLowerCase().split(' ').join('-');
    const response = await fetch("https://pokeapi.co/api/v2/pokemon/" + pokemonNameApi);

    if (response.status === 200) {
        return response.json();
    }

    return false;
};

// Fetches the Pokédex entry text (in English) for a Pokémon
const fetchFlavorText = async (speciesUrl) => {
    try {
        const response = await fetch(speciesUrl);
        if (!response.ok) return "";
        const species = await response.json();
        const entry = species.flavor_text_entries.find((e) => e.language.name === "en");
        return entry ? entry.flavor_text.replace(/[\f\n\r]/g, " ") : "";
    } catch {
        return "";
    }
};

// Picks a pixel-art sprite (Gen V animated when available), with fallbacks
const getSprite = (pokemonData) => {
    const sprites = pokemonData.sprites;
    const key = shiny ? "front_shiny" : "front_default";
    const bw = sprites.versions?.["generation-v"]?.["black-white"];

    return bw?.animated?.[key] || bw?.[key] || sprites[key] || sprites.front_default;
};

const setMessage = (text, isError = false) => {
    message.textContent = text;
    message.classList.toggle("error", isError);
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
    pokemonImage.alt = pokemonData.name;
    pokemonImage.classList.add("appear");
};

// Renders the Pokémon on the screen
const renderPokemon = (pokemonData) => {
    // Setting main color for UI theme
    const mainColor = typeColors[pokemonData.types[0].type.name] || typeColors.normal;
    root.style.setProperty("--main", rgb(mainColor));
    root.style.setProperty("--main-soft", rgb(mainColor, 0.25));

    // Setting Pokémon number and name
    number.textContent = '#' + pokemonData.id.toString().padStart(3, "0");
    pokemonName.textContent = pokemonData.name.replace(/-/g, " ");
    search.value = pokemonData.name.replace(/-/g, " ");

    // Height (decimeters) and weight (hectograms)
    height.textContent = `${(pokemonData.height / 10).toFixed(1)} m`;
    weight.textContent = `${(pokemonData.weight / 10).toFixed(1)} kg`;

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
    pokemonData.stats.forEach((s, i) => {
        if (!statNumber[i]) return;
        statNumber[i].textContent = s.base_stat.toString().padStart(3, "0");
        barInner[i].style.width = `${Math.min(100, (s.base_stat / MAX_STAT) * 100)}%`;
    });
};

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
        if (currentPokemon) search.value = currentPokemon.name.replace(/-/g, " ");
        return;
    }

    currentPokemon = pokemonData;
    currentId = pokemonData.id;
    setLoading(false);
    renderPokemon(pokemonData);

    const flavor = await fetchFlavorText(pokemonData.species.url);
    if (requestId !== requestCounter) return;
    setMessage(flavor || `${pokemonData.name.toUpperCase()} was registered in the POKéDEX!`);
};

// Navigation helpers
const goTo = (id) => {
    if (id < 1) id = MAX_POKEMON;
    if (id > MAX_POKEMON) id = 1;
    loadPokemon(id);
};

// Event listeners
searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    search.blur();
    loadPokemon(search.value);
});

search.addEventListener("focus", () => search.select());

prevButton.addEventListener("click", () => goTo(currentId - 1));
nextButton.addEventListener("click", () => goTo(currentId + 1));
randomButton.addEventListener("click", () => goTo(Math.floor(Math.random() * MAX_POKEMON) + 1));

shinyButton.addEventListener("click", () => {
    shiny = !shiny;
    shinyButton.classList.toggle("active", shiny);
    shinyButton.setAttribute("aria-pressed", shiny);
    if (currentPokemon) updateImage(currentPokemon);
});

// Keyboard shortcuts (when not typing in the search box)
document.addEventListener("keydown", (event) => {
    if (document.activeElement === search) return;
    if (event.key === "ArrowLeft") goTo(currentId - 1);
    if (event.key === "ArrowRight") goTo(currentId + 1);
});

// Initial load
loadPokemon(1);
