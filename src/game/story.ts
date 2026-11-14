/**
 * Chapters and dialogue scripts. Dialogue is short, skippable, and shown on
 * the gate board. An id ending in `_after` follows the cutscene of that name.
 */

export interface Line {
  speaker: string;
  text: string;
}

const LEDGER = "THE LEDGER";
const MARA = "Mara Quill, Association clerk";
const DOV = "Dov, Rank E hunter";

/** The story's six chapters: which main quests each holds. */
export const CHAPTERS: { title: string; quests: string[] }[] = [
  { title: "Entered in the Ledger", quests: ["m1", "m2"] },
  { title: "The Choir Below", quests: ["m3", "m4"] },
  { title: "What the Mirror Shows", quests: ["m5", "m6"] },
  { title: "The Other Candidate", quests: ["m6a", "m6b", "m7"] },
  { title: "The Measure of the City", quests: ["m7a", "m7b", "m8"] },
  { title: "The Last Page", quests: ["m8a", "m8b", "m9", "m10"] },
];

export const DIALOGUES: Record<string, Line[]> = {
  intro_after: [
    { speaker: MARA, text: "You're alive? The report said... never mind. The gate on Tanner Row is still open, if you want the work." },
  ],
  m6a: [
    { speaker: DOV, text: "Five of them. Walking behind you down Tanner Row like it's a parade. People crossed the street." },
    { speaker: LEDGER, text: "A following is not yet an army. Reach level 20." },
  ],
  m6b: [
    { speaker: MARA, text: "Three guilds sent offers this week. I have filed them under 'declined', as you have not come in to say otherwise." },
    { speaker: LEDGER, text: "A Rank B gate has opened in the tannery cellars. It is full of eggs." },
  ],
  m7a: [
    { speaker: "", text: "The thing you killed kneels. It was a master of a gate an hour ago." },
    { speaker: LEDGER, text: "Noted. The other candidate holds four." },
  ],
  m7b: [
    { speaker: MARA, text: "Voss closed a Rank A gate last night, alone. He left a note at my desk. It says: 'Tell them to hurry.'" },
    { speaker: LEDGER, text: "A Rank A gate stands open. Its commander does not dismount for the unworthy." },
  ],
  m8a: [
    { speaker: DOV, text: "They've emptied the streets round the Association. Nobody's said why. You know why, don't you." },
    { speaker: LEDGER, text: "Every crossing but one. Reach level 42." },
  ],
  m8b: [
    { speaker: MARA, text: "It opened an hour ago, in the vault, exactly where the map said. I have stopped being surprised and started being frightened." },
    { speaker: LEDGER, text: "The Rank S gate is open. Enter when you are ready to be measured." },
  ],
  end_keeper_after: [
    { speaker: LEDGER, text: "Title granted: KEEPER OF THE LEDGER." },
    { speaker: "", text: "The story is told. The gates remain: every rank, every quest and the daily order are still yours to take." },
  ],
  end_unwritten_after: [
    { speaker: "", text: "Title earned: THE UNWRITTEN. Nothing issues daily orders any more, and nothing punishes you for ignoring them." },
    { speaker: "", text: "The story is told. The gates remain: every rank and every quest are still yours to take." },
  ],
  penalty: [
    { speaker: LEDGER, text: "Daily quest: incomplete." },
    { speaker: LEDGER, text: "Penalty issued. Survive." },
  ],
  m1: [
    { speaker: LEDGER, text: "Entry verified. Rewards are issued for progress. Penalties are issued for death." },
    { speaker: DOV, text: "You cleared a room on your own? You? Huh. Don't let it go to your head. The Warden at the end of that gate breaks people." },
  ],
  m2: [
    { speaker: MARA, text: "The Tanner Row gate closed an hour ago. One hunter went in. I have checked the log three times." },
    { speaker: LEDGER, text: "You are still weak. Reach level 6." },
  ],
  m3: [
    { speaker: DOV, text: "Nobody's asking you to carry bags any more. They're asking who trained you. I said I'd no idea." },
    { speaker: MARA, text: "There is a Rank D gate under the old concert hall. Teams keep coming back short. Something in there is calling more of them." },
  ],
  m4: [
    { speaker: MARA, text: "A Rank E hunter closing a D gate alone is not a thing I can file. So I have not filed it." },
    { speaker: LEDGER, text: "A Rank C gate has opened. What waits inside fights the way you do." },
  ],
  m5: [
    { speaker: "", text: "The Mirror Blade falls, and for a moment its shape stays standing where it died, like breath on glass." },
    { speaker: LEDGER, text: "Condition met. You may keep what you defeat." },
    { speaker: LEDGER, text: "New authority pending: ECHOES." },
    { speaker: LEDGER, text: "A rite has been prepared. Enter it from the gate board when you are ready to be remade." },
  ],
  rankB: [{ speaker: MARA, text: "Rank B. There are forty hunters of that rank in Veyra. Thirty-nine of them have a guild." }],
  rankA: [{ speaker: DOV, text: "Rank A. I told the lads I knew you when you carried bags. They think I'm lying." }],
  rankS: [{ speaker: MARA, text: "Rank S. The form has no box for it. I drew one." }],
  rankD: [
    { speaker: MARA, text: "The Association has re-evaluated you. Rank D. I had to requisition a new card; nobody has gone up a rank in this office before." },
    { speaker: MARA, text: "The shop keeps better stock for Rank D hunters. Apparently you are worth the good stuff now." },
  ],
  rankC: [
    { speaker: MARA, text: "Rank C. That is two re-evaluations in one file. The director asked me whether you were a clerical error." },
    { speaker: DOV, text: "Rank C. I've been E for nine years. Buy me a drink and tell me how." },
  ],
  break: [
    { speaker: MARA, text: "Your gate has been open three days with nobody in it. It broke an hour ago. They are in the street." },
    { speaker: LEDGER, text: "Gate break. Hold the line until it closes." },
  ],
};
