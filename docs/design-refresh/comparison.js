const query = new URLSearchParams(window.location.search);
const viewControl = document.querySelector("#view");
const themeControl = document.querySelector("#theme");
viewControl.value = ["home", "routine", "workout"].includes(query.get("view"))
  ? query.get("view")
  : "home";
themeControl.value = query.get("theme") === "light" ? "light" : "dark";
function update() {
  const view = viewControl.value;
  const theme = themeControl.value;
  document.documentElement.dataset.theme = theme;
  for (const [id, folder] of [
    ["before", "baseline"],
    ["after", "proposal"],
  ]) {
    const file = `./${folder}/${theme}-${view}.png`;
    document.querySelector(`#${id}`).src = file;
    document.querySelector(`#${id}-link`).href = file;
  }
  document.querySelector("#interactive").href =
    `./prototype/index.html?view=${view}&theme=${theme}`;
  window.history.replaceState(null, "", `?view=${view}&theme=${theme}`);
}
viewControl.addEventListener("change", update);
themeControl.addEventListener("change", update);
update();
