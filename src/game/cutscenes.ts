import type { Controls } from "../engine/input";
import type { EnemyKind } from "./config";
import { MAIN } from "./quests";
import { sfx, type FxShow, type Profile, type World } from "./state";

/**
 * Cutscenes: short scripted scenes played on an empty stage with the game's
 * own figures. A scene is a list of beats; each beat has a caption, a place
 * for the camera to look, and cues that put actors on stage or move them.
 * This file holds the scripts and steps them. Drawing is the view's job.
 */

/** Who can stand on the stage: any enemy kind, the hunter, or a named person. */
export type ActorKind = EnemyKind | "player" | "mara" | "dov" | "rival";
export type CutPose = "idle" | "down" | "slump" | "cast" | "attack" | "guard";

type Point = [number, number];

export interface Cue {
  /** Which actor. The first cue for a name must say what `kind` it is. */
  a: string;
  kind?: ActorKind;
  /** Appear here at once. */
  at?: Point;
  /** Walk here. */
  to?: Point;
  /** Turn to look at this spot. */
  face?: Point;
  pose?: CutPose;
  /** A violet shade rather than a living thing. */
  ghost?: boolean;
  /** Climb out of the floor. */
  rise?: boolean;
  /** Leave the stage: sink into the floor. */
  out?: boolean;
}

export interface Beat {
  /** Seconds on screen, unless the player moves on sooner. */
  dur: number;
  speaker: string;
  text: string;
  /** Where the camera looks, and how close it stands (1 = as in play). */
  focus: Point;
  zoom: number;
  cues?: Cue[];
  sound?: string;
  /** A white flash as the beat begins. */
  flash?: boolean;
  shake?: number;
  /** Where the camera drifts to over the beat, and the zoom it ends at. */
  pan?: Point;
  zoomTo?: number;
  /** Effects that play as the beat begins: the same ones the fight uses. */
  fx?: CutFx[];
}

/** An effect cued by a beat: what, where, how big, for how long. */
export interface CutFx {
  kind: FxShow | "ring" | "blast" | "beam";
  at: Point;
  to?: Point;
  radius: number;
  color: string;
  dur: number;
}

export interface Cutscene {
  id: string;
  title: string;
  /** The chapter it belongs to, 1 to 6. */
  chapter: number;
  beats: Beat[];
}

/** An actor on the stage. */
export interface CutActor {
  id: string;
  kind: ActorKind;
  x: number;
  y: number;
  px?: number;
  py?: number;
  radius: number;
  facing: number;
  pose: CutPose;
  ghost: boolean;
  /** Where it is walking to. */
  tx: number;
  ty: number;
  moving: boolean;
  /** Seconds left of rising from, or sinking into, the floor. */
  anim: number;
  out: boolean;
}

export interface CutsceneState {
  id: string;
  beat: number;
  /** Seconds into the current beat. */
  t: number;
  /** Seconds Esc has been held. */
  hold: number;
  /** Seconds left of the white flash. */
  flash: number;
  actors: CutActor[];
}

/** Hold Esc this long to skip a scene. */
export const SKIP_HOLD = 2;
/** No scene runs longer than this. */
export const MAX_SCENE = 40;
export const CUT = { walk: 150, rise: 0.9, sink: 0.6, flash: 0.5 };

const LEDGER = "THE LEDGER";
const MARA = "Mara Quill";
const DOV = "Dov";
const VOSS = "Halden Voss";
const C: Point = [700, 450];

export const CUTSCENES: Record<string, Cutscene> = {
  intro: {
    id: "intro",
    title: "Entered in the Ledger",
    chapter: 1,
    beats: [
      {
        dur: 6,
        speaker: "",
        text: "Ten years ago the gates opened over Veyra. Those who could fight what came out of them were called hunters.",
        focus: C,
        zoom: 1.1,
        cues: [
          { a: "hunter", kind: "player", at: [690, 470], face: [900, 470] },
          { a: "dov", kind: "dov", at: [770, 440], face: [900, 440] },
        ],
      },
      {
        dur: 6,
        speaker: "",
        text: "You were Rank E. The lowest. The one the others brought along to carry bags.",
        focus: [730, 450],
        zoom: 1.6,
        cues: [
          { a: "s1", kind: "swarmer", at: [1150, 300], to: [860, 420] },
          { a: "s2", kind: "swarmer", at: [1180, 520], to: [870, 500] },
          { a: "s3", kind: "swarmer", at: [1220, 420], to: [900, 460] },
        ],
        sound: "alarm",
      },
      {
        dur: 5,
        speaker: DOV,
        text: "The floor's going. Run. RUN!",
        focus: [730, 450],
        zoom: 1.6,
        cues: [{ a: "dov", to: [260, 300] }, { a: "hunter", pose: "down" }],
        shake: 14,
        sound: "blast",
      },
      {
        dur: 5,
        speaker: "",
        text: "The others ran. You did not get out.",
        focus: [700, 465],
        zoom: 2.2,
        cues: [
          { a: "s1", to: [740, 440] },
          { a: "s2", to: [745, 500] },
          { a: "s3", to: [760, 470] },
        ],
      },
      {
        dur: 6,
        speaker: LEDGER,
        text: "Candidate confirmed. Your name has been entered in the Ledger.",
        focus: [700, 465],
        zoom: 2.2,
        cues: [{ a: "s1", out: true }, { a: "s2", out: true }, { a: "s3", out: true }],
        flash: true,
        sound: "chime",
      },
      {
        dur: 6,
        speaker: LEDGER,
        text: "Grow, or be struck from it.",
        focus: [700, 465],
        zoom: 1.8,
        cues: [{ a: "hunter", pose: "idle", face: [700, 900] }],
      },
    ],
  },

  m6: {
    id: "m6",
    title: "Echo Caller",
    chapter: 3,
    beats: [
      {
        dur: 6,
        speaker: "",
        text: "The last of them falls. This time you do not walk away.",
        focus: [740, 450],
        zoom: 1.7,
        cues: [
          { a: "hunter", kind: "player", at: [660, 460], face: [800, 440] },
          { a: "fallen", kind: "knight", at: [800, 440], face: [660, 460], pose: "down" },
        ],
      },
      {
        dur: 6,
        speaker: "",
        text: "You hold out a hand, and something that was dying stops.",
        focus: [740, 450],
        zoom: 2.1,
        cues: [{ a: "hunter", pose: "cast" }, { a: "fallen", out: true }],
        sound: "surge",
      },
      {
        dur: 6,
        speaker: LEDGER,
        text: "Class granted: ECHO CALLER.",
        focus: [740, 450],
        zoom: 1.9,
        cues: [{ a: "shade", kind: "knight", at: [800, 440], face: [660, 460], ghost: true, rise: true }],
        flash: true,
        sound: "summon",
      },
      {
        dur: 7,
        speaker: LEDGER,
        text: "Where an enemy falls, a remnant lingers. Stand near it and press G. What you bind will fight for you. Press H to send it away, or call it back.",
        focus: [730, 450],
        zoom: 1.5,
        cues: [
          { a: "hunter", pose: "idle" },
          { a: "shade", to: [720, 500] },
          { a: "shade2", kind: "swarmer", at: [610, 400], ghost: true, rise: true },
          { a: "shade3", kind: "shooter", at: [600, 520], ghost: true, rise: true },
        ],
        sound: "summon",
      },
      {
        dur: 7,
        speaker: DOV,
        text: "There's something standing behind you. No, don't tell me. I don't want to know.",
        focus: [760, 450],
        zoom: 1.5,
        cues: [{ a: "dov", kind: "dov", at: [1150, 440], to: [900, 450] }, { a: "hunter", face: [900, 450] }],
      },
    ],
  },

  m7: {
    id: "m7",
    title: "The Other Candidate",
    chapter: 4,
    beats: [
      {
        dur: 6,
        speaker: LEDGER,
        text: "Rank B gate closed. You are no longer the only name on this page that matters.",
        focus: [640, 450],
        zoom: 1.5,
        cues: [
          { a: "hunter", kind: "player", at: [560, 450], face: [1000, 450] },
          { a: "e1", kind: "knight", at: [500, 390], face: [1000, 450], ghost: true },
          { a: "e2", kind: "brute", at: [490, 510], face: [1000, 450], ghost: true },
        ],
      },
      {
        dur: 7,
        speaker: MARA,
        text: "Someone asked for your file today. Not Association. He knew what an echo was before I did.",
        focus: [760, 450],
        zoom: 1.3,
        cues: [
          { a: "voss", kind: "rival", at: [1250, 450], to: [900, 450] },
          { a: "v1", kind: "assassin", at: [1300, 380], to: [960, 390], ghost: true },
          { a: "v2", kind: "duellist", at: [1300, 520], to: [960, 510], ghost: true },
        ],
        sound: "door",
      },
      {
        dur: 7,
        speaker: VOSS,
        text: "Halden Voss. Entered four years before you. I wondered when it would write a second name.",
        focus: [800, 450],
        zoom: 1.9,
      },
      {
        dur: 7,
        speaker: VOSS,
        text: "It is not rewarding us. It is weighing us. There is one seat at the end of this, and whoever does not take it is struck out.",
        focus: [860, 450],
        zoom: 2.2,
      },
      {
        dur: 6,
        speaker: VOSS,
        text: "Grow quickly. I would rather lose to someone than win by default.",
        focus: [800, 450],
        zoom: 1.5,
        cues: [{ a: "voss", to: [1300, 450] }, { a: "v1", out: true }, { a: "v2", out: true }],
        sound: "door",
      },
    ],
  },

  m8: {
    id: "m8",
    title: "The Measure of the City",
    chapter: 5,
    beats: [
      {
        dur: 7,
        speaker: MARA,
        text: "I mapped where every gate has opened for ten years. They are not scattered. Look.",
        focus: C,
        zoom: 1.6,
        cues: [
          { a: "hunter", kind: "player", at: [640, 470], face: [760, 450] },
          { a: "mara", kind: "mara", at: [760, 450], face: [640, 470] },
        ],
      },
      {
        dur: 7,
        speaker: MARA,
        text: "It is a grid. Every crossing but one has had its gate. The last crossing is the Association's own vault.",
        focus: C,
        zoom: 1.2,
        cues: [
          { a: "t1", kind: "totem", at: [400, 250], rise: true },
          { a: "t2", kind: "totem", at: [1000, 250], rise: true },
          { a: "t3", kind: "totem", at: [400, 650], rise: true },
          { a: "t4", kind: "totem", at: [1000, 650], rise: true },
        ],
        sound: "phase",
      },
      {
        dur: 7,
        speaker: LEDGER,
        text: "The city is the page. The gates are the ruling. One line remains to be drawn.",
        focus: C,
        zoom: 1.2,
        flash: true,
        sound: "chime",
      },
      {
        dur: 7,
        speaker: LEDGER,
        text: "A Rank S gate will open. It is not a test of you. You are the test.",
        focus: [690, 460],
        zoom: 2,
        cues: [{ a: "hunter", face: [700, 900] }],
      },
      {
        dur: 6,
        speaker: MARA,
        text: "Whatever keeps that book had a name once. I found it in the oldest file we hold. It was a hunter's.",
        focus: C,
        zoom: 1.7,
        cues: [{ a: "t1", out: true }, { a: "t2", out: true }, { a: "t3", out: true }, { a: "t4", out: true }],
      },
    ],
  },

  m9: {
    id: "m9",
    title: "The Hollow Monarch",
    chapter: 6,
    beats: [
      {
        dur: 6,
        speaker: "",
        text: "The Hollow Monarch comes apart like ash in a draught.",
        focus: [740, 450],
        zoom: 1.6,
        cues: [
          { a: "hunter", kind: "player", at: [620, 460], face: [820, 440] },
          { a: "monarch", kind: "monarch", at: [820, 440], face: [620, 460], pose: "slump" },
        ],
        shake: 10,
        sound: "bosskill",
      },
      {
        dur: 7,
        speaker: "",
        text: "Under the crown there is no face. Only a hunter's licence, forty years out of date, and a name the Ledger has long since stopped using.",
        focus: [800, 445],
        zoom: 2.3,
        cues: [{ a: "monarch", out: true }],
      },
      {
        dur: 7,
        speaker: LEDGER,
        text: "Measurement complete. The seat is empty. One page remains.",
        focus: [740, 450],
        zoom: 1.5,
        cues: [{ a: "page", kind: "totem", at: [820, 440], rise: true }],
        flash: true,
        sound: "chime",
      },
      {
        dur: 7,
        speaker: VOSS,
        text: "So it was you. Good. Then sign it. Somebody has to keep the gates, or they open everywhere at once.",
        focus: [800, 450],
        zoom: 1.5,
        cues: [{ a: "voss", kind: "rival", at: [1250, 470], to: [960, 470], pose: "slump" }],
      },
      {
        dur: 7,
        speaker: MARA,
        text: "Or burn it. It kept the last keeper for forty years and left nothing of him. You do not owe it your name.",
        focus: [740, 450],
        zoom: 1.4,
        cues: [{ a: "mara", kind: "mara", at: [240, 470], to: [520, 480] }],
      },
      {
        dur: 5,
        speaker: LEDGER,
        text: "Sign, or burn. Choose on the Story tab.",
        focus: [800, 445],
        zoom: 2,
        cues: [{ a: "hunter", face: [820, 440] }],
      },
    ],
  },

  end_keeper: {
    id: "end_keeper",
    title: "Ending: The Keeper",
    chapter: 6,
    beats: [
      {
        dur: 6,
        speaker: "",
        text: "You sign. The ink is cold, and it does not dry.",
        focus: [760, 445],
        zoom: 2,
        cues: [
          { a: "hunter", kind: "player", at: [740, 450], face: [820, 440], pose: "cast" },
          { a: "page", kind: "totem", at: [820, 440] },
        ],
        sound: "surge",
      },
      {
        dur: 7,
        speaker: LEDGER,
        text: "Keeper confirmed. The grid is yours to rule.",
        focus: C,
        zoom: 1.1,
        cues: [
          { a: "hunter", pose: "idle", face: [700, 900] },
          { a: "k1", kind: "knight", at: [560, 330], ghost: true, rise: true },
          { a: "k2", kind: "brute", at: [840, 330], ghost: true, rise: true },
          { a: "k3", kind: "assassin", at: [500, 470], ghost: true, rise: true },
          { a: "k4", kind: "duellist", at: [940, 470], ghost: true, rise: true },
          { a: "k5", kind: "warder", at: [600, 590], ghost: true, rise: true },
          { a: "k6", kind: "pyro", at: [860, 590], ghost: true, rise: true },
        ],
        flash: true,
        sound: "summon",
      },
      {
        dur: 7,
        speaker: VOSS,
        text: "Then I am struck out. Strange. I thought it would hurt. Keep them shut better than he did.",
        focus: [860, 480],
        zoom: 1.6,
        cues: [{ a: "voss", kind: "rival", at: [1000, 520], face: [740, 450] }],
      },
      {
        dur: 7,
        speaker: MARA,
        text: "The gates still open. But now they open where you say, and no wider. I will keep your file. Someone should remember the name.",
        focus: [640, 480],
        zoom: 1.6,
        cues: [{ a: "mara", kind: "mara", at: [470, 560], face: [740, 450] }, { a: "voss", out: true }],
      },
      {
        dur: 6,
        speaker: LEDGER,
        text: "The daily order continues. Keeper.",
        focus: [740, 450],
        zoom: 2.2,
        sound: "chime",
      },
    ],
  },

  end_unwritten: {
    id: "end_unwritten",
    title: "Ending: The Unwritten",
    chapter: 6,
    beats: [
      {
        dur: 6,
        speaker: "",
        text: "You do not sign. You put your hand flat on the page, and you call it the way you would call the dead.",
        focus: [760, 445],
        zoom: 2,
        cues: [
          { a: "hunter", kind: "player", at: [740, 450], face: [820, 440], pose: "cast" },
          { a: "page", kind: "totem", at: [820, 440] },
        ],
        sound: "surge",
      },
      {
        dur: 6,
        speaker: LEDGER,
        text: "Error. A page cannot be bound. A page cannot be",
        focus: [800, 445],
        zoom: 2.4,
        shake: 16,
        sound: "alarm",
      },
      {
        dur: 6,
        speaker: "",
        text: "It burns blue, then white, then it is only paper.",
        focus: [800, 445],
        zoom: 1.8,
        cues: [{ a: "page", out: true }, { a: "hunter", pose: "idle" }],
        flash: true,
        sound: "blast",
      },
      {
        dur: 7,
        speaker: VOSS,
        text: "No seat. No measure. Then what are we? ...Hunters, I suppose. I had forgotten that was a thing one could simply be.",
        focus: [860, 480],
        zoom: 1.6,
        cues: [{ a: "voss", kind: "rival", at: [1000, 520], face: [740, 450] }],
      },
      {
        dur: 7,
        speaker: MARA,
        text: "The gates are still there. Nothing rules them now, so we shall have to. No more daily orders, at least. I rather liked the paperwork.",
        focus: [640, 480],
        zoom: 1.6,
        cues: [{ a: "mara", kind: "mara", at: [470, 560], face: [740, 450] }],
      },
      {
        dur: 6,
        speaker: "",
        text: "Behind you, the echoes are still standing. Nobody told them to stay.",
        focus: [700, 450],
        zoom: 1.2,
        cues: [
          { a: "u1", kind: "knight", at: [600, 360], face: [740, 450], ghost: true, rise: true },
          { a: "u2", kind: "swarmer", at: [560, 470], face: [740, 450], ghost: true, rise: true },
          { a: "u3", kind: "brute", at: [620, 570], face: [740, 450], ghost: true, rise: true },
        ],
        sound: "summon",
      },
    ],
  },
};

/** Scenes of special gates and the margin, apart from the story chapters. */
export const SPECIAL_SCENES = ["sealed", "gatebreak", "emergency", "hidden", "tower", "clock", "rush", "margin", "margin_end"];

const H = "hunter";
const SYS = "SYSTEM";

Object.assign(CUTSCENES, {
  sealed: {
    id: "sealed",
    title: "The Sealed Gate",
    chapter: 6,
    beats: [
      {
        dur: 3.5,
        speaker: "",
        text: "The gate shuts behind you with a sound like a book closing.",
        focus: [700, 450],
        zoom: 1.6,
        zoomTo: 1.9,
        cues: [{ a: H, kind: "player", at: [700, 470], face: [700, 200] }],
        fx: [{ kind: "ring", at: [700, 470], radius: 260, color: "#ff3355", dur: 1.2 }],
        sound: "door",
        shake: 10,
      },
      {
        dur: 4,
        speaker: SYS,
        text: "SEALED. No stone will answer here. Its master is already awake.",
        focus: [700, 300],
        zoom: 1.2,
        pan: [700, 420],
        cues: [{ a: "m", kind: "brute", at: [700, 200], face: [700, 470], pose: "guard" }],
        fx: [{ kind: "sigil", at: [700, 200], radius: 70, color: "#ff3355", dur: 2 }],
        sound: "alarm",
      },
      {
        dur: 3,
        speaker: "",
        text: "Double reward. And no way out but through.",
        focus: [700, 450],
        zoom: 1.3,
        cues: [{ a: H, pose: "guard" }],
        flash: true,
      },
    ],
  },
  gatebreak: {
    id: "gatebreak",
    title: "Gate Break",
    chapter: 6,
    beats: [
      {
        dur: 4,
        speaker: SYS,
        text: "A gate left too long has broken open in the street. They are pouring out.",
        focus: [700, 450],
        zoom: 1.1,
        pan: [900, 430],
        cues: [
          { a: H, kind: "player", at: [560, 450], face: [1100, 450] },
          { a: "a", kind: "swarmer", at: [1150, 360], to: [880, 400] },
          { a: "b", kind: "swarmer", at: [1180, 520], to: [900, 500] },
          { a: "c", kind: "charger", at: [1220, 450], to: [960, 450] },
        ],
        fx: [{ kind: "column", at: [1150, 450], radius: 90, color: "#ff8a3c", dur: 2.5 }],
        sound: "alarm",
        shake: 8,
      },
      {
        dur: 3.5,
        speaker: "",
        text: "Hold the line until it closes. Nothing gets past you.",
        focus: [600, 450],
        zoom: 1.5,
        cues: [{ a: H, pose: "attack" }],
        fx: [{ kind: "ring", at: [560, 450], radius: 120, color: "#5ee6ff", dur: 0.8 }],
      },
    ],
  },
  emergency: {
    id: "emergency",
    title: "Emergency Quest",
    chapter: 6,
    beats: [
      {
        dur: 3.2,
        speaker: SYS,
        text: "EMERGENCY QUEST. Kill every enemy in this room before the clock runs out.",
        focus: [700, 450],
        zoom: 1.4,
        zoomTo: 1.7,
        cues: [{ a: H, kind: "player", at: [700, 450], face: [900, 450] }],
        fx: [{ kind: "sigil", at: [700, 450], radius: 60, color: "#ffd84a", dur: 2.5 }],
        sound: "alarm",
      },
      {
        dur: 2.8,
        speaker: SYS,
        text: "Failure will be punished.",
        focus: [700, 450],
        zoom: 1.7,
        flash: true,
        shake: 6,
      },
    ],
  },
  hidden: {
    id: "hidden",
    title: "A Hidden Door",
    chapter: 6,
    beats: [
      {
        dur: 3.6,
        speaker: "",
        text: "Where the master fell, the wall is no longer a wall.",
        focus: [700, 300],
        zoom: 1.3,
        pan: [700, 200],
        cues: [{ a: H, kind: "player", at: [700, 460], face: [700, 150] }],
        fx: [{ kind: "column", at: [700, 160], radius: 80, color: "#ffd84a", dur: 3 }],
        sound: "chime",
      },
      {
        dur: 3.4,
        speaker: SYS,
        text: "A trial waits behind it. Enter, or leave with what you have.",
        focus: [700, 300],
        zoom: 1.5,
        cues: [{ a: H, to: [700, 380] }],
      },
    ],
  },
  tower: {
    id: "tower",
    title: "The Tower",
    chapter: 6,
    beats: [
      {
        dur: 4,
        speaker: "",
        text: "A stair that goes up and does not come down. Every floor remembers who fell on it.",
        focus: [700, 450],
        zoom: 1,
        zoomTo: 1.4,
        cues: [{ a: H, kind: "player", at: [700, 520], face: [700, 300] }],
        fx: [{ kind: "spiral", at: [700, 450], radius: 260, color: "#5ee6ff", dur: 3.5 }],
        sound: "door",
      },
      {
        dur: 3,
        speaker: SYS,
        text: "Climb until you fall. Every fifth floor, a master.",
        focus: [700, 450],
        zoom: 1.4,
      },
    ],
  },
  clock: {
    id: "clock",
    title: "Against the Clock",
    chapter: 6,
    beats: [
      {
        dur: 3.5,
        speaker: SYS,
        text: "TIME TRIAL. Ninety seconds. Every floor you clear buys a little more.",
        focus: [700, 450],
        zoom: 1.5,
        cues: [{ a: H, kind: "player", at: [700, 450], face: [900, 450] }],
        fx: [{ kind: "ring", at: [700, 450], radius: 200, color: "#ffd84a", dur: 3 }],
        sound: "tick",
      },
      {
        dur: 2.5,
        speaker: "",
        text: "Run.",
        focus: [700, 450],
        zoom: 1.8,
        flash: true,
      },
    ],
  },
  rush: {
    id: "rush",
    title: "Boss Rush",
    chapter: 6,
    beats: [
      {
        dur: 4.5,
        speaker: SYS,
        text: "Every master you have struck down, written back in. One after another.",
        focus: [700, 350],
        zoom: 1,
        pan: [700, 300],
        cues: [
          { a: H, kind: "player", at: [700, 560], face: [700, 250] },
          { a: "w", kind: "warden", at: [420, 260], ghost: true, rise: true },
          { a: "q", kind: "queen", at: [700, 220], ghost: true, rise: true },
          { a: "m", kind: "monarch", at: [980, 260], ghost: true, rise: true },
        ],
        sound: "summon",
        shake: 6,
      },
      {
        dur: 3,
        speaker: "",
        text: "Then two at once. Then three.",
        focus: [700, 400],
        zoom: 1.3,
        cues: [{ a: "w", out: true }, { a: "q", out: true }, { a: "m", out: true }, { a: H, pose: "guard" }],
        flash: true,
      },
    ],
  },
  margin: {
    id: "margin",
    title: "The Margin",
    chapter: 6,
    beats: [
      {
        dur: 4.5,
        speaker: "",
        text: "The four stones go dark at once. The floor turns white, like a page nobody has written on.",
        focus: [700, 450],
        zoom: 1,
        zoomTo: 1.3,
        cues: [{ a: H, kind: "player", at: [700, 560], face: [700, 220] }],
        fx: [{ kind: "ink", at: [700, 450], radius: 900, color: "#e8e8f0", dur: 2 }],
        sound: "chime",
        flash: true,
      },
      {
        dur: 5,
        speaker: "???",
        text: "\"Every name in the Ledger was written by a hand. I am the hand that crosses them out.\"",
        focus: [700, 260],
        zoom: 1.5,
        pan: [700, 300],
        cues: [{ a: "r", kind: "redactor", at: [700, 220], face: [700, 560], rise: true }],
        fx: [{ kind: "slash", at: [520, 200], to: [880, 240], radius: 20, color: "#101018", dur: 1.5 }],
        sound: "phase",
        shake: 10,
      },
      {
        dur: 5,
        speaker: "The Redactor",
        text: "\"You found my lines. Good. A correction should know it is being made.\"",
        focus: [700, 380],
        zoom: 1.3,
        cues: [{ a: "r", pose: "cast" }],
        fx: [{ kind: "sigil", at: [700, 560], radius: 60, color: "#e8e8f0", dur: 3 }],
      },
      {
        dur: 3.5,
        speaker: SYS,
        text: "Stand in the circles when the page is erased. Cross the line before it crosses you.",
        focus: [700, 450],
        zoom: 1.1,
        cues: [{ a: "r", out: true }, { a: H, pose: "guard" }],
        flash: true,
      },
    ],
  },
  margin_end: {
    id: "margin_end",
    title: "Unstruck",
    chapter: 6,
    beats: [
      {
        dur: 5,
        speaker: "The Redactor",
        text: "\"So. A line I cannot strike.\"",
        focus: [700, 350],
        zoom: 1.6,
        cues: [
          { a: "r", kind: "redactor", at: [700, 330], face: [700, 520], pose: "slump" },
          { a: H, kind: "player", at: [700, 520], face: [700, 330] },
        ],
        fx: [{ kind: "ink", at: [700, 330], radius: 200, color: "#101018", dur: 3 }],
        sound: "bosskill",
      },
      {
        dur: 5,
        speaker: "",
        text: "It comes apart into words, and the words into nothing. Something is left on the white floor: a quill with no ink in it.",
        focus: [700, 400],
        zoom: 1.3,
        pan: [700, 450],
        cues: [{ a: "r", out: true }],
        fx: [{ kind: "column", at: [700, 330], radius: 60, color: "#e8e8f0", dur: 3.5 }],
        flash: true,
      },
      {
        dur: 4,
        speaker: SYS,
        text: "Title earned: THE UNSTRUCK. The margin stays open to you, on the Trials tab.",
        focus: [700, 450],
        zoom: 1.2,
        sound: "quest",
      },
    ],
  },
} satisfies Record<string, Cutscene>);

/** How long a scene runs if nothing is pressed. */
export function sceneLength(id: string): number {
  return CUTSCENES[id].beats.reduce((sum, b) => sum + b.dur, 0);
}

/** Scenes the player has reached, in order, for replaying from the Story tab. */
export function seenScenes(profile: Profile): string[] {
  const done = new Set(MAIN.slice(0, profile.quests.main).map((q) => q.id));
  return Object.keys(CUTSCENES).filter((id) => {
    if (id === "intro") return profile.introSeen;
    // An ending once reached leaves its title behind, whatever has been begun again since.
    if (id === "end_keeper") return profile.ending === "keeper" || profile.titles.includes("keeper");
    if (id === "end_unwritten") return profile.ending === "unwritten" || profile.titles.includes("unwritten");
    // A special gate's scene, once it has played.
    if (SPECIAL_SCENES.includes(id)) return profile.scenesSeen.includes(id) || (id === "margin_end" && profile.titles.includes("unstruck"));
    return done.has(id) || profile.cycle > 0;
  });
}

function applyBeat(w: World, beat: Beat): void {
  const cs = w.cutscene!;
  for (const cue of beat.cues ?? []) {
    let actor = cs.actors.find((x) => x.id === cue.a);
    if (!actor) {
      // A cue for someone not yet on stage must introduce them.
      if (!cue.kind || !cue.at) continue;
      actor = { id: cue.a, kind: cue.kind, x: cue.at[0], y: cue.at[1], radius: 14, facing: 0, pose: "idle", ghost: false, tx: cue.at[0], ty: cue.at[1], moving: false, anim: 0, out: false };
      cs.actors.push(actor);
    } else if (cue.at) {
      [actor.x, actor.y] = cue.at;
      [actor.tx, actor.ty] = cue.at;
    }
    if (cue.to) [actor.tx, actor.ty] = cue.to;
    if (cue.face) actor.facing = Math.atan2(cue.face[1] - actor.y, cue.face[0] - actor.x);
    if (cue.pose) actor.pose = cue.pose;
    if (cue.ghost !== undefined) actor.ghost = cue.ghost;
    if (cue.rise) actor.anim = CUT.rise;
    if (cue.out) {
      actor.out = true;
      actor.anim = CUT.sink;
    }
  }
  for (const f of beat.fx ?? []) {
    w.fx.push({ kind: f.kind, x: f.at[0], y: f.at[1], x2: f.to?.[0], y2: f.to?.[1], radius: f.radius, t: f.dur, total: f.dur, color: f.color, angle: f.to ? Math.atan2(f.to[1] - f.at[1], f.to[0] - f.at[0]) : undefined });
  }
  if (beat.sound) sfx(w, beat.sound);
  if (beat.flash) cs.flash = CUT.flash;
  if (beat.shake) w.shake = Math.max(w.shake, beat.shake);
}

/** Begin a scene. Returns false if there is no such scene. */
export function startCutscene(w: World, id: string): boolean {
  const scene = CUTSCENES[id];
  if (!scene) return false;
  w.cutscene = { id, beat: 0, t: 0, hold: 0, flash: 0, actors: [] };
  applyBeat(w, scene.beats[0]);
  return true;
}

function endCutscene(w: World): void {
  const id = w.cutscene!.id;
  w.cutscene = null;
  w.shake = 0;
  if (id === "intro" && !w.profile.introSeen) {
    w.profile.introSeen = true;
    w.dirty = true;
  }
}

/**
 * Advance the scene on screen. Space, Enter or a click moves to the next
 * beat; holding Esc for two seconds leaves the scene altogether.
 */
export function stepCutscene(w: World, input: Controls, dt: number): void {
  const cs = w.cutscene;
  if (!cs) return;
  const scene = CUTSCENES[cs.id];

  // A tap of Esc does nothing here: only a hold skips.
  input.consume("Escape");
  cs.hold = input.held?.("Escape") ? cs.hold + dt : 0;
  if (cs.hold >= SKIP_HOLD) return endCutscene(w);

  cs.t += dt;
  cs.flash = Math.max(0, cs.flash - dt);
  // Effects cued by the scene play out while the game itself stands still.
  for (const f of w.fx) f.t -= dt;
  w.fx = w.fx.filter((f) => f.t > 0);
  for (const a of cs.actors) {
    a.px = a.x;
    a.py = a.y;
    a.anim = Math.max(0, a.anim - dt);
    const dx = a.tx - a.x;
    const dy = a.ty - a.y;
    const gap = Math.hypot(dx, dy);
    a.moving = gap > 1;
    if (!a.moving) continue;
    const stride = Math.min(gap, CUT.walk * dt);
    a.x += (dx / gap) * stride;
    a.y += (dy / gap) * stride;
    a.facing = Math.atan2(dy, dx);
  }
  // Anyone who has finished sinking is off the stage.
  cs.actors = cs.actors.filter((a) => !(a.out && a.anim <= 0));

  const next = input.consume("Space", "Enter", "Mouse0") && cs.t > 0.3;
  if (!next && cs.t < scene.beats[cs.beat].dur) return;
  cs.beat += 1;
  cs.t = 0;
  if (cs.beat >= scene.beats.length) return endCutscene(w);
  sfx(w, "tick");
  applyBeat(w, scene.beats[cs.beat]);
}
