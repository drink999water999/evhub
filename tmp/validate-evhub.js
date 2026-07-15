const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("index.html", "utf8");
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .filter((code) => code.trim());

if (inlineScripts.length !== 1) {
  throw new Error("Expected one inline application script, found " + inlineScripts.length);
}

if (html.includes('href="#/smart"') || html.includes('data-route="smart"')) {
  throw new Error("Legacy Smart EV navigation is still visible");
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
  location: { hash: "#/home", href: "http://127.0.0.1/evhub-preview.html#/home", protocol: "http:" },
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
  servicesHub: "servicesHubView()",
  account: "accountView()",
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
if (!compare.includes("<table") || !compare.includes("compare-mobile-list") || !compare.includes("Lucid")) {
  throw new Error("Comparison view did not render selected vehicles");
}
results.compare = compare.length;

new vm.Script("state.lang='en'").runInContext(context);
const englishHome = new vm.Script("homeView()").runInContext(context);
if (!englishHome.includes("Every electric journey") || englishHome.includes("undefined")) {
  throw new Error("English home view failed");
}
results.englishHome = englishHome.length;
const englishSmart = new vm.Script("servicesHubView()").runInContext(context);
if (!englishSmart.includes("Everything you need before and after buying") || !englishSmart.includes("Peer-to-peer EV charging") || englishSmart.includes("undefined")) {
  throw new Error("English services hub failed");
}
results.englishSmart = englishSmart.length;
const englishDetail = new vm.Script("detailView('tesla-model-y')").runInContext(context);
if (!englishDetail.includes("Battery life lab") || !englishDetail.includes("110 km daily") || !englishDetail.includes("range-trip-result") || !englishDetail.includes("vehicle-range-map") || !englishDetail.includes('data-range-plan="charge"') || englishDetail.includes("undefined")) {
  throw new Error("English vehicle prediction tools failed");
}
results.englishDetail = englishDetail.length;
const clickableCard = new vm.Script("vehicleCard(vehicles[0])").runInContext(context);
if (!clickableCard.includes('role="link"') || !clickableCard.includes('data-action="detail"')) {
  throw new Error("Vehicle cards are not fully clickable");
}
const riyadhJeddahKm = new vm.Script("geoDistanceKm(24.7136,46.6753,21.5433,39.1728)").runInContext(context);
if (!(riyadhJeddahKm > 700 && riyadhJeddahKm < 1000)) {
  throw new Error("Map distance calculation is outside the expected range");
}
results.mapDistanceCheckKm = Math.round(riyadhJeddahKm);
if (!html.includes('location.protocol==="file:"') || !html.includes("initRangeCanvasMap(container,v,base)")) {
  throw new Error("Local-file map fallback is not wired into vehicle pages");
}
if (!html.includes("function initChargingCanvasMap") || !html.includes("initChargingCanvasMap(container,list)")) {
  throw new Error("Local-file map fallback is not wired into the charging page");
}
const canvasProjection = new vm.Script("var m={bounds:{minLat:16,maxLat:33.5,minLng:34.5,maxLng:56},width:900,height:430};var p=rangeCanvasProject(m,24.7136,46.6753);rangeCanvasCoordinate(m,p.x,p.y)").runInContext(context);
if (Math.abs(canvasProjection.lat - 24.7136) > 0.001 || Math.abs(canvasProjection.lng - 46.6753) > 0.001) {
  throw new Error("Local range-map coordinate projection is inconsistent");
}
results.localMapProjection = "passed";
const chargingBounds = new vm.Script("chargingCanvasBounds(stations.filter(function(s){return s.cityKey==='Jeddah'}))").runInContext(context);
if (!(chargingBounds.minLat < chargingBounds.maxLat && chargingBounds.minLng < chargingBounds.maxLng)) {
  throw new Error("Charging map does not produce valid filtered bounds");
}
results.localChargingMap = "passed";

new vm.Script("state.rangePlanner={charge:100,reserve:5,temp:25,mode:'city'}").runInContext(context);
const bestRange = new vm.Script("vehicleUsableRange(vehicles[0]).km").runInContext(context);
new vm.Script("state.rangePlanner={charge:50,reserve:20,temp:50,mode:'highway'}").runInContext(context);
const constrainedRange = new vm.Script("vehicleUsableRange(vehicles[0]).km").runInContext(context);
if (!(bestRange > constrainedRange && constrainedRange > 0)) {
  throw new Error("Vehicle range planner does not respond correctly to charge, reserve, temperature and driving type");
}
results.rangePlannerScenarios = {
  best: Math.round(bestRange),
  constrained: Math.round(constrainedRange)
};

new vm.Script("state.battery={city:'Jeddah',usage:'heavy',dailyKm:110,daysWeek:7,dcShare:55,sunExposure:2}").runInContext(context);
const heavyHot = new vm.Script("batteryPrediction(vehicles[0]).y5").runInContext(context);
new vm.Script("state.battery={city:'Abha',usage:'light',dailyKm:15,daysWeek:2,dcShare:10,sunExposure:0}").runInContext(context);
const lightCool = new vm.Script("batteryPrediction(vehicles[0]).y5").runInContext(context);
if (!(heavyHot < lightCool)) {
  throw new Error("Battery predictor does not respond correctly to climate and usage");
}
results.predictorScenarios = { heavyHot, lightCool };

const localAssets = [...html.matchAll(/(?:src|href)="(Media\/[^"#?]+)"/g)].map((match) => match[1]);
for (const asset of new Set(localAssets)) {
  if (!fs.existsSync(asset)) {
    throw new Error("Missing local asset: " + asset);
  }
}

console.log(JSON.stringify({ ok: true, views: results, localAssets: [...new Set(localAssets)] }, null, 2));
