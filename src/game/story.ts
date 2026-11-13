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
    { speaker: "", text: "To be continued." },
  ],
};
