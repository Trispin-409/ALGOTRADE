import { adminSupabase } from './supabaseAdmin';

// ==========================================
// CHATRADE MEMORY SYSTEM - PRODUCTION LAYER
// ==========================================

export class ChatradeMemory {
  
  static async createUser(id: string, email: string, name: string) {
    if (!adminSupabase) return null;
    const { data, error } = await adminSupabase
      .from('users')
      .upsert({ id, email, name, created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) console.error('[MEMORY] Create User Error:', error);
    return data;
  }

  static async updateAccountState(accountId: string, userId: string, payload: any) {
    if (!adminSupabase) return null;
    const { data, error } = await adminSupabase
      .from('accounts')
      .upsert({
        id: accountId,
        user_id: userId,
        ...payload,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    if (error) console.error('[MEMORY] Update Account Error:', error);
    return data;
  }

  static async logStrategySignal(id: string, userId: string, payload: any) {
    if (!adminSupabase) return null;
    const { data, error } = await adminSupabase
      .from('strategy_signals')
      .insert({
        id,
        user_id: userId,
        ...payload,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    if (error) console.error('[MEMORY] Log Signal Error:', error);
    return data;
  }

  static async logAIDecision(id: string, userId: string, signalId: string, payload: any) {
    if (!adminSupabase) return null;
    const { data, error } = await adminSupabase
      .from('ai_decisions')
      .insert({
        id,
        user_id: userId,
        signal_id: signalId,
        ...payload,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    if (error) console.error('[MEMORY] Log AI Decision Error:', error);
    return data;
  }

  static async logTrade(id: string, userId: string, payload: any) {
    if (!adminSupabase) return null;
    const { data, error } = await adminSupabase
      .from('trades')
      .upsert({
        id,
        user_id: userId,
        ...payload
      })
      .select()
      .single();
    if (error) console.error('[MEMORY] Log Trade Error:', error);
    return data;
  }

  static async updateRiskState(id: string, userId: string, payload: any) {
    if (!adminSupabase) return null;
    const { data, error } = await adminSupabase
      .from('risk_state')
      .upsert({
        id,
        user_id: userId,
        ...payload,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    if (error) console.error('[MEMORY] Risk State Error:', error);
    return data;
  }

  static async saveChat(id: string, userId: string, role: string, message: string, contextType: string = 'general') {
    if (!adminSupabase) return null;
    const { data, error } = await adminSupabase
      .from('chat_history')
      .insert({
        id,
        user_id: userId,
        role,
        message,
        context_type: contextType,
        created_at: new Date().toISOString()
      });
    if (error) console.error('[MEMORY] Chat Save Error:', error);
    return data;
  }

  static async updateMarketCache(id: string, symbol: string, technicalSnapshot: any) {
    if (!adminSupabase) return null;
    const { data, error } = await adminSupabase
      .from('market_cache')
      .upsert({
        id,
        symbol,
        technical_snapshot: technicalSnapshot,
        updated_at: new Date().toISOString()
      });
    if (error) console.error('[MEMORY] Market Cache Update Error:', error);
    return data;
  }
}
