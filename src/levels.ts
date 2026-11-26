/*
  Configuration des niveaux : difficulté progressive.
  Chaque niveau active certains patterns, ajuste les cadences,
  la vitesse des projectiles et l'objectif de score pour avancer.
*/

export type PatternKey = "ring" | "spiral" | "wall" | "homing" | "edge" | "star";

export type LevelConfig = {
  index: number;
  name: string;
  subtitle: string;
  goal: number; // score à atteindre pour passer au niveau suivant
  speedMult: number; // multiplicateur de vitesse des projectiles
  rateMult: number; // multiplicateur de cadence (plus petit = plus rapide)
  density: number; // facteur de densité (nb projectiles)
  bg: [string, string]; // dégradé de fond [haut, bas]
  accent: string; // couleur d'accent du niveau
  patterns: PatternKey[];
};

export const LEVELS: LevelConfig[] = [
  {
    index: 1,
    name: "ÉVEIL",
    subtitle: "Premiers réflexes",
    goal: 1500,
    speedMult: 0.85,
    rateMult: 1.35,
    density: 0.7,
    bg: ["#05060f", "#0a0a18"],
    accent: "#22d3ee",
    patterns: ["ring", "spiral"],
  },
  {
    index: 2,
    name: "FLUX",
    subtitle: "Les murs arrivent",
    goal: 4000,
    speedMult: 0.95,
    rateMult: 1.2,
    density: 0.85,
    bg: ["#0a0512", "#12081c"],
    accent: "#a78bfa",
    patterns: ["ring", "spiral", "wall"],
  },
  {
    index: 3,
    name: "TRAQUE",
    subtitle: "Missiles à tête chercheuse",
    goal: 8000,
    speedMult: 1.05,
    rateMult: 1.05,
    density: 1,
    bg: ["#100610", "#1a0a18"],
    accent: "#fb7185",
    patterns: ["ring", "spiral", "wall", "homing"],
  },
  {
    index: 4,
    name: "TEMPÊTE",
    subtitle: "Pluie de néons",
    goal: 14000,
    speedMult: 1.18,
    rateMult: 0.92,
    density: 1.15,
    bg: ["#0d0a05", "#171005"],
    accent: "#facc15",
    patterns: ["ring", "spiral", "wall", "homing", "edge"],
  },
  {
    index: 5,
    name: "CHAOS",
    subtitle: "Étoiles déchaînées",
    goal: 22000,
    speedMult: 1.3,
    rateMult: 0.82,
    density: 1.3,
    bg: ["#0c0510", "#16071a"],
    accent: "#e879f9",
    patterns: ["ring", "spiral", "wall", "homing", "edge", "star"],
  },
  {
    index: 6,
    name: "SINGULARITÉ",
    subtitle: "Survie absolue",
    goal: Infinity,
    speedMult: 1.45,
    rateMult: 0.72,
    density: 1.5,
    bg: ["#020208", "#0a0512"],
    accent: "#34d399",
    patterns: ["ring", "spiral", "wall", "homing", "edge", "star"],
  },
];

export function levelForScore(score: number): LevelConfig {
  for (let i = 0; i < LEVELS.length; i++) {
    if (score < LEVELS[i].goal) return LEVELS[i];
  }
  return LEVELS[LEVELS.length - 1];
}
