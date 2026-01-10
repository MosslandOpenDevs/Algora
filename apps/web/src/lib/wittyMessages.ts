/**
 * Witty Messages System
 *
 * Fun, playful messages inspired by Claude Code's loading messages.
 * These add personality and delight to loading states and status updates.
 */

// Loading/Processing messages - shown while waiting
export const loadingMessages = [
  // Claude Code classics
  'Germinating...',
  'Ebbing...',
  'Percolating...',
  'Cogitating...',
  'Pondering...',
  'Ruminating...',
  'Deliberating...',
  'Contemplating...',
  'Musing...',
  'Cerebrating...',
  // Whimsical verbs
  'Noodling...',
  'Wrangling...',
  'Orchestrating...',
  'Harmonizing...',
  'Crystallizing...',
  'Fermenting...',
  'Distilling...',
  'Incubating...',
  'Metamorphosing...',
  'Transmuting...',
  // Fun ones
  'Beboppin\'...',
  'Boogieing...',
  'Moonwalking...',
  'Zigzagging...',
  'Flibbertigibbeting...',
  'Razzle-dazzling...',
  'Prestidigitating...',
  'Combobulating...',
  'Discombobulating...',
  'Whatchamacalliting...',
  // Technical feel
  'Bootstrapping...',
  'Quantumizing...',
  'Nebulizing...',
  'Reticulating...',
  'Cascading...',
  'Nucleating...',
  'Propagating...',
];

// Agent activity messages
export const agentActivityMessages = [
  'Pondering...',
  'Deliberating...',
  'Cerebrating...',
  'Ruminating...',
  'Cogitating...',
  'Contemplating...',
  'Musing...',
  'Architecting...',
  'Orchestrating...',
  'Inferring...',
  'Elucidating...',
  'Deciphering...',
  'Crafting...',
  'Composing...',
  'Channelling...',
  'Envisioning...',
  'Manifesting...',
];

// Session status messages
export const sessionMessages = {
  starting: [
    'Spawning agents...',
    'Bootstrapping...',
    'Channelling...',
    'Mustering...',
    'Orchestrating...',
    'Hatching...',
  ],
  active: [
    'Consensus forming...',
    'Deliberating...',
    'Harmonizing...',
    'Cerebrating...',
    'Pollinating...',
    'Symbioting...',
  ],
  concluding: [
    'Crystallizing...',
    'Distilling...',
    'Tempering...',
    'Actualizing...',
    'Manifesting...',
    'Transfiguring...',
  ],
};

// Signal collection messages
export const signalMessages = [
  'Reconciling signals...',
  'Reality syncing...',
  'Deciphering...',
  'Channelling...',
  'Percolating...',
  'Infusing...',
  'Nebulizing...',
  'Cascading...',
  'Propagating...',
  'Reticulating...',
  'Unfurling...',
  'Whirlpooling...',
];

// Empty state messages
export const emptyStateMessages = {
  noSessions: [
    'The agora awaits its first debate...',
    'Incubating the next discussion...',
    'Germinating ideas in the void...',
    'Silence before the symposium...',
  ],
  noSignals: [
    'The airwaves are quiet... for now.',
    'Nebulizing the silence...',
    'Waiting for the cosmos to ping...',
    'The radar hums patiently...',
  ],
  noAgents: [
    'The lobby hibernates...',
    'Agents are percolating elsewhere...',
    'Awaiting digital symposiasts...',
    'The stage anticipates performers...',
  ],
  noActivity: [
    'The stage is quiet... for now.',
    'Awaiting the next act...',
    'Systems are humming, events are brewing...',
    'A calm before the storm of activity...',
  ],
};

// Success messages
export const successMessages = [
  'Accomplished!',
  'Actualized!',
  'Crystallized!',
  'Manifested!',
  'Transmuted!',
  'Effected!',
  'Harmonized!',
  'Orchestrated!',
];

// Error recovery messages
export const errorRecoveryMessages = [
  'Recombobulating...',
  'Unravelling the knot...',
  'Recalibrating...',
  'Meandering around the obstacle...',
  'Zigzagging past the hiccup...',
  'Wrangling the issue...',
];

// Governance-specific messages
export const governanceMessages = {
  voting: [
    'Tallying voices...',
    'Weighing perspectives...',
    'Harmonizing opinions...',
    'Crystallizing consensus...',
  ],
  proposal: [
    'Architecting change...',
    'Forging the proposal...',
    'Sculpting governance...',
    'Manifesting intent...',
  ],
  execution: [
    'Actualizing decisions...',
    'Transmuting votes into action...',
    'Effecting change...',
    'Orchestrating outcomes...',
  ],
};

/**
 * Get a random message from an array
 */
export function getRandomMessage(messages: string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Get a random loading message
 */
export function getLoadingMessage(): string {
  return getRandomMessage(loadingMessages);
}

/**
 * Get a random agent activity message
 */
export function getAgentActivityMessage(): string {
  return getRandomMessage(agentActivityMessages);
}

/**
 * Get a random signal message
 */
export function getSignalMessage(): string {
  return getRandomMessage(signalMessages);
}

/**
 * Get a random success message
 */
export function getSuccessMessage(): string {
  return getRandomMessage(successMessages);
}

/**
 * Cycle through messages with a given interval
 * Returns a cleanup function
 */
export function cycleMessages(
  messages: string[],
  callback: (message: string) => void,
  interval: number = 2000
): () => void {
  let index = Math.floor(Math.random() * messages.length);

  callback(messages[index]);

  const timer = setInterval(() => {
    index = (index + 1) % messages.length;
    callback(messages[index]);
  }, interval);

  return () => clearInterval(timer);
}
