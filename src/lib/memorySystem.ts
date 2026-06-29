import { adminSupabase } from './supabaseAdmin';

// ==========================================
// CHATRADE MEMORY SYSTEM - PRODUCTION LAYER
// ==========================================

export class ChatradeMemory {
  
  static async createUser(id: string, email: string, name: string) {
    if (!adminSupabase) return null;
    const { data, error } = await adminSupabase
      .from('users')
      .upsert({ id, email, created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) console.error('[MEMORY] Create User Error:', error.message || error);
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

  static async saveChat(id: string, userId: string, role: string, message: string, contextType: string = 'general', email?: string) {
    if (!adminSupabase) return null;

    // Validate if userId is a valid UUID to prevent pg syntax errors
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId);
    if (!isUUID) {
      console.warn(`[MEMORY] Cannot save chat: userId '${userId}' is not a valid UUID.`);
      return null;
    }

    try {
      // Ensure containing parent user exists first to solve foreign key REFERENCES users(id) failures
      const { data: existingUser } = await adminSupabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (!existingUser) {
        await adminSupabase
          .from('users')
          .insert({
            id: userId,
            email: email || `${userId.substring(0, 8)}@example.com`,
            created_at: new Date().toISOString()
          });
      }
    } catch (parentErr: any) {
      console.warn(`[MEMORY] Chat Save parent user validation error:`, parentErr.message || parentErr);
    }

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
    if (error) console.error('[MEMORY] Chat Save Error:', error.message || error, JSON.stringify(error));
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
