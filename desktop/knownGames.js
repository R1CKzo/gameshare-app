// Lista curada exe -> nome bonito (Fase 3 do plano de atalhos/overlay).
// So mostra "Jogando X" pra quem estiver nessa lista -- sem fallback pro
// titulo cru da janela, decisao explicita do dono (evita "Jogando
// chrome.exe" ou vazar o nome de qualquer programa aberto). Comparacao
// pelo nome do executavel, sem diferenciar maiusculas/minusculas.
module.exports = {
  "cs2.exe": "Counter-Strike 2",
  "valorant.exe": "VALORANT",
  "leagueclient.exe": "League of Legends",
  "league of legends.exe": "League of Legends",
  "minecraft.exe": "Minecraft",
  "javaw.exe": "Minecraft",
  "gta5.exe": "GTA V",
  "gta5_enhanced.exe": "GTA V",
  "fortniteclient-win64-shipping.exe": "Fortnite",
  "dota2.exe": "Dota 2",
  "r5apex.exe": "Apex Legends",
  "rainbowsix.exe": "Rainbow Six Siege",
  "overwatch.exe": "Overwatch 2",
  "eldenring.exe": "Elden Ring",
  "rocketleague.exe": "Rocket League",
};
