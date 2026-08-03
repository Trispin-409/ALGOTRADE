export interface HeadlineImpact {
  headline: string;
  summary: string;
  source: string;
  url?: string;
  relevantSymbol: string;
  matchedKeywords: string[];
  impactLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  directionalBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  rationale: string;
}

export interface NewsImpactAssessment {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  impactScore: number; // -100 to +100
  sentimentScore: number; // 0 to 100
  parsedHeadlines: HeadlineImpact[];
  macroContextSummary: string;
  highVolatilityRisk: boolean;
  driverBreakdown: Array<{
    name: string;
    role: string;
    impact: string;
    sentiment: string;
  }>;
  alignmentForDirection: (direction: 'BUY' | 'SELL') => {
    isAligned: boolean;
    isOpposed: boolean;
    scoreAdjustment: number;
    reasoning: string;
  };
  correlationRatingBUY?: any;
  correlationRatingSELL?: any;
}

/**
 * Dynamically parses breaking news headlines and macro indicators against an active pair symbol.
 */
export function assessNewsImpact(symbol: string, newsData: any, atr14 = 0, lastPrice = 0): NewsImpactAssessment {
  const cleanSymbol = symbol.replace(/[-._]/g, '').toUpperCase();
  
  let baseCurrency = 'USD';
  let quoteCurrency = 'USD';

  if (cleanSymbol.length >= 6) {
    baseCurrency = cleanSymbol.substring(0, 3);
    quoteCurrency = cleanSymbol.substring(3, 6);
  } else if (cleanSymbol.includes('XAU') || cleanSymbol.includes('GOLD')) {
    baseCurrency = 'XAU';
    quoteCurrency = 'USD';
  } else if (cleanSymbol.includes('BTC') || cleanSymbol.includes('BITCOIN')) {
    baseCurrency = 'BTC';
    quoteCurrency = 'USD';
  }

  const articles = Array.isArray(newsData?.articles) ? newsData.articles : [];
  const rawSentiment = (newsData?.sentiment || 'NEUTRAL').toUpperCase();
  const rawImpactScore = Number(newsData?.impactScore ?? 0);
  const rawSentimentScore = Number(newsData?.sentimentScore ?? 50);
  const driverBreakdown = Array.isArray(newsData?.driverBreakdown) ? newsData.driverBreakdown : [];

  const parsedHeadlines: HeadlineImpact[] = [];
  let detectedHighVolatility = false;

  const keywordMap: Array<{
    category: string;
    keywords: string[];
    weight: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  }> = [
    { category: 'CENTRAL_BANK', keywords: ['fed', 'fomc', 'powell', 'ecb', 'lagarde', 'boe', 'boj', 'interest rate', 'rate cut', 'rate hike', 'hawkish', 'dovish'], weight: 'CRITICAL' },
    { category: 'INFLATION_JOBS', keywords: ['cpi', 'nfp', 'payroll', 'unemployment', 'pce', 'inflation', 'gdp', 'retail sales'], weight: 'HIGH' },
    { category: 'GEOPOLITICAL_SAFE_HAVEN', keywords: ['war', 'conflict', 'tariff', 'sanction', 'treasury yield', 'bond yield', 'safe haven', 'bullion'], weight: 'HIGH' },
    { category: 'CRYPTO_CATALYST', keywords: ['etf', 'sec', 'binance', 'coinbase', 'halving', 'liquidation', 'fed rate'], weight: 'MEDIUM' }
  ];

  for (const art of articles) {
    const text = `${art.headline || ''} ${art.summary || ''}`.toLowerCase();
    const matchedKw: string[] = [];
    let highestWeight: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';

    for (const km of keywordMap) {
      for (const kw of km.keywords) {
        if (text.includes(kw)) {
          matchedKw.push(kw.toUpperCase());
          if (km.weight === 'CRITICAL') highestWeight = 'CRITICAL';
          else if (km.weight === 'HIGH' && highestWeight !== 'CRITICAL') highestWeight = 'HIGH';
          else if (km.weight === 'MEDIUM' && (highestWeight === 'LOW')) highestWeight = 'MEDIUM';
        }
      }
    }

    // Determine headline bias for base/quote pair
    let headlineBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (text.includes('hike') || text.includes('hawkish') || text.includes('surge') || text.includes('gain') || text.includes('rally') || text.includes('soar')) {
      if (text.includes(baseCurrency.toLowerCase()) || (baseCurrency === 'XAU' && (text.includes('inflation') || text.includes('war') || text.includes('geopolitical')))) {
        headlineBias = 'BULLISH';
      } else if (text.includes(quoteCurrency.toLowerCase()) || text.includes('fed') || text.includes('dollar') || text.includes('yield')) {
        headlineBias = 'BEARISH'; // Bullish USD = Bearish EURUSD/XAUUSD
      } else {
        headlineBias = 'BULLISH';
      }
    } else if (text.includes('cut') || text.includes('dovish') || text.includes('plunge') || text.includes('drop') || text.includes('fall') || text.includes('slump')) {
      if (text.includes(baseCurrency.toLowerCase())) {
        headlineBias = 'BEARISH';
      } else if (text.includes(quoteCurrency.toLowerCase()) || text.includes('fed') || text.includes('dollar')) {
        headlineBias = 'BULLISH'; // Dovish USD = Bullish EURUSD/XAUUSD
      } else {
        headlineBias = 'BEARISH';
      }
    }

    if (highestWeight === 'CRITICAL' || highestWeight === 'HIGH') {
      detectedHighVolatility = true;
    }

    const rationale = matchedKw.length > 0
      ? `Key macro drivers detected: ${matchedKw.join(', ')}.`
      : `General news sentiment update for ${cleanSymbol}.`;

    parsedHeadlines.push({
      headline: art.headline || 'Market Update',
      summary: art.summary || 'Real-time macroeconomic news intelligence parsed.',
      source: art.source || 'Grounded Search Engine',
      url: art.url,
      relevantSymbol: cleanSymbol,
      matchedKeywords: matchedKw,
      impactLevel: highestWeight,
      directionalBias: headlineBias,
      rationale
    });
  }

  // Synthesize macro context summary
  const topArticle = parsedHeadlines[0];
  const macroContextSummary = newsData?.explanation || (
    topArticle 
      ? `Breaking news: "${topArticle.headline}". Macro impact level: ${topArticle.impactLevel}. Drivers: ${topArticle.matchedKeywords.join(', ') || 'Global sentiment'}.`
      : `Real-time macroeconomic context for ${cleanSymbol} indicates ${rawSentiment} sentiment bias with a ${rawSentimentScore}/100 confidence rating.`
  );

  const overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 
    rawSentiment === 'BULLISH' || rawSentiment === 'POSITIVE' || rawImpactScore > 15 ? 'BULLISH' :
    (rawSentiment === 'BEARISH' || rawSentiment === 'NEGATIVE' || rawImpactScore < -15 ? 'BEARISH' : 'NEUTRAL');

  const alignmentForDirection = (direction: 'BUY' | 'SELL') => {
    const isAligned = (direction === 'BUY' && overallSentiment === 'BULLISH') || (direction === 'SELL' && overallSentiment === 'BEARISH');
    const isOpposed = (direction === 'BUY' && overallSentiment === 'BEARISH') || (direction === 'SELL' && overallSentiment === 'BULLISH');

    let scoreAdjustment = 0;
    let reasoning = "";

    if (isAligned) {
      scoreAdjustment = Math.round(8 + Math.min(10, Math.abs(rawImpactScore) * 0.15));
      reasoning = `[NEWS CONFLUENCE ALIGNED] ${direction} signal strongly supported by ${overallSentiment} breaking news context and driver fundamentals (+${scoreAdjustment}% boost).`;
    } else if (isOpposed) {
      scoreAdjustment = -Math.round(12 + Math.min(10, Math.abs(rawImpactScore) * 0.15));
      reasoning = `[NEWS HEADWIND WARNING] ${direction} signal opposes current ${overallSentiment} breaking news sentiment (${scoreAdjustment}% penalty).`;
    } else {
      reasoning = `[NEWS NEUTRAL] Neutral macroeconomic headline backdrop; trade reliant on technical and structure confluences.`;
    }

    return {
      isAligned,
      isOpposed,
      scoreAdjustment,
      reasoning
    };
  };

  return {
    symbol: cleanSymbol,
    baseCurrency,
    quoteCurrency,
    overallSentiment,
    impactScore: rawImpactScore,
    sentimentScore: rawSentimentScore,
    parsedHeadlines,
    macroContextSummary,
    highVolatilityRisk: detectedHighVolatility,
    driverBreakdown,
    alignmentForDirection,
    // Dynamic pre-calculated correlations if volatility params are provided
    correlationRatingBUY: atr14 > 0 ? correlateNewsToVolatility(cleanSymbol, 'BUY', overallSentiment, rawSentimentScore, rawImpactScore, detectedHighVolatility, driverBreakdown, atr14, lastPrice) : undefined,
    correlationRatingSELL: atr14 > 0 ? correlateNewsToVolatility(cleanSymbol, 'SELL', overallSentiment, rawSentimentScore, rawImpactScore, detectedHighVolatility, driverBreakdown, atr14, lastPrice) : undefined
  };
}

/**
 * Calculates a dynamic correlation coefficient and trade conviction weighting based on news-sentiment vs. volatility alignment.
 */
export function correlateNewsToVolatility(
  symbol: string,
  direction: 'BUY' | 'SELL',
  overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  sentimentScore: number,
  impactScore: number,
  highVolatilityRisk: boolean,
  driverBreakdown: any[],
  atr14: number,
  lastPrice: number
) {
  const cleanSymbol = symbol.replace(/[-._]/g, '').toUpperCase();
  const drivers = Array.isArray(driverBreakdown) && driverBreakdown.length > 0 ? driverBreakdown : [];

  let correlationScore = 0;
  
  // 1. Core Sentiment Direction Alignment
  const isAligned = (direction === 'BUY' && overallSentiment === 'BULLISH') || (direction === 'SELL' && overallSentiment === 'BEARISH');
  const isOpposed = (direction === 'BUY' && overallSentiment === 'BEARISH') || (direction === 'SELL' && overallSentiment === 'BULLISH');
  
  if (isAligned) {
    correlationScore += Math.round(15 * (sentimentScore / 100));
  } else if (isOpposed) {
    correlationScore -= Math.round(25 * (sentimentScore / 100));
  }

  // 2. Historical Volatility & ATR Alignment
  const volPctOfPrice = lastPrice > 0 ? (atr14 / lastPrice) * 100 : 0.05;
  const isVolatilityElevated = highVolatilityRisk || volPctOfPrice > 0.12;
  
  let volWeight = 0;
  let volatilityAlignmentRating = "STABLE CONFLUENCE";
  
  if (isVolatilityElevated) {
    if (isAligned) {
      // Elevated volatility boosts aligned momentum entries
      volWeight = Math.round(12 * (1 + volPctOfPrice * 1.5));
      volatilityAlignmentRating = "HIGH MOMENTUM CONFLUENCE (VOLATILITY ALIGNED)";
    } else if (isOpposed) {
      // Extremely risky: trading against prevailing news sentiment in a volatile market
      volWeight = -Math.round(20 * (1 + volPctOfPrice * 2));
      volatilityAlignmentRating = "HAZARDOUS VOLATILITY HEADWIND (DANGEROUS MISALIGNMENT)";
    } else {
      volWeight = -Math.round(5 * (1 + volPctOfPrice));
      volatilityAlignmentRating = "CHOPPY VOLATILITY OVERLAY (STANDBY ADVISED)";
    }
  } else {
    if (isAligned) {
      volWeight = 4;
      volatilityAlignmentRating = "STABLE ALIGNED BIAS";
    } else if (isOpposed) {
      volWeight = -8;
      volatilityAlignmentRating = "STABLE OPPOSING BIAS";
    }
  }
  
  correlationScore += volWeight;

  // 3. Driver/Entity Contributions (contributing predicting force)
  const driverWeights: Array<{ name: string; score: number; bias: string }> = [];
  let driverTotalScore = 0;
  
  drivers.forEach((driver: any) => {
    const dName = driver.name || "Macro Catalyst";
    const dSentiment = (driver.sentiment || "NEUTRAL").toUpperCase();
    const dImpact = (driver.impact || driver.impactLevel || "MEDIUM").toUpperCase();
    
    let multiplier = 1.0;
    if (dImpact === "CRITICAL") multiplier = 1.8;
    else if (dImpact === "HIGH") multiplier = 1.3;
    else if (dImpact === "MEDIUM") multiplier = 1.0;
    
    let dScore = 0;
    if (direction === 'BUY') {
      if (dSentiment === 'BULLISH' || dSentiment === 'POSITIVE') {
        dScore = Math.round(5 * multiplier);
      } else if (dSentiment === 'BEARISH' || dSentiment === 'NEGATIVE') {
        dScore = -Math.round(8 * multiplier);
      }
    } else {
      if (dSentiment === 'BEARISH' || dSentiment === 'NEGATIVE') {
        dScore = Math.round(5 * multiplier);
      } else if (dSentiment === 'BULLISH' || dSentiment === 'POSITIVE') {
        dScore = -Math.round(8 * multiplier);
      }
    }
    
    driverWeights.push({
      name: dName,
      score: dScore,
      bias: dSentiment
    });
    driverTotalScore += dScore;
  });

  correlationScore += driverTotalScore;

  // Clamp dynamic weight adjustment bounds
  const netWeight = Math.max(-40, Math.min(40, correlationScore));
  
  let predictionContribution = "NEUTRAL";
  if (netWeight >= 12) {
    predictionContribution = `BUY (Strong Catalyst Correlation: +${netWeight}% weight boost)`;
  } else if (netWeight > 3) {
    predictionContribution = `BUY (Mild Catalyst Correlation: +${netWeight}% weight boost)`;
  } else if (netWeight <= -12) {
    predictionContribution = `SELL (Strong Catalyst Deficit: ${netWeight}% weight penalty)`;
  } else if (netWeight < -3) {
    predictionContribution = `SELL (Mild Catalyst Deficit: ${netWeight}% weight penalty)`;
  } else {
    predictionContribution = `STANDBY (Neutral driver feedback: ${netWeight}% weight adjustment)`;
  }

  const explanation = `[NEWS-TO-SENTIMENT CORRELATION] Evaluated ${drivers.length} asset drivers. ` +
    `${driverWeights.filter(w => w.score > 0).length}/${drivers.length} drivers in active alignment with the proposed ${direction} entry. ` +
    `Historical Volatility Alignment is [${volatilityAlignmentRating}] (ATR: ${atr14.toFixed(5)}). ` +
    `Net Correlation Weight Adjustment is ${netWeight > 0 ? '+' : ''}${netWeight}%.`;

  return {
    netWeight,
    volatilityAlignmentRating,
    predictionContribution,
    explanation,
    driverWeights
  };
}
