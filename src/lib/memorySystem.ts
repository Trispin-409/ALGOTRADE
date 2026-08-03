import { adminSupabase } from './supabaseAdmin';

// ==========================================
// CHATRADE MEMORY SYSTEM - PRODUCTION LAYER
// ==========================================

export class ChatradeMemory {
  
  static isUUID(val: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  }

  static async resolveUserId(input: string): Promise<string | null> {
    if (!adminSupabase || !input) return null;
    
    if (this.isUUID(input)) return input;
    
    // Check if it's an email
    if (input.includes('@')) {
      const { data, error } = await adminSupabase
        .from('users')
        .select('id')
        .eq('email', input.toLowerCase().trim())
        .maybeSingle();
      if (data?.id) return data.id;
    }
    
    // Otherwise, assume it's an account ID (MetaApi account id)
    const { data, error } = await adminSupabase
      .from('ea_leases')
      .select('user_id')
      .eq('account_id', input)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
    
    // Try ea_deployments as fallback
    const { data: deployData } = await adminSupabase
      .from('ea_deployments')
      .select('user_id')
      .eq('account_id', input)
      .maybeSingle();
    if (deployData?.user_id) return deployData.user_id;

    return null;
  }

  static async ensureUserExists(userId: string, email?: string) {
    if (!adminSupabase || !userId || !this.isUUID(userId)) return;
    try {
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
    } catch (err: any) {
      console.warn(`[MEMORY] Ensure parent user exists failed:`, err.message || err);
    }
  }

  static async createUser(id: string, email: string, name: string) {
    if (!adminSupabase) return null;
    if (!this.isUUID(id)) {
      console.error('[MEMORY] Create User skipped: ID is not a valid UUID', id);
      return null;
    }
    const { data, error } = await adminSupabase
      .from('users')
      .upsert({ id, email, name, created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) console.error('[MEMORY] Create User Error:', error.message || error);
    return data;
  }

  static async updateAccountState(accountId: string, userId: string, payload: any) {
    if (!adminSupabase) return null;
    const resolvedUid = await this.resolveUserId(userId);
    if (!resolvedUid) {
      console.error('[MEMORY] Update Account State skipped: user_id could not be resolved', userId);
      return null;
    }
    if (!this.isUUID(accountId)) {
      console.error('[MEMORY] Update Account State skipped: account_id is not a valid UUID', accountId);
      return null;
    }
    await this.ensureUserExists(resolvedUid);
    const { data, error } = await adminSupabase
      .from('accounts')
      .upsert({
        id: accountId,
        user_id: resolvedUid,
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
    const resolvedUid = await this.resolveUserId(userId);
    if (!resolvedUid) {
      console.error('[MEMORY] Log Signal skipped: user_id could not be resolved', userId);
      return null;
    }
    if (!this.isUUID(id)) {
      console.error('[MEMORY] Log Signal skipped: signal ID is not a valid UUID', id);
      return null;
    }
    await this.ensureUserExists(resolvedUid);
    const { data, error } = await adminSupabase
      .from('strategy_signals')
      .insert({
        id,
        user_id: resolvedUid,
        ...payload,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    if (error) console.error('[MEMORY] Log Signal Error:', error);
    return data;
  }

  static async logAIDecision(id: string, userId: string, signalId: string | null, payload: any) {
    if (!adminSupabase) return null;
    const resolvedUid = await this.resolveUserId(userId);
    if (!resolvedUid) {
      console.error('[MEMORY] Log AI Decision skipped: user_id could not be resolved', userId);
      return null;
    }
    if (!this.isUUID(id)) {
      console.error('[MEMORY] Log AI Decision skipped: decision ID is not a valid UUID', id);
      return null;
    }
    const cleanSignalId = (signalId === 'N/A' || !signalId) ? null : signalId;
    if (cleanSignalId && !this.isUUID(cleanSignalId)) {
      console.error('[MEMORY] Log AI Decision skipped: signal_id is not a valid UUID', cleanSignalId);
      return null;
    }
    await this.ensureUserExists(resolvedUid);
    const { data, error } = await adminSupabase
      .from('ai_decisions')
      .insert({
        id,
        user_id: resolvedUid,
        signal_id: cleanSignalId,
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
    const resolvedUid = await this.resolveUserId(userId);
    if (!resolvedUid) {
      console.error('[MEMORY] Log Trade skipped: user_id could not be resolved', userId);
      return null;
    }
    if (!this.isUUID(id)) {
      console.error('[MEMORY] Log Trade skipped: trade ID is not a valid UUID', id);
      return null;
    }
    await this.ensureUserExists(resolvedUid);
    const { data, error } = await adminSupabase
      .from('trades')
      .upsert({
        id,
        user_id: resolvedUid,
        ...payload
      })
      .select()
      .single();
    if (error) console.error('[MEMORY] Log Trade Error:', error);
    return data;
  }

  static async updateRiskState(id: string, userId: string, payload: any) {
    if (!adminSupabase) return null;
    const resolvedUid = await this.resolveUserId(userId);
    if (!resolvedUid) {
      console.error('[MEMORY] Risk State skipped: user_id could not be resolved', userId);
      return null;
    }
    if (!this.isUUID(id)) {
      console.error('[MEMORY] Risk State skipped: risk state ID is not a valid UUID', id);
      return null;
    }
    await this.ensureUserExists(resolvedUid);
    const { data, error } = await adminSupabase
      .from('risk_state')
      .upsert({
        id,
        user_id: resolvedUid,
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
    const resolvedUid = await this.resolveUserId(userId);
    if (!resolvedUid) {
      console.warn(`[MEMORY] Cannot save chat: userId '${userId}' could not be resolved.`);
      return null;
    }
    if (!this.isUUID(id)) {
      console.warn(`[MEMORY] Cannot save chat: chat ID '${id}' is not a valid UUID.`);
      return null;
    }

    await this.ensureUserExists(resolvedUid, email);

    const { data, error } = await adminSupabase
      .from('chat_history')
      .insert({
        id,
        user_id: resolvedUid,
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
