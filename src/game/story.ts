/** Dialogue scripts. Short, skippable, shown on the gate board. */

export interface Line {
  speaker: string;
  text: string;
}

const LEDGER = "THE LEDGER";
const MARA = "Mara Quill, Association clerk";
const DOV = "Dov, Rank E hunter";

export const DIALOGUES: Record<string, Line[]> = {
  intro: [
    { speaker: "", text: "Ten years ago the gates opened over Veyra. Those who could fight what came out of them were called hunters." },
    { speaker: "", text: "You are Rank E. The lowest. The one the others bring along to carry bags." },
    { speaker: "", text: "Last night a routine gate was not routine. The floor gave way. The others ran. You did not get out." },
    { speaker: "", text: "And then you woke up anyway." },
    { speaker: LEDGER, text: "Candidate confirmed. Your name has been entered in the Ledger." },
    { speaker: LEDGER, text: "Grow, or be struck from it." },
    { speaker: MARA, text: "You're alive? The report said... never mind. The gate on Tanner Row is still open, if you want the work." },
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
  m6: [
    { speaker: "", text: "The last of them falls. This time you do not walk away. You hold out a hand, and something that was dying stops." },
    { speaker: LEDGER, text: "Class granted: ECHO CALLER." },
    { speaker: LEDGER, text: "Where an enemy falls, a remnant lingers. Stand near it and press G. What you bind will fight for you." },
    { speaker: DOV, text: "There's something standing behind you. No, don't tell me. I don't want to know." },
  ],
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
