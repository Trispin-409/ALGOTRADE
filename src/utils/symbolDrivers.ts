// ALGOTRADE Master Engine - Symbol Asset Driver & Company Breakdown Mapper
// Maps any instrument (Forex, Commodities, Indices, Stocks, Crypto) to its core underlying 
// driving entities, central banks, companies, macroeconomic metrics, and news search grounding queries.

export interface SymbolDriverInfo {
  symbol: string;
  assetType: 'FOREX' | 'COMMODITY' | 'INDEX' | 'STOCK' | 'CRYPTO';
  displayName: string;
  primaryDrivers: {
    name: string;
    role: string;
    impactLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM';
    type: 'CENTRAL_BANK' | 'COMPANY' | 'MACRO_METRIC' | 'GEOPOLITICAL' | 'REGULATORY';
  }[];
  keyCompaniesAndEntities: string[];
  macroVariables: string[];
  newsQueryKeywords: string;
  explanation: string;
}

export function getSymbolDriverBreakdown(rawSymbol: string): SymbolDriverInfo {
  const symbol = (rawSymbol || 'EURUSD').toUpperCase();

  // 1. GOLD / SILVER (Commodities)
  if (symbol.includes('XAU') || symbol.includes('GOLD')) {
    return {
      symbol,
      assetType: 'COMMODITY',
      displayName: 'Gold / US Dollar',
      primaryDrivers: [
        { name: 'Federal Reserve (FED)', role: 'Interest Rate Expectations & Fed Balance Sheet', impactLevel: 'CRITICAL', type: 'CENTRAL_BANK' },
        { name: 'US Treasury', role: '10-Year Real Yields & Bond Market Volatility', impactLevel: 'CRITICAL', type: 'MACRO_METRIC' },
        { name: 'People’s Bank of China (PBOC)', role: 'Sovereign Bullion Reserve Accumulation', impactLevel: 'HIGH', type: 'CENTRAL_BANK' },
        { name: 'Bureau of Labor Statistics (BLS)', role: 'US CPI Inflation & Non-Farm Payrolls (NFP)', impactLevel: 'CRITICAL', type: 'MACRO_METRIC' },
        { name: 'Geopolitical Risk Index', role: 'Middle East / Eastern Europe Safe-Haven Inflows', impactLevel: 'HIGH', type: 'GEOPOLITICAL' }
      ],
      keyCompaniesAndEntities: ['Federal Reserve', 'US Treasury Department', 'PBOC', 'World Gold Council', 'Bureau of Labor Statistics'],
      macroVariables: ['US CPI Inflation Rate', 'US 10-Year Real Yield', 'DXY US Dollar Index', 'Fed Funds Target Rate', 'Global Geopolitical Risk'],
      newsQueryKeywords: 'XAUUSD Gold price Fed interest rates 10-year Treasury yields inflation NFP geopolitical safe haven today',
      explanation: 'Gold is primarily driven by US 10-Year Real Yields, Fed interest rate trajectory, DXY strength, and sovereign central bank purchases (PBOC).'
    };
  }

  if (symbol.includes('XAG') || symbol.includes('SILVER')) {
    return {
      symbol,
      assetType: 'COMMODITY',
      displayName: 'Silver / US Dollar',
      primaryDrivers: [
        { name: 'Federal Reserve (FED)', role: 'Monetary Policy & Real Rates', impactLevel: 'CRITICAL', type: 'CENTRAL_BANK' },
        { name: 'Industrial Solar & EV Sector', role: 'Industrial Demand & Green Energy Supply', impactLevel: 'HIGH', type: 'COMPANY' },
        { name: 'DXY Dollar Index', role: 'Currency Valuation Inverse Driver', impactLevel: 'HIGH', type: 'MACRO_METRIC' }
      ],
      keyCompaniesAndEntities: ['Federal Reserve', 'US Treasury', 'Solar Energy Manufacturers', 'Tesla', 'Global Mining Council'],
      macroVariables: ['Industrial PMI', 'Silver/Gold Ratio', 'US 10Y Yield', 'DXY Index'],
      newsQueryKeywords: 'XAGUSD Silver price industrial demand Fed interest rates solar EV supply today',
      explanation: 'Silver combines monetary safe-haven drivers with heavy industrial demand from solar manufacturing and electric vehicle battery production.'
    };
  }

  if (symbol.includes('USOIL') || symbol.includes('UKOIL') || symbol.includes('WTI') || symbol.includes('BRENT') || symbol.includes('CRUDE')) {
    return {
      symbol,
      assetType: 'COMMODITY',
      displayName: 'Crude Oil',
      primaryDrivers: [
        { name: 'OPEC+ Alliance', role: 'Global Production Quotas & Supply Cuts', impactLevel: 'CRITICAL', type: 'CENTRAL_BANK' },
        { name: 'US Energy Information Admin (EIA)', role: 'Weekly Crude Oil Inventories', impactLevel: 'CRITICAL', type: 'MACRO_METRIC' },
        { name: 'China Economy & Industrial Output', role: 'Global Demand Growth Engine', impactLevel: 'HIGH', type: 'MACRO_METRIC' },
        { name: 'Middle East Shipping Routes', role: 'Supply Disruptions & Geopolitical Risk Premium', impactLevel: 'HIGH', type: 'GEOPOLITICAL' }
      ],
      keyCompaniesAndEntities: ['OPEC+', 'EIA', 'ExxonMobil', 'Chevron', 'Saudi Aramco', 'IEA'],
      macroVariables: ['EIA Inventory Stocks', 'OPEC Production Output', 'Global Manufacturing PMI', 'US Dollar Index'],
      newsQueryKeywords: 'Crude Oil WTI Brent OPEC production cuts EIA inventory China demand geopolitics today',
      explanation: 'Crude Oil pricing is dictated by OPEC+ production decisions, EIA inventory draws, global industrial demand (China/US), and Middle East supply risks.'
    };
  }

  // 2. NASDAQ / SPX / DOW / GER40 (Indices)
  if (symbol.includes('NAS') || symbol.includes('US100') || symbol.includes('NDX') || symbol.includes('TECH')) {
    return {
      symbol,
      assetType: 'INDEX',
      displayName: 'Nasdaq 100 Index',
      primaryDrivers: [
        { name: 'NVIDIA Corporation (NVDA)', role: 'AI Infrastructure & Semiconductor Leadership', impactLevel: 'CRITICAL', type: 'COMPANY' },
        { name: 'Apple Inc. (AAPL)', role: 'Consumer Tech & Buyback Capital Flow', impactLevel: 'CRITICAL', type: 'COMPANY' },
        { name: 'Microsoft Corporation (MSFT)', role: 'Enterprise Cloud & OpenAI Ecosystem', impactLevel: 'CRITICAL', type: 'COMPANY' },
        { name: 'Tesla Inc. (TSLA)', role: 'EV Market Leader & Retail Volume Catalyst', impactLevel: 'HIGH', type: 'COMPANY' },
        { name: 'Alphabet Inc. (GOOGL)', role: 'Search & Digital Advertising Growth', impactLevel: 'HIGH', type: 'COMPANY' },
        { name: 'Amazon.com Inc. (AMZN)', role: 'AWS Cloud & Retail Consumption', impactLevel: 'HIGH', type: 'COMPANY' },
        { name: 'Federal Reserve (FED)', role: 'Interest Rates & Discount Rate Valuation', impactLevel: 'CRITICAL', type: 'CENTRAL_BANK' }
      ],
      keyCompaniesAndEntities: ['NVIDIA', 'Apple', 'Microsoft', 'Tesla', 'Alphabet', 'Amazon', 'Meta', 'Federal Reserve'],
      macroVariables: ['10-Year Treasury Yields', 'Tech Earnings Growth (EPS)', 'US CPI Inflation', 'Fed Policy Rate'],
      newsQueryKeywords: 'Nasdaq US100 tech stocks earnings NVIDIA Apple Microsoft Tesla Fed interest rate yields today',
      explanation: 'Nasdaq 100 is directly driven by the Magnificent 7 mega-cap tech earnings (NVDA, AAPL, MSFT, AMZN, GOOGL, META, TSLA) and 10-year Treasury yield movements.'
    };
  }

  if (symbol.includes('US30') || symbol.includes('DOW') || symbol.includes('DJI')) {
    return {
      symbol,
      assetType: 'INDEX',
      displayName: 'Dow Jones Industrial Average',
      primaryDrivers: [
        { name: 'UnitedHealth Group (UNH)', role: 'Highest Weight Price-Weighted Index Component', impactLevel: 'CRITICAL', type: 'COMPANY' },
        { name: 'Goldman Sachs (GS)', role: 'Banking & Financial Sector Anchor', impactLevel: 'HIGH', type: 'COMPANY' },
        { name: 'Caterpillar Inc. (CAT)', role: 'Industrial Manufacturing & Infrastructure Proxy', impactLevel: 'HIGH', type: 'COMPANY' },
        { name: 'Boeing Co. (BA)', role: 'Aerospace & Global Export Volume', impactLevel: 'HIGH', type: 'COMPANY' },
        { name: 'Federal Reserve (FED)', role: 'US Macro Economy & Rate Policy', impactLevel: 'CRITICAL', type: 'CENTRAL_BANK' }
      ],
      keyCompaniesAndEntities: ['UnitedHealth', 'Goldman Sachs', 'Caterpillar', 'Boeing', 'JPMorgan Chase', 'Federal Reserve'],
      macroVariables: ['US Industrial Production', 'ISM Manufacturing PMI', 'US GDP Growth', 'Fed Interest Rates'],
      newsQueryKeywords: 'Dow Jones US30 earnings UnitedHealth Goldman Sachs Caterpillar Boeing Fed economy today',
      explanation: 'Dow Jones US30 is a price-weighted index heavily influenced by industrial earnings, financial stability, healthcare sector trends, and US GDP growth.'
    };
  }

  if (symbol.includes('SPX') || symbol.includes('US500') || symbol.includes('SP500')) {
    return {
      symbol,
      assetType: 'INDEX',
      displayName: 'S&P 500 Index',
      primaryDrivers: [
        { name: 'Federal Reserve (FED)', role: 'Monetary Policy & Market Liquidity', impactLevel: 'CRITICAL', type: 'CENTRAL_BANK' },
        { name: 'Mega-Cap Tech (NVDA, AAPL, MSFT)', role: '30%+ Total Weight Corporate Growth Engine', impactLevel: 'CRITICAL', type: 'COMPANY' },
        { name: 'US Corporate Earnings (S&P 500 EPS)', role: 'Fundamental Earnings Yield Anchor', impactLevel: 'CRITICAL', type: 'MACRO_METRIC' },
        { name: 'US Labor Market (BLS NFP)', role: 'Consumer Purchasing Power & Economic Health', impactLevel: 'HIGH', type: 'MACRO_METRIC' }
      ],
      keyCompaniesAndEntities: ['Federal Reserve', 'NVIDIA', 'Apple', 'Microsoft', 'Amazon', 'JPMorgan Chase', 'Berkshire Hathaway'],
      macroVariables: ['S&P 500 Blended EPS', 'US CPI Inflation', 'US Non-Farm Payrolls', '10Y Treasury Yield', 'VIX Volatility Index'],
      newsQueryKeywords: 'SPX500 S&P500 US stock market Fed interest rate earnings season CPI NFP today',
      explanation: 'The S&P 500 represents the benchmark US equity market, driven by Fed liquidity, corporate earnings health, inflation trends, and macro economic growth.'
    };
  }

  // 3. CRYPTO (BTCUSD, ETHUSD, SOLUSD)
  if (symbol.includes('BTC') || symbol.includes('BITCOIN')) {
    return {
      symbol,
      assetType: 'CRYPTO',
      displayName: 'Bitcoin / US Dollar',
      primaryDrivers: [
        { name: 'BlackRock & Fidelity Spot ETFs', role: 'Institutional Net Capital Inflows/Outflows', impactLevel: 'CRITICAL', type: 'COMPANY' },
        { name: 'US SEC & Crypto Regulation', role: 'Legislative Clarity & Enforcement Actions', impactLevel: 'CRITICAL', type: 'REGULATORY' },
        { name: 'Federal Reserve Global Liquidity', role: 'Global M2 Money Supply Expansion', impactLevel: 'HIGH', type: 'CENTRAL_BANK' },
        { name: 'MicroStrategy (MSTR)', role: 'Corporate Treasury Bitcoin Acquisition', impactLevel: 'HIGH', type: 'COMPANY' },
        { name: 'Derivatives Exchanges (Deribit/Binance)', role: 'Futures Liquidation Cascades & Open Interest', impactLevel: 'HIGH', type: 'COMPANY' }
      ],
      keyCompaniesAndEntities: ['BlackRock', 'Fidelity', 'US SEC', 'MicroStrategy', 'Binance', 'Coinbase', 'Federal Reserve'],
      macroVariables: ['Spot Bitcoin ETF Net Inflows', 'Derivatives Open Interest', 'Global M2 Liquidity', 'DXY Index', 'Halving Cycle Metrics'],
      newsQueryKeywords: 'Bitcoin BTC price ETF inflows BlackRock SEC regulation MicroStrategy Fed liquidity today',
      explanation: 'Bitcoin is driven by institutional Spot ETF net inflows, US regulatory legislation, global liquidity (M2 supply), and futures market liquidations.'
    };
  }

  if (symbol.includes('ETH') || symbol.includes('ETHEREUM')) {
    return {
      symbol,
      assetType: 'CRYPTO',
      displayName: 'Ethereum / US Dollar',
      primaryDrivers: [
        { name: 'Spot Ethereum ETFs', role: 'Institutional ETF Capital Flow', impactLevel: 'CRITICAL', type: 'COMPANY' },
        { name: 'DeFi & Layer 2 Ecosystem', role: 'Network Gas Fees, Staking Yields & Total Value Locked (TVL)', impactLevel: 'HIGH', type: 'MACRO_METRIC' },
        { name: 'US SEC Regulatory Status', role: 'Staking Classification & Policy Decisions', impactLevel: 'CRITICAL', type: 'REGULATORY' }
      ],
      keyCompaniesAndEntities: ['Ethereum Foundation', 'BlackRock', 'Grayscale', 'US SEC', 'Arbitrum', 'Optimism', 'Uniswap'],
      macroVariables: ['Ethereum TVL', 'Staking Yield Rate', 'Spot ETF Flows', 'Gas Fee Burn Rate'],
      newsQueryKeywords: 'Ethereum ETH price ETF staking SEC DeFi gas fees crypto regulation today',
      explanation: 'Ethereum is driven by Spot ETF capital flows, DeFi network activity, staking yields, Layer-2 adoption, and SEC regulatory status.'
    };
  }

  // 4. FOREX MAJORS & MINORS
  if (symbol.includes('EURUSD') || symbol.includes('EUR')) {
    return {
      symbol,
      assetType: 'FOREX',
      displayName: 'Euro / US Dollar',
      primaryDrivers: [
        { name: 'European Central Bank (ECB)', role: 'Eurozone Interest Rates & Monetary Policy', impactLevel: 'CRITICAL', type: 'CENTRAL_BANK' },
        { name: 'Federal Reserve (FED)', role: 'US Interest Rates & Dollar Dominance', impactLevel: 'CRITICAL', type: 'CENTRAL_BANK' },
        { name: 'US Bureau of Labor Statistics', role: 'US CPI Inflation & Non-Farm Payrolls', impactLevel: 'CRITICAL', type: 'MACRO_METRIC' },
        { name: 'Eurostat', role: 'Eurozone Inflation (HICP) & GDP Growth', impactLevel: 'HIGH', type: 'MACRO_METRIC' }
      ],
      keyCompaniesAndEntities: ['European Central Bank (ECB)', 'Federal Reserve', 'Eurostat', 'US BLS', 'German Bundesbank'],
      macroVariables: ['ECB vs Fed Rate Differential', 'Eurozone CPI', 'US NFP Jobs Report', 'German Manufacturing PMI'],
      newsQueryKeywords: 'EURUSD Euro Dollar ECB interest rates Fed inflation NFP Christine Lagarde Jerome Powell today',
      explanation: 'EUR/USD is driven by the interest rate policy differential between the European Central Bank (Lagarde) and the Federal Reserve (Powell), alongside EU/US economic growth metrics.'
    };
  }

  if (symbol.includes('GBPUSD') || symbol.includes('GBP')) {
    return {
      symbol,
      assetType: 'FOREX',
      displayName: 'British Pound / US Dollar',
      primaryDrivers: [
        { name: 'Bank of England (BOE)', role: 'UK Interest Rates & Inflation Control', impactLevel: 'CRITICAL', type: 'CENTRAL_BANK' },
        { name: 'Federal Reserve (FED)', role: 'US Monetary Policy & Dollar Flow', impactLevel: 'CRITICAL', type: 'CENTRAL_BANK' },
        { name: 'UK Office for National Statistics (ONS)', role: 'UK CPI Inflation & Wage Growth', impactLevel: 'HIGH', type: 'MACRO_METRIC' }
      ],
      keyCompaniesAndEntities: ['Bank of England (BOE)', 'Federal Reserve', 'UK ONS', 'UK Treasury'],
      macroVariables: ['BOE Interest Rate', 'UK CPI Inflation', 'UK Wage Growth', 'US Dollar Index'],
      newsQueryKeywords: 'GBPUSD Pound BOE interest rates inflation UK economy Fed US dollar today',
      explanation: 'GBP/USD is driven by Bank of England monetary policy decisions, UK wage inflation figures, and overall US Dollar sentiment.'
    };
  }

  if (symbol.includes('USDJPY') || symbol.includes('JPY')) {
    return {
      symbol,
      assetType: 'FOREX',
      displayName: 'US Dollar / Japanese Yen',
      primaryDrivers: [
        { name: 'Bank of Japan (BOJ)', role: 'Yield Curve Control (YCC) & Rate Normalization', impactLevel: 'CRITICAL', type: 'CENTRAL_BANK' },
        { name: 'Federal Reserve (FED)', role: 'US Interest Rates & Treasury Yield Spread', impactLevel: 'CRITICAL', type: 'CENTRAL_BANK' },
        { name: 'US Treasury Department', role: '10-Year US Treasury Yields', impactLevel: 'CRITICAL', type: 'MACRO_METRIC' },
        { name: 'Ministry of Finance Japan (MOF)', role: 'Direct Currency Market Intervention Warnings', impactLevel: 'HIGH', type: 'CENTRAL_BANK' }
      ],
      keyCompaniesAndEntities: ['Bank of Japan (BOJ)', 'Federal Reserve', 'Ministry of Finance Japan', 'US Treasury'],
      macroVariables: ['US 10Y Treasury Yield vs JGB Yield Spread', 'BOJ Policy Rate', 'MOF Intervention Level', 'Japan Tokyo CPI'],
      newsQueryKeywords: 'USDJPY Yen BOJ interest rates Kazuo Ueda US Treasury yields intervention Fed today',
      explanation: 'USD/JPY is heavily correlated with US 10-Year Treasury Yields and Bank of Japan monetary policy shifts or MOF currency intervention threats.'
    };
  }

  // 5. INDIVIDUAL STOCKS (AAPL, NVDA, TSLA, MSFT, AMZN, GOOGL, META)
  if (symbol.includes('NVDA')) {
    return {
      symbol,
      assetType: 'STOCK',
      displayName: 'NVIDIA Corporation',
      primaryDrivers: [
        { name: 'Data Center AI Chip Demand', role: 'Hopper/Blackwell Architecture Orders & Revenue', impactLevel: 'CRITICAL', type: 'COMPANY' },
        { name: 'Big Tech CapEx Spending', role: 'Microsoft, Meta, Google, Amazon AI CapEx Budgets', impactLevel: 'CRITICAL', type: 'COMPANY' },
        { name: 'TSMC (Taiwan Semiconductor)', role: 'Chip Fabrication Capacity & CoWoS Supply Chain', impactLevel: 'HIGH', type: 'COMPANY' },
        { name: 'US Commerce Dept Export Rules', role: 'China AI Chip Export Restrictions', impactLevel: 'HIGH', type: 'REGULATORY' }
      ],
      keyCompaniesAndEntities: ['NVIDIA', 'TSMC', 'Microsoft', 'Meta', 'Alphabet', 'Amazon', 'AMD', 'US Commerce Department'],
      macroVariables: ['NVIDIA Data Center Revenue', 'Big Tech AI CapEx', 'Gross Margin %', 'US 10Y Treasury Yield'],
      newsQueryKeywords: 'NVIDIA NVDA stock Blackwell AI chip demand earnings TSMC tech CapEx today',
      explanation: 'NVIDIA is driven by AI hardware demand, Blackwell supply chain yields at TSMC, and Cloud Service Provider CapEx budgets.'
    };
  }

  if (symbol.includes('AAPL')) {
    return {
      symbol,
      assetType: 'STOCK',
      displayName: 'Apple Inc.',
      primaryDrivers: [
        { name: 'iPhone Sales & Upgrade Cycles', role: 'Hardware Revenue & Apple Intelligence Adoption', impactLevel: 'CRITICAL', type: 'COMPANY' },
        { name: 'Services Division Growth', role: 'App Store, iCloud, Apple Pay High-Margin Revenue', impactLevel: 'HIGH', type: 'COMPANY' },
        { name: 'China Greater Market Share', role: 'China Sales & Foxconn Supply Chain Operations', impactLevel: 'HIGH', type: 'GEOPOLITICAL' },
        { name: 'Share Buybacks & Dividend', role: 'Massive Capital Return to Shareholders', impactLevel: 'HIGH', type: 'COMPANY' }
      ],
      keyCompaniesAndEntities: ['Apple', 'Foxconn', 'Google', 'Qualcomm', 'TSMC', 'China Ministry of Commerce'],
      macroVariables: ['iPhone Unit Revenue', 'Services Segment Growth', 'China Consumer Demand', 'US Treasury Yields'],
      newsQueryKeywords: 'Apple AAPL stock iPhone sales Apple Intelligence earnings China supply chain today',
      explanation: 'Apple is driven by iPhone upgrade cycles, Services segment growth, China market demand, and massive share buybacks.'
    };
  }

  if (symbol.includes('TSLA')) {
    return {
      symbol,
      assetType: 'STOCK',
      displayName: 'Tesla Inc.',
      primaryDrivers: [
        { name: 'Quarterly Vehicle Deliveries', role: 'EV Production & Global Delivery Volume', impactLevel: 'CRITICAL', type: 'COMPANY' },
        { name: 'Full Self-Driving (FSD) & Robotaxi', role: 'Autonomous AI Licensing & Regulatory Approval', impactLevel: 'CRITICAL', type: 'COMPANY' },
        { name: 'EV Price Cuts & Operating Margins', role: 'Gross Automotive Margin Excluding Credits', impactLevel: 'HIGH', type: 'MACRO_METRIC' },
        { name: 'Megapack Energy Storage', role: 'Energy Division Revenue Expansion', impactLevel: 'HIGH', type: 'COMPANY' }
      ],
      keyCompaniesAndEntities: ['Tesla', 'NHTSA', 'BYD', 'Panasonic', 'CATL', 'Elon Musk Ventures'],
      macroVariables: ['Vehicle Delivery Units', 'Automotive Gross Margin %', 'EV Interest Rates', 'FSD Miles Driven'],
      newsQueryKeywords: 'Tesla TSLA stock deliveries FSD Robotaxi Elon Musk EV price margins today',
      explanation: 'Tesla is driven by quarterly vehicle deliveries, Full Self-Driving (FSD) Robotaxi milestones, and automotive gross profit margins.'
    };
  }

  // DEFAULT / GENERIC SYMBOL DRIVER FALLBACK
  return {
    symbol,
    assetType: symbol.length === 6 ? 'FOREX' : 'STOCK',
    displayName: `${symbol} Trading Instrument`,
    primaryDrivers: [
      { name: 'Federal Reserve & Central Banks', role: 'Global Monetary Policy & Rates', impactLevel: 'CRITICAL', type: 'CENTRAL_BANK' },
      { name: 'US Macro Data (CPI, NFP, GDP)', role: 'Economic Growth & Inflation Benchmark', impactLevel: 'CRITICAL', type: 'MACRO_METRIC' },
      { name: 'Institutional Order Flow', role: 'Liquidity Pools & Volume Absorption', impactLevel: 'HIGH', type: 'COMPANY' }
    ],
    keyCompaniesAndEntities: ['Federal Reserve', 'US Treasury', 'Central Banks', 'Major Investment Banks'],
    macroVariables: ['US Dollar Index', 'Fed Policy Rate', 'Inflation Rate', 'Global Market Sentiment'],
    newsQueryKeywords: `${symbol} market price news breaking earnings economic indicators today`,
    explanation: `${symbol} is influenced by global macroeconomic policy, liquidity conditions, central bank actions, and institutional order flows.`
  };
}
