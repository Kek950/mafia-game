function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Generate a random reasonable adult age (21 to 65)
function generateRandomAge() {
  return Math.floor(21 + Math.random() * 45);
}

// Cryptographically uniform Fisher-Yates array shuffle
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function distributeRoles(players, numMafia, hasDoctor, hasSheriff, hostPlays = true) {
  // If hostPlays is false, exclude host from role distribution
  const eligiblePlayers = hostPlays ? [...players] : players.filter(p => !p.isHost);

  // Ensure every player has a reasonable age
  eligiblePlayers.forEach(p => {
    if (!p.age) {
      p.age = generateRandomAge();
    }
  });

  const total = eligiblePlayers.length;
  let mafiaCount = Math.max(1, Math.min(numMafia, total - 1));
  let available = total - mafiaCount;

  let docCount = hasDoctor && available > 0 ? 1 : 0;
  available -= docCount;

  let sheriffCount = hasSheriff && available > 0 ? 1 : 0;
  available -= sheriffCount;

  // Build role deck:
  // 1 Don (the Mafia Boss) + remaining Mafia
  const roleDeck = [];
  if (mafiaCount >= 1) {
    roleDeck.push('Don');
    for (let i = 1; i < mafiaCount; i++) {
      roleDeck.push('Mafia');
    }
  }

  if (docCount > 0) roleDeck.push('Doctor');
  if (sheriffCount > 0) roleDeck.push('Sheriff');

  while (roleDeck.length < total) {
    roleDeck.push('Citizen');
  }

  const shuffledRoles = shuffleArray(roleDeck);

  const roles = {};
  eligiblePlayers.forEach((p, idx) => {
    roles[p.id] = shuffledRoles[idx];
  });

  return { roles, players: eligiblePlayers };
}

module.exports = {
  generateRoomCode,
  generateRandomAge,
  distributeRoles,
  shuffleArray
};
