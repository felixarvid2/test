// Motiv för spelets bilder (FLUX.2 Turbo via fal.ai). Nyckel = sökväg under rune/assets/ (utan filändelse).
// Alla bilder delar samma stil så att de hänger ihop.
const STYLE = 'Dark fantasy rune roguelike game icon. Single centered object, bold readable silhouette, '
  + 'painterly digital art, glowing magical highlights, deep purple and gold palette, soft dark vignette background, '
  + 'no text, no letters, no numbers, no frame, no border.';
const BG_STYLE = 'Dark fantasy rune roguelike game background art, painterly, moody purple and gold lighting, '
  + 'subtle details, low contrast so UI stays readable, no text, no letters, no characters.';

const RELICS = {
  runsten: 'a carved standing runestone with one glowing rune',
  samlarsten: 'a gold ring set with several small glowing gemstones',
  feltrycket: 'a misprinted playing die with smudged glowing pips',
  fana: 'a tattered red war banner on a wooden pole',
  bergstopp: 'a lonely snowy mountain peak under stars',
  halvmane: 'a half moon split exactly in two, one side glowing',
  akrobaten: 'a jester acrobat mid-flip silhouette',
  gryningen: 'a sunrise over a misty horizon',
  schablonen: 'an empty ornate stencil card with cut-out shapes',
  pirathatten: 'a pirate tricorn hat with a skull emblem',
  tjuren: 'a bronze bull head statue',
  stovelremmen: 'a leather boot with a golden buckled strap',
  stenmuren: 'a sturdy wall of grey stone bricks',
  solsten: 'a radiant sunstone gem glowing yellow',
  glodkol: 'a glowing ember coal with flames',
  manesilver: 'a silver crescent moon amulet',
  benflojt: 'a flute carved from bone',
  rotknuta: 'a gnarled knot of tree roots with green leaves',
  askstav: 'a wizard staff crackling with lightning',
  prisma: 'a cyan crystal prism refracting light',
  ljuslykta: 'a paper lantern glowing warm sunlight',
  glodsten: 'a blood red bloodstone gem with ember glow',
  tidparla: 'a moonlit pearl inside an oyster shell',
  gravstenen: 'an ancient funeral urn with skull motif',
  kristallkronan: 'a crown made of cyan crystal shards',
  nattens_oga: 'a mystical eye in a night sky with a moon pupil',
  visitkortet: 'a black business card with a silver skull',
  blomkrukan: 'a clay flower pot with four different magical flowers',
  urtidsrunan: 'an ancient cracked clay vase with glowing runes',
  idolen: 'a small golden idol statuette on a pedestal',
  glad_trefot: 'a cheerful three-legged golden tripod',
  snedsteget: 'a diagonal staircase of floating stone steps',
  fyrkanten: 'a glowing purple square stone tile',
  fyrklovern: 'a glowing four-leaf clover',
  regnbagsfjadern: 'a rainbow colored feather',
  spegelskarvan: 'a shard of a magic mirror reflecting light',
  korsriddaren: 'two crossed knight swords',
  linjalen: 'an ornate brass measuring ruler',
  glorian: 'a golden halo ring floating',
  stenhuggaren: 'a stonemason hammer and chisel',
  travstaven: 'a simple wooden walking staff',
  tegelstenen: 'a single clay brick',
  fyrfoten: 'a glowing animal paw print with four toes',
  trefaldigheten: 'a golden trident',
  snedkronet: 'a tilted royal crown',
  kubtornet: 'a pagoda tower made of stacked cubes',
  fyrtornet: 'a lighthouse with a bright beam',
  prismakronan: 'a crown radiating a rainbow',
  tvillingarna: 'two identical mirrored twin masks',
  kedjelanken: 'heavy iron chain links glowing',
  dominobrickan: 'a falling row of domino tiles',
  lavinen: 'a rolling snow avalanche',
  ekot: 'a bronze bell with sound wave rings',
  kaskaden: 'a cascading waterfall of glowing water',
  ensamvargen: 'a lone wolf howling at the moon',
  brokiga: 'a woven tapestry of many colorful threads',
  overspanning: 'a glass battery overflowing with lightning',
  smedjan: 'a blacksmith anvil with hammer and sparks',
  slipstenen: 'a whetstone sharpening a crystal blade',
  gronskan: 'a fresh green sprout growing from a rune stone',
  solglasogonen: 'round dark sunglasses reflecting the sun',
  tidvattnet: 'a great tidal wave under the moon',
  offerkniven: 'a ritual dagger with a black blade',
  alkemisten: 'a bubbling alchemy flask with colorful smoke',
  reaktorn: 'a glowing green radioactive core',
  ledaren: 'a horseshoe magnet with sparks',
  katalysatorn: 'a test tube with a violent glowing reaction',
  hornstenen: 'a cornerstone block with a carved right angle',
  hjartstenen: 'a burning heart-shaped stone',
  kantvakten: 'a sturdy round shield',
  karnan: 'a glowing target bullseye of runes',
  horisonten: 'a mountain horizon at sunset',
  lodet: 'a ship anchor hanging straight down',
  himlavalvet: 'a swirling galaxy in a dome sky',
  kompassen: 'an antique brass compass',
  eremiten: 'a tiny lonely island with one palm tree',
  tomrummet: 'a dark swirling void hole',
  stenhjartat: 'an anatomical heart carved from stone',
  murbruket: 'a bucket of mortar with a trowel',
  skuggspelaren: 'a jester shadow puppet lit by a candle, casting a large shadow on a wall',
  baronen: 'a top hat with a monocle',
  vandraren: 'a hooded wanderer walking with a lantern',
  grodan: 'a green frog sitting on a lily pad',
  loparen: 'a sprinting runner silhouette with speed lines',
  glassen: 'a melting ice cream cone',
  rostad_mandel: 'a small bowl of roasted almonds',
  astrologen: 'a brass telescope pointed at stars',
  hologrammet: 'a shimmering holographic disc',
  vampyren: 'a vampire with a cape and red eyes',
  lagerelden: 'a crackling campfire with logs',
  lyckokatten: 'a lucky cat figurine waving its paw',
  glasogat: 'a magnifying glass with a cracked lens',
  tillbakablicken: 'an hourglass running backwards',
  offerdolken: 'an ornate ceremonial dagger with gems',
  blixtkortet: 'a vintage camera with a bright flash',
  reservfickan: 'a pair of patched trousers',
  spakvinnan: 'a fortune teller witch with a crystal ball',
  falskspelaren: 'a card sharp hand hiding a card in a sleeve',
  bubbelvattnet: 'a fizzy soda bottle with bubbles',
  bananen: 'a single ripe yellow banana',
  tomhetsstenen: 'a black void stone absorbing light',
  vandringsstaven: 'a hiker walking stick with a crystal top',
  marmorbrottet: 'a pickaxe striking white marble',
  guldbaggen: 'a golden scarab beetle',
  agget: 'a speckled golden egg',
  raketen: 'a small rocket launching with flame',
  till_manen: 'a full moon with a tiny rocket flying to it',
  moln_nio: 'a fluffy cloud with a glowing gem on top',
  fordrojd: 'an hourglass resting on a pile of coins',
  ansiktslos: 'a blank faceless porcelain mask',
  presentkortet: 'a wrapped gift box with a ribbon',
  midasmasken: 'a golden mask turning things to gold',
  gyllene_biljetten: 'a golden ticket glowing',
  att_gora: 'a parchment checklist with a quill',
  hacket: 'a woodcutter axe stuck in a log',
  skymningen: 'a city skyline at dusk',
  maskerna: 'comedy and tragedy theater masks',
  hangande_lappen: 'a paper note hanging from a paperclip',
  ekokammaren: 'a spiral seashell with echo rings',
  forbannade_kronan: 'a cursed dark crown with skull ornaments and purple smoke',
  sollinsen: 'a magnifying lens focusing a sunbeam',
  bryggan: 'an arched stone bridge over a gap',
  smetade_paletten: 'a painter palette with smeared colors',
  plasket: 'a splash of glowing water droplets',
  langa_armen: 'a long mechanical robotic arm',
  jonglaren: 'a juggler juggling glowing orbs',
  fyllbulten: 'a foaming beer tankard',
  trubaduren: 'a violin with a bow',
  inbrottstjuven: 'a masked burglar with a sack',
  lyckosolen: 'a slot machine wheel showing lucky symbols',
  gycklaren: 'a striped circus tent',
  dubbelhelixen: 'a glowing DNA double helix',
  sigillbrevet: 'a letter sealed with a red wax seal',
  kaosclownen: 'a bunch of colorful balloons',
  astronomen: 'an astronaut helmet with stars reflected',
  avtrycket: 'a blue blueprint scroll with a copied design',
  tankestormen: 'a glowing brain with lightning thoughts',
  spadomskulan: 'a black magic eight ball',
  superposition: 'a swirling spiral of overlapping realities',
  rymdfararen: 'a flying saucer UFO with a beam',
  spakortet: 'a tarot card with a mystical eye',
  seansen: 'a seance candle with ghostly smoke',
  bronda_runan: 'a burnt scorched rune stone steaming',
  packet: 'a sneaky rat with a stolen coin',
  askkungen: 'an erupting volcano king made of ash and lava, legendary',
  solkonungen: 'a sun king with a radiant crown and moon, legendary',
  gravvaktaren: 'a skeletal grave guardian with a tombstone, legendary',
  vaktarbanan: 'a black raven with glowing eyes, legendary',
  spegelvannen: 'a set of nested matryoshka dolls glowing, legendary',
  ouroboros: 'an ouroboros serpent biting its own tail, legendary'
};

const SYMS = {
  sol: 'a radiant golden sun',
  eld: 'a fierce orange flame',
  mane: 'a pale blue crescent moon',
  dod: 'a pale bone skull',
  natur: 'a bright green leafy sprig',
  blixt: 'a yellow lightning bolt',
  kristall: 'a cyan diamond crystal'
};

const BOSSES = {
  muren: 'a towering stone wall blocking the way', stenfaltet: 'a field of jagged boulders',
  spegeln: 'a haunted ornate mirror', forseglaren: 'a giant iron padlock seal', kedjan: 'a giant chained iron shackle',
  psyket: 'a giant glowing psychic brain', vattnet: 'a crashing water wave', armen: 'a massive armored fist',
  nalen: 'a giant sewing needle', virveln: 'a swirling vortex', tornet: 'a dark tower crumbling', tanden: 'a giant sharp fang',
  kroken: 'a giant iron hook', ogat: 'a giant watching eye', munnen: 'a giant grinning mouth with fangs',
  bergvaggen: 'an enormous cliff wall', gloden: 'smoldering hot coals', dimman: 'a creeping fog with eyes',
  purpurkarlet: 'a huge purple ritual vessel, final boss', karmosinhjartat: 'a giant crimson beating heart, final boss',
  grona_bladet: 'a giant poisonous green leaf, final boss', askstormen: 'a raging storm of ash, final boss'
};

const VOUCHERS = {
  overflod: 'an overflowing basket of treasures', rensning: 'a magic broom sweeping', krigsrop: 'a war horn',
  hamstraren: 'a hamster with stuffed cheeks of coins', rea: 'a shopping bag with a sale tag', lager: 'a stack of crates',
  omrullning: 'circular arrows made of light', teleskop: 'a long brass telescope', ristarbod: 'a small wooden rune shop hut',
  stjarnbod: 'a star shaped market stall', slipning: 'a sparkling gem being polished', penseln: 'a calligraphy brush',
  antimateria: 'a glowing antimatter atom'
};

const TAGS = {
  pengar: 'a sack of gold coins', relik: 'a mysterious gift box', stjarna: 'a shooting star', ristning: 'a magic wand',
  rabatt: 'a price tag', eko: 'a friendly ghost', runor: 'a bundle of rune stones'
};

const PACKS = {
  rune: 'a booster pack of rune stones in a pouch', rist: 'a booster pack of carved rune cards',
  star: 'a booster pack of constellation cards', relic: 'a treasure chest booster pack', eko: 'a ghostly spectral booster pack'
};

const CARDS = {
  rist: 'the back of a tarot-like card with carved runes',
  star: 'the back of a card with a starry constellation',
  eko: 'the back of a card with ghostly spectral swirls'
};

function list() {
  const out = [];
  const add = (key, subject, o) => out.push(Object.assign({ key, prompt: STYLE + ' Subject: ' + subject + '.', w: 512, h: 512 }, o || {}));
  Object.entries(RELICS).forEach(([k, v]) => add('relic/' + k, v));
  Object.entries(SYMS).forEach(([k, v]) => add('sym/' + k, v + ', carved into a smooth round dark rune stone'));
  Object.entries(BOSSES).forEach(([k, v]) => add('boss/' + k, v + ', menacing'));
  Object.entries(VOUCHERS).forEach(([k, v]) => add('voucher/' + k, v));
  Object.entries(TAGS).forEach(([k, v]) => add('tag/' + k, v));
  Object.entries(PACKS).forEach(([k, v]) => add('pack/' + k, v));
  Object.entries(CARDS).forEach(([k, v]) => add('card/' + k, v, { prompt: STYLE.replace('Single centered object, ', '') + ' Subject: ' + v + ', full card filling the frame.' }));
  out.push({ key: 'bg/altar', prompt: BG_STYLE + ' Subject: an ancient stone altar table seen from above, carved runes around the edges, candlelight.', w: 1024, h: 768 });
  out.push({ key: 'bg/menu', prompt: BG_STYLE + ' Subject: a mystical temple of glowing runestones under a starry night sky.', w: 1024, h: 768 });
  return out;
}
module.exports = { list, RELICS };
