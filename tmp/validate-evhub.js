const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("evhub-preview.html", "utf8");
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .filter((code) => code.trim());

if (inlineScripts.length !== 1) {
  throw new Error("Expected one inline application script, found " + inlineScripts.length);
}

new vm.Script(inlineScripts[0], { filename: "evhub-inline.js" });

const definitionsOnly = inlineScripts[0].split('document.addEventListener("click"')[0];
const store = new Map();
const context = vm.createContext({
  console,
  Set,
  Map,
  JSON,
  Number,
  String,
  Math,
  Date,
  Array,
  Object,
  localStorage: {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, value)
  },
  location: { hash: "#/home", href: "http://127.0.0.1/evhub-preview.html#/home" },
  navigator: {},
  matchMedia: () => ({ matches: false }),
  setTimeout,
  clearTimeout,
  performance,
  requestAnimationFrame: (callback) => callback(performance.now())
});

new vm.Script(definitionsOnly, { filename: "evhub-definitions.js" }).runInContext(context);

const expressions = {
  home: "homeView()",
  marketplace: "marketplaceView()",
  detail: "detailView('ioniq-5-used')",
  tools: "toolsView()",
  charging: "chargingView()",
  services: "servicesView()",
  seller: "workspaceView('seller')",
  dealer: "workspaceView('dealer')",
  fleet: "workspaceView('fleet')",
  admin: "workspaceView('admin')"
};

const results = {};
for (const [name, expression] of Object.entries(expressions)) {
  const output = new vm.Script(expression).runInContext(context);
  if (typeof output !== "string" || output.length < 500) {
    throw new Error(name + " view did not render meaningful HTML");
  }
  if (/\bundefined\b/.test(output)) {
    throw new Error(name + " view rendered an undefined value");
  }
  results[name] = output.length;
}

new vm.Script("state.compare=new Set(['lucid-air','tesla-model-y','byd-sealion-7'])").runInContext(context);
const compare = new vm.Script("compareView()").runInContext(context);
if (!compare.includes("<table") || !compare.includes("Lucid")) {
  throw new Error("Comparison view did not render selected vehicles");
}
results.compare = compare.length;

new vm.Script("state.lang='en'").runInContext(context);
const englishHome = new vm.Script("homeView()").runInContext(context);
if (!englishHome.includes("Every electric journey") || englishHome.includes("undefined")) {
  throw new Error("English home view failed");
}
results.englishHome = englishHome.length;

const localAssets = [...html.matchAll(/(?:src|href)="(Media\/[^"#?]+)"/g)].map((match) => match[1]);
for (const asset of new Set(localAssets)) {
  if (!fs.existsSync(asset)) {
    throw new Error("Missing local asset: " + asset);
  }
}

console.log(JSON.stringify({ ok: true, views: results, localAssets: [...new Set(localAssets)] }, null, 2));
