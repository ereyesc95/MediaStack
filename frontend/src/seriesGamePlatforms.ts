/** Approximate platform launch years for oldest → newest sort. */
export const GAME_PLATFORM_ERA: Record<string, number> = {
  Arcade: 1971,
  "Commodore 64": 1982,
  Amiga: 1985,
  "Nintendo Entertainment System": 1983,
  "Sega Master System": 1985,
  "Game Boy": 1989,
  "Game Boy Color": 1998,
  "Game Boy Advance": 2001,
  "Nintendo DS": 2004,
  "Nintendo 3DS": 2011,
  "Sega Genesis": 1988,
  "Sega CD": 1991,
  "Sega 32X": 1994,
  "Sega Saturn": 1994,
  "Sega Dreamcast": 1998,
  "Nintendo 64": 1996,
  "Nintendo GameCube": 2001,
  "Nintendo Wii": 2006,
  "Nintendo Wii U": 2012,
  "Nintendo Switch": 2017,
  PlayStation: 1994,
  "PlayStation 2": 2000,
  "PlayStation 3": 2006,
  "PlayStation 4": 2013,
  "PlayStation 5": 2020,
  "PlayStation Portable": 2004,
  "PlayStation Vita": 2011,
  Xbox: 2001,
  "Xbox 360": 2005,
  "Xbox One": 2013,
  "Xbox Series": 2020,
  Flash: 1996,
  Browser: 1995,
  PC: 1981,
  Mac: 1984,
};

/** Sort platform names oldest → newest; unknown platforms last, then A–Z. */
export function sortGamePlatforms(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ea = GAME_PLATFORM_ERA[a] ?? 9999;
    const eb = GAME_PLATFORM_ERA[b] ?? 9999;
    if (ea !== eb) return ea - eb;
    return a.localeCompare(b);
  });
}
