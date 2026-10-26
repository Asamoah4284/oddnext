export interface ParsedPickItem {
  id: string;
  homeTeam: string;
  awayTeam: string;
  prediction: string;
  odds: number;
  league?: string;
  kickoffAt?: string;
}

export interface ParseBetslipResult {
  bookingCode: string;
  totalOdds: number | null;
  items: ParsedPickItem[];
  rawText: string;
}

/**
 * Robust betslip text parser.
 * Handles:
 * - Single-line format (SportyBet/Bet9ja WhatsApp share):
 *   "Over 1.5 - 1.15 Union Gilloise vs Hapoel Be'er Sheva FC - Over/Under"
 *   "2-5+ - 1.12 Al Gharafa SC vs Al Ahli Doha SC - Goal Bounds"
 *   "Draw or Away - 1.24 Sardarapat FC vs FC Urartu Yerevan - Double Chance"
 * - 2-line format (WhatsApp lists with bold/numbering):
 *   "Union Gilloise vs Hapoel Be'er Sheva FC - Over/Under \n 2. *Over 1.5* - 1.14"
 * - Single-line match first format:
 *   "Team A vs Team B - Over 1.5 - 1.25"
 *   "Team A vs Team B : Over 1.5 @ 1.25"
 *   "Team A vs Team B | Over 1.5 | 1.25"
 * - SportyBet / Betway block format:
 *   "Team A vs Team B \n Selection: Draw or Away (Double Chance) \n Odd: 1.32"
 * - 3-line format without labels:
 *   "Team A vs Team B \n Over 1.5 \n 1.35"
 */
export function parseBetslip(text: string): ParseBetslipResult {
  const result: ParseBetslipResult = {
    bookingCode: "",
    totalOdds: null,
    items: [],
    rawText: text,
  };

  if (!text || !text.trim()) return result;

  // 1. Extract booking code
  const codeMatch = text.match(
    /(?:booking\s*code|booking\s*id|slip\s*code|booking)\s*[:=\-]?\s*([A-Za-z0-9\-_]+)/i
  );
  if (codeMatch && codeMatch[1]) {
    const val = codeMatch[1].trim();
    if (!/^(odds?|selections?|total|max|bonus|date|time)$/i.test(val)) {
      result.bookingCode = val;
    }
  }

  // Extract total odds from header or text
  const totalOddsMatch =
    text.match(/(?:total\s+odds|combined\s+odds|total)\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)/i) ||
    text.match(/(?:booking\s*code|slip)[^\n]*\bodds?\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (totalOddsMatch && totalOddsMatch[1]) {
    const parsed = parseFloat(totalOddsMatch[1]);
    if (!isNaN(parsed)) {
      result.totalOdds = parsed;
    }
  }

  // 2. Normalize lines
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Filter out pure header/metadata lines
  const lines = rawLines.filter((l) => {
    if (/^selections?:?$/i.test(l)) return false;
    if (/^booking\s*code\s*[:=\-]/i.test(l)) return false;
    if (/^max\s*bonus/i.test(l)) return false;
    if (/^betslip\s*(details|summary)?:?$/i.test(l)) return false;
    return true;
  });

  let currentItem: Partial<ParsedPickItem> | null = null;
  let currentMarket = "";
  let idCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check single-line formats FIRST (e.g. "Over 1.5 - 1.15 Team A vs Team B - Over/Under")
    const single = tryParseSingleLine(line);
    if (single) {
      if (currentItem && currentItem.homeTeam && currentItem.prediction) {
        result.items.push(finishItem(currentItem, idCounter++));
        currentItem = null;
        currentMarket = "";
      }
      result.items.push(finishItem(single, idCounter++));
      continue;
    }

    // Check if line is "Selection: ..." or "Pick: ..." or "Tip: ..."
    const selMatch = line.match(/^(?:selection|pick|prediction|tip)\s*[:\-]\s*(.+)$/i);
    if (selMatch) {
      const cleanedPick = selMatch[1].replace(/[*_~]/g, "").trim();
      if (currentItem) {
        currentItem.prediction = cleanedPick;
      } else if (i > 0 && isMatchTeams(lines[i - 1])) {
        const { home, away, market } = splitTeams(lines[i - 1]);
        let pred = cleanedPick;
        if (market && !pred.toLowerCase().includes(market.toLowerCase())) {
          pred = `${pred} (${market})`;
        }
        currentItem = {
          homeTeam: home,
          awayTeam: away,
          prediction: pred,
          odds: 1.5,
        };
      }
      continue;
    }

    // Check if line is 2-line WhatsApp format: "Pick - Odds" or "*Pick* - Odds" (e.g. "2. *Over 1.5* - 1.14")
    const cleanedLine = cleanLinePrefix(line);
    const pickOddMatch = cleanedLine.match(/^[*_~]?(.+?)[*_~]?\s*[-@]\s*([0-9]+(?:\.[0-9]+)?)$/);
    if (pickOddMatch && currentItem && !currentItem.prediction) {
      const rawPick = pickOddMatch[1].replace(/[*_~]/g, "").trim();
      const oddsVal = parseFloat(pickOddMatch[2]);
      let pred = rawPick;
      if (currentMarket && !pred.toLowerCase().includes(currentMarket.toLowerCase())) {
        pred = `${pred} (${currentMarket})`;
      }
      currentItem.prediction = pred;
      currentItem.odds = isNaN(oddsVal) ? 1.5 : oddsVal;
      result.items.push(finishItem(currentItem, idCounter++));
      currentItem = null;
      currentMarket = "";
      continue;
    }

    // Check if line is "Odd: 1.32" or "Odds: 1.32" or "@ 1.32"
    const oddMatch = line.match(/^(?:odd|odds|@)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)$/i);
    if (oddMatch) {
      const val = parseFloat(oddMatch[1]);
      if (currentItem) {
        currentItem.odds = isNaN(val) ? 1.5 : val;
        if (currentItem.homeTeam && currentItem.awayTeam) {
          result.items.push(finishItem(currentItem, idCounter++));
          currentItem = null;
          currentMarket = "";
        }
      }
      continue;
    }

    // Check if line is a pure decimal number (standalone odds e.g. "1.32")
    const standaloneNumberMatch = line.match(/^([0-9]+(?:\.[0-9]+)?)$/);
    if (standaloneNumberMatch && currentItem && currentItem.prediction) {
      const val = parseFloat(standaloneNumberMatch[1]);
      currentItem.odds = isNaN(val) ? 1.5 : val;
      result.items.push(finishItem(currentItem, idCounter++));
      currentItem = null;
      currentMarket = "";
      continue;
    }

    // Check if line is a team matchup like "AL Anwar vs Al-Wehda FC"
    if (isMatchTeams(line)) {
      if (currentItem && currentItem.homeTeam && currentItem.prediction) {
        result.items.push(finishItem(currentItem, idCounter++));
      }
      const { home, away, market } = splitTeams(line);
      currentItem = {
        homeTeam: home,
        awayTeam: away,
        prediction: "",
        odds: 1.5,
      };
      currentMarket = market || "";
      continue;
    }

    // If currentItem exists but has no prediction yet, and line doesn't match above, it's the prediction
    if (currentItem && !currentItem.prediction && !isMatchTeams(line)) {
      let pred = line.replace(/[*_~]/g, "").trim();
      if (currentMarket && !pred.toLowerCase().includes(currentMarket.toLowerCase())) {
        pred = `${pred} (${currentMarket})`;
      }
      currentItem.prediction = pred;
      continue;
    }
  }

  if (currentItem && currentItem.homeTeam && currentItem.prediction) {
    result.items.push(finishItem(currentItem, idCounter++));
  }

  return result;
}

/**
 * Removes list prefixes like "1. ", "1) ", "1 - " but avoids removing "2-5+"
 */
export function cleanLinePrefix(line: string): string {
  return line.replace(/^\s*\d+(?:\.|\)|\s+[-–—]\s*)\s*/, "").trim();
}

/**
 * Tries parsing a single-line betslip item:
 * 1. Pipe / tab / semicolon separated: "Home vs Away | Pick | Odds"
 * 2. Pick first: "Pick - Odds Home vs Away - Market"
 * 3. Match first: "Home vs Away - Pick - Odds" or "Home vs Away : Pick @ Odds"
 */
export function tryParseSingleLine(rawLine: string): Partial<ParsedPickItem> | null {
  const line = cleanLinePrefix(rawLine);
  if (!line) return null;

  // 1. Pipe / tab / semicolon separated format:
  if (line.includes("|") || line.includes("\t") || line.includes(";")) {
    const parts = line
      .split(/[|\t;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 3) {
      const vsIndex = parts.findIndex((p) => /\s+(?:vs\.?|v\.?)\s+/i.test(p));
      const oddsIndex = parts.findIndex((p) =>
        /^[0-9]+(?:\.[0-9]+)?$/.test(p.replace(/[^0-9.]/g, ""))
      );
      if (vsIndex !== -1 && oddsIndex !== -1 && vsIndex !== oddsIndex) {
        const { home, away } = splitTeams(parts[vsIndex]);
        const oddsVal = parseFloat(parts[oddsIndex].replace(/[^0-9.]/g, "")) || 1.5;
        const predIndex =
          [0, 1, 2].find((i) => i !== vsIndex && i !== oddsIndex) ??
          (vsIndex === 0 ? 1 : 0);
        return {
          homeTeam: home,
          awayTeam: away,
          prediction: parts[predIndex]?.replace(/[*_~]/g, "") || "Over 1.5",
          odds: oddsVal,
        };
      }
    }
  }

  // 2. Format: <Pick> [-|@] <Odd> <Home> vs <Away> [- <Market>]
  // e.g. "Over 1.5 - 1.15 Union Gilloise vs Hapoel Be'er Sheva FC - Over/Under"
  // e.g. "2-5+ - 1.12 Al Gharafa SC vs Al Ahli Doha SC - Goal Bounds"
  // e.g. "Draw or Away - 1.24 Sardarapat FC vs FC Urartu Yerevan - Double Chance"
  const pickOddMatchRegex = /^([*~_]?.+?[*~_]?)\s+[-@]\s+([0-9]+(?:\.[0-9]+)?)\s+(.+)$/i;
  const match1 = line.match(pickOddMatchRegex);
  if (match1) {
    const rawPick = match1[1].replace(/[*_~]/g, "").trim();
    const odds = parseFloat(match1[2]);
    const rest = match1[3].trim();

    const vsMatch = rest.match(/^(.*?)\s+(?:vs\.?|v\.?)\s+(.+)$/i);
    if (vsMatch) {
      const homeTeam = vsMatch[1].trim();
      const { away, market } = extractMarket(vsMatch[2].trim());

      let prediction = rawPick;
      if (market && !prediction.toLowerCase().includes(market.toLowerCase())) {
        prediction = `${prediction} (${market})`;
      }

      return {
        homeTeam,
        awayTeam: away,
        prediction,
        odds: isNaN(odds) ? 1.5 : odds,
      };
    }
  }

  // 3. Format: <Home> vs <Away> [-|:] <Pick> [-|@] <Odd>
  // e.g. "Arsenal vs Chelsea - Over 1.5 - 1.25"
  // e.g. "Arsenal vs Chelsea : Over 1.5 @ 1.25"
  // e.g. "Arsenal vs Chelsea - Over 1.5 (Double Chance) - 1.25"
  const teamsFirstMatch = line.match(
    /^(.*?)\s+(?:vs\.?|v\.?)\s+(.*?)\s*[-:–—]\s*(.+?)\s*[-@–—(]\s*([0-9]+(?:\.[0-9]+)?)\)?$/i
  );
  if (teamsFirstMatch) {
    const homeTeam = teamsFirstMatch[1].trim();
    const awayTeam = teamsFirstMatch[2].trim();
    const prediction = teamsFirstMatch[3].replace(/[*_~]/g, "").trim();
    const odds = parseFloat(teamsFirstMatch[4]) || 1.5;
    return {
      homeTeam,
      awayTeam,
      prediction,
      odds,
    };
  }

  return null;
}

function extractMarket(awayRaw: string): { away: string; market: string } {
  let away = awayRaw;
  let market = "";
  const marketMatch = away.match(/^(.*?)\s+[-–—]\s+([A-Za-z0-9/+\s().&'-]+)$/);
  if (marketMatch) {
    away = marketMatch[1].trim();
    market = marketMatch[2].trim();
  } else {
    const parenMarket = away.match(/^(.*?)\s+\(([A-Za-z0-9/+\s.&'-]+)\)$/);
    if (parenMarket) {
      away = parenMarket[1].trim();
      market = parenMarket[2].trim();
    }
  }
  return { away, market };
}

function finishItem(item: Partial<ParsedPickItem>, count: number): ParsedPickItem {
  return {
    id: item.id || `pick-${count}-${Date.now()}`,
    homeTeam: (item.homeTeam || "").trim(),
    awayTeam: (item.awayTeam || "").trim(),
    prediction: (item.prediction || "").trim(),
    odds: typeof item.odds === "number" && !isNaN(item.odds) ? item.odds : 1.5,
    league: item.league || "",
    kickoffAt: item.kickoffAt || "",
  };
}

export function isMatchTeams(str: string): boolean {
  if (!str) return false;
  // Ignore header or labels
  if (
    /^(?:booking|selection|odd|odds|max\s*bonus|date|time|league|status|pick|total)/i.test(
      str
    )
  ) {
    return false;
  }
  // Standalone numbers are odds, not teams
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(str.trim())) return false;

  // Must contain vs, vs., or v between words
  if (/\s+(?:vs\.?|v\.?)\s+/i.test(str)) return true;

  // If using "-" between words, ensure it's not odds or bet options
  if (/\s+[-–—]\s+/.test(str)) {
    const parts = str.split(/\s+[-–—]\s+/);
    if (
      parts.length === 2 &&
      !/[0-9]/.test(parts[0]) &&
      !/[0-9]/.test(parts[1]) &&
      !/^(over|under|draw|home|away|gg|ng|yes|no)/i.test(parts[0])
    ) {
      return true;
    }
  }

  return false;
}

export function splitTeams(str: string): { home: string; away: string; market?: string } {
  let home = "";
  let away = "";
  const vsParts = str.split(/\s+(?:vs\.?|v\.?)\s+/i);
  if (vsParts.length >= 2) {
    home = vsParts[0].trim();
    away = vsParts.slice(1).join(" vs ").trim();
  } else {
    const dashParts = str.split(/\s+[-–—]\s+/);
    if (dashParts.length >= 2) {
      home = dashParts[0].trim();
      away = dashParts.slice(1).join(" - ").trim();
    } else {
      home = str.trim();
      away = "";
    }
  }

  const { away: cleanAway, market } = extractMarket(away);
  return { home, away: cleanAway, market };
}

export function calculateCombinedOdds(items: { odds: number }[]): number {
  if (items.length === 0) return 0;
  const product = items.reduce((acc, it) => acc * (it.odds || 1), 1);
  return Math.round(product * 100) / 100;
}
