-- Chatrade Memory System Schema (PostgreSQL for Supabase)

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    base_currency TEXT DEFAULT 'USD',
    region TEXT DEFAULT 'ZAR',
    ai_mode TEXT DEFAULT 'BALANCED' 
    -- CONSERVATIVE | BALANCED | AGGRESSIVE | PROP_FIRM
);

-- 2. ACCOUNT STATE (LIVE CAPITAL MEMORY)
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    balance DECIMAL,
    equity DECIMAL,
    margin DECIMAL,
    profit_loss_today DECIMAL,
    total_drawdown DECIMAL,
    growth_target DECIMAL,
    current_cycle TEXT, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. PROP FIRM RULES MEMORY (VERY IMPORTANT)
CREATE TABLE IF NOT EXISTS prop_rules (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    firm_name TEXT,
    max_daily_drawdown DECIMAL,
    max_total_drawdown DECIMAL,
    profit_target DECIMAL,
    max_lot_size DECIMAL,
    min_trading_days INT,
    news_trading BOOLEAN DEFAULT false,
    weekend_holding BOOLEAN DEFAULT true,
    raw_text TEXT,
    parsed_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TRADING STRATEGY MEMORY (NODE.JS SIGNAL HISTORY)
CREATE TABLE IF NOT EXISTS strategy_signals (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    symbol TEXT,
    direction TEXT, -- BUY / SELL
    timeframe TEXT,
    technical_score INT,
    signal_source TEXT DEFAULT 'NODE_STRATEGY',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. AI DECISIONS MEMORY (CORE CHATRADE BRAIN LOG)
CREATE TABLE IF NOT EXISTS ai_decisions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    signal_id UUID REFERENCES strategy_signals(id),
    decision TEXT, -- APPROVE | REJECT | WAIT
    confidence INT,
    reasoning TEXT,
    macro_bias TEXT,
    news_bias TEXT,
    risk_score INT,
    tp DECIMAL,
    sl DECIMAL,
    lot_size DECIMAL,
    model_version TEXT DEFAULT 'gemini-1',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. TRADE EXECUTION LOG (METAAPI / MT5)
CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    symbol TEXT,
    direction TEXT,
    entry_price DECIMAL,
    exit_price DECIMAL,
    lot_size DECIMAL,
    stop_loss DECIMAL,
    take_profit DECIMAL,
    profit DECIMAL,
    status TEXT, -- OPEN | CLOSED | STOPPED | FAILED
    execution_source TEXT,
    opened_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE
);

-- 7. RISK STATE MEMORY (REAL-TIME SAFETY ENGINE)
CREATE TABLE IF NOT EXISTS risk_state (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    current_drawdown DECIMAL,
    daily_loss_limit DECIMAL,
    active_risk_exposure DECIMAL,
    allowed_to_trade BOOLEAN DEFAULT true,
    violation_reason TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. CHATRADE CHAT MEMORY (MENTOR SYSTEM)
CREATE TABLE IF NOT EXISTS chat_history (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    role TEXT, -- user | assistant | system
    message TEXT,
    context_type TEXT, -- setup | analysis | trade | education
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. MARKET CONTEXT CACHE (VERY IMPORTANT FOR COST CONTROL)
CREATE TABLE IF NOT EXISTS market_cache (
    id UUID PRIMARY KEY,
    symbol TEXT,
    macro_data JSONB, -- FRED
    news_data JSONB,  -- Finnhub
    technical_snapshot JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
