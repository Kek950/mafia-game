# Version History & Restoration Instructions

This guide describes how to identify or restore the project to the state "Just After the First Test" (when the automated logic was implemented but the UI was still being refined).

## 🕒 Version 1: Initial Automated Overhaul (The First Test Version)
This was the version where the logic for automated transitions was first added, but it lacked the refined UI and backend stability.

### Key Characteristics:
- **No 'Vote' Button**: Voting was done by clicking the entire player card (no visual indicator was present).
- **No Vote Count**: The `.vote-count` CSS class was missing, so you couldn't see how many votes a player had.
- **Moderator-Free**: The Gm controls were removed, but the game relied purely on the "Night Phase" labels.
- **Backend**: The logic for Runoffs and Transitions existed, but the server needed a manual restart to activate it.

---

## 🛠️ Version 2: Post-Test Refinement (The Current Version)
I moved to this version immediately after detecting the "Non-Responsive" issue during the first browser test.

### Changes made to get from V1 to V2:
1. **Frontend (`Room.jsx`)**: 
   - Added explicit `<button>` elements inside player cards for clear interaction.
   - Added `console.log` markers for tracking clicks in the browser console.
2. **Styling (`index.css`)**: 
   - Added the `.vote-count` class to show the blue vote tally badges.
3. **Backend (`index.js`)**: 
   - Added detailed `console.log` for vote rejection reasons (e.g., "Rejecting night vote: room stage is X").
4. **Environment**: 
   - Hard-killed all ghost `node` processes to fix Port 3001 conflicts.

---

## 🔄 How to "Revert" (If needed)
If you specifically want to remove the explicit buttons and return to the "Minimalist" V1 look:
1. **In `Room.jsx`**: Remove the `button` tag inside the player-card mapping and revert the `onClick` to be directly on the `div`.
2. **In `index.css`**: Delete the `.vote-count` block.
3. **Behavior**: The game will still function (auto-transitions, runoff), but you will have to click the player's name/card area and will not see the vote totals.

> [!TIP]
> It is highly recommended to stay on the **Current Version** as it provides much better feedback during the 15-second discussion and voting phases.
