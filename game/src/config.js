// SOLMAR HEAT - shared configuration for the city of Solmar Bay.
// Every module reads its tuning from here so the world stays consistent.

export const WORLD = {
  // Streets run along these coordinates; blocks sit between them.
  roadsX: [-150, -90, -30, 30, 90, 150], // north-south avenues (constant x)
  roadsZ: [-120, -60, 0, 60, 120],       // east-west streets (constant z)
  roadHalf: 6,                            // half width of a road in metres
  blockInset: 3,                          // sidewalk inset around each block
  minX: -190, maxX: 190,
  minZ: -160, maxZ: 235,
  beachZ: 168,                            // sand starts here
  waterZ: 205,                            // waterline
  seed: 20261122,
};

// Warm sunset palette for Solmar Bay.
export const PALETTE = {
  sky: 0xffb36b,
  skyLow: 0xff7e5f,
  fog: 0xf7a56b,
  sun: 0xffd9a0,
  ground: 0x8a8f7a,
  road: 0x33343c,
  roadLine: 0xf5d76e,
  sidewalk: 0xb8b3a4,
  sand: 0xeed9a3,
  water: 0x2e7f9e,
  palmTrunk: 0x7a5a38,
  palmLeaf: 0x3e9e4f,
};

// Paint jobs for civilian cars - bright coastal colours plus a few dark ones.
export const CAR_PAINTS = [
  0xe74c3c, 0xf39c12, 0xf7e463, 0x2ecc71, 0x1abc9c, 0x3498db,
  0x9b59b6, 0xec87bf, 0xff9e7d, 0xa7e8bd, 0xc3a6ff, 0xf5f5f5,
  0x2c3e50, 0xfd6c9e, 0x4dd0e1,
];

export const POLICE_PAINT = 0xf2f2f2;
export const POLICE_STRIPE = 0x14406e;

export const PLAYER = {
  walkSpeed: 7,
  runSpeed: 12,
  radius: 0.55,
  maxHealth: 100,
  startMoney: 120,
  start: { x: -30, z: 132, heading: Math.PI }, // Ocean Drive, facing the beach
};

export const CAR_TUNING = {
  accel: 22,
  brake: 34,
  reverseMax: 10,
  drag: 0.55,
  gripTurn: 1.9,      // radians per second at full lock, scaled by speed
  radius: 1.55,
};

export const WANTED = {
  maxStars: 5,
  decaySeconds: 22,   // quiet time needed to shed one star
  evadeRadius: 65,    // police farther than this count as "lost"
  evadeSeconds: 7,    // hidden this long -> faster decay
};

// The five story missions, in order. Steps are resolved by missions.js.
export const STORY = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    intro: 'Your cousin Marco left a teal coupe by the beach lot. Take it and bring it to the Solmar Grand Hotel.',
    reward: 250,
  },
  {
    id: 'port-run',
    title: 'Port Run',
    intro: 'A crate at Port Solmar needs to reach the Centro tower garage. Fast. The clock is running.',
    reward: 400,
  },
  {
    id: 'cool-off',
    title: 'Cool Off',
    intro: 'You are burned. 3 stars of heat - lose the police and let Solmar Bay forget your face.',
    reward: 350,
  },
  {
    id: 'beach-courier',
    title: 'Beach Courier',
    intro: 'Hit every lifeguard stand along the shore, north to south, before the sun drops.',
    reward: 500,
  },
  {
    id: 'golden-hour',
    title: 'Golden Hour',
    intro: 'One last job: the gold convertible at the port goes to the tower roof party. Everyone will be watching.',
    reward: 1000,
  },
];
