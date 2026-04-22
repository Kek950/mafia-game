function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function distributeRoles(players, numMafia, hasDoctor, hasSheriff) {
  const allPlayers = players.filter(p => !p.isHost);

  // Cap the number of special roles to the number of available people
  let availableSpots = allPlayers.length;

  if (numMafia > availableSpots) numMafia = availableSpots;
  availableSpots -= numMafia;

  let docs = hasDoctor && availableSpots > 0 ? 1 : 0;
  availableSpots -= docs;

  let sheriffs = hasSheriff && availableSpots > 0 ? 1 : 0;

  // Create an array of roles exactly matching the number of allPlayers
  const roleArray = [];
  for (let i = 0; i < numMafia; i++) roleArray.push('Mafia');
  for (let i = 0; i < docs; i++) roleArray.push('Doctor');
  for (let i = 0; i < sheriffs; i++) roleArray.push('Sheriff');

  // Fill the rest with Citizens
  while (roleArray.length < allPlayers.length) {
    roleArray.push('Citizen');
  }

  // Shuffle roles and assign
  const shuffledRoles = roleArray.sort(() => 0.5 - Math.random());

  const roles = {};
  allPlayers.forEach((p, index) => {
    roles[p.id] = shuffledRoles[index];
  });

  return roles;
}

module.exports = {
  generateRoomCode,
  distributeRoles
};
