/**
 * 進金生能源 6692｜展覽客戶機會管理平台
 * Supabase 雲端資料庫整合客戶端 (Supabase Client Module)
 * 符合 github-supabase-web 規範：
 * 1. 僅暴露 anon public key，絕不寫入 service_role
 * 2. 支援離線快取與雲端雙向同步
 * 3. 預設配置即可直接使用，無需業務手動設定
 */

const DEFAULT_SUPABASE_URL = "https://cowljafosekwvxithwjd.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvd2xqYWZvc2Vrd3Z4aXRod2pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjg2NTYzODcsImV4cCI6MjA5NDIzMjM4N30.c8YXP7EXDeTOw-mJEmnYZ_DJeZv6Qt6HVDzEf8J2K_I";

class ExhibitionSupabaseManager {
  constructor() {
    this.url = localStorage.getItem('EXHIBITION_SB_URL') || DEFAULT_SUPABASE_URL;
    this.key = localStorage.getItem('EXHIBITION_SB_ANON_KEY') || DEFAULT_SUPABASE_ANON_KEY;
    this.client = null;
    this.isConnected = false;
    this.tableReady = false;
    this.init();
  }

  init() {
    if (window.supabase && this.url && this.key) {
      try {
        this.client = window.supabase.createClient(this.url, this.key);
      } catch (e) {
        console.warn('[Supabase] Init error:', e);
      }
    }
  }

  saveConfig(newUrl, newKey) {
    this.url = newUrl ? newUrl.trim() : DEFAULT_SUPABASE_URL;
    this.key = newKey ? newKey.trim() : DEFAULT_SUPABASE_ANON_KEY;
    localStorage.setItem('EXHIBITION_SB_URL', this.url);
    localStorage.setItem('EXHIBITION_SB_ANON_KEY', this.key);
    this.init();
  }

  resetDefaultConfig() {
    this.url = DEFAULT_SUPABASE_URL;
    this.key = DEFAULT_SUPABASE_ANON_KEY;
    localStorage.removeItem('EXHIBITION_SB_URL');
    localStorage.removeItem('EXHIBITION_SB_ANON_KEY');
    this.init();
  }

  // 測試連線與資料表是否存在
  async testConnection() {
    if (!this.client) this.init();
    if (!this.client) return { connected: false, message: 'Supabase JS SDK 尚未載入' };

    try {
      // 測試讀取 exhibition_leads
      const { data, error } = await this.client
        .from('exhibition_leads')
        .select('id')
        .limit(1);

      if (error) {
        if (error.code === 'PGRST205' || error.message.includes('Could not find the table') || error.code === '42P01') {
          this.isConnected = true;
          this.tableReady = false;
          return {
            connected: true,
            tableReady: false,
            message: 'Supabase 雲端已連通，但尚未建立資料表。請在 SQL Editor 執行 supabase-schema.sql！'
          };
        }
        return { connected: false, message: error.message };
      }

      this.isConnected = true;
      this.tableReady = true;
      return { connected: true, tableReady: true, message: '🟢 Supabase 雲端 PostgreSQL 資料庫已連線！' };
    } catch (e) {
      return { connected: false, message: e.message || '連線逾時或網路異常' };
    }
  }

  // 取得展會清單
  async getExhibitions() {
    if (!this.client) this.init();
    if (!this.client) return null;
    try {
      const { data, error } = await this.client
        .from('exhibitions')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn('[Supabase] getExhibitions failed, using fallback:', e);
      return null;
    }
  }

  // 取得客戶機會清單
  async getLeads(exhibitionId = null) {
    if (!this.client) this.init();
    if (!this.client) return null;
    try {
      let query = this.client
        .from('exhibition_leads')
        .select('*')
        .order('seq_no', { ascending: true });
      
      if (exhibitionId) {
        query = query.eq('exhibition_id', exhibitionId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn('[Supabase] getLeads failed, using fallback:', e);
      return null;
    }
  }

  // 更新客戶機會階段 (下拉選單觸發)
  async updateLeadStage(leadId, stage) {
    if (!this.client) this.init();
    if (!this.client) return false;
    try {
      const { error } = await this.client
        .from('exhibition_leads')
        .update({
          stage: stage,
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('[Supabase] updateLeadStage error:', e);
      return false;
    }
  }

  // 更新完整客戶資料
  async upsertLead(lead) {
    if (!this.client) this.init();
    if (!this.client) return false;
    try {
      const record = {
        id: lead.id,
        exhibition_id: lead.exhibition_id,
        category: lead.category,
        category_raw: lead.category_raw,
        seq_no: lead.seq_no,
        company: lead.company,
        title: lead.title,
        name: lead.name,
        mobile: lead.mobile,
        phone: lead.phone,
        email: lead.email,
        address: lead.address,
        sales_rep: lead.sales_rep,
        notes: lead.notes,
        tax_and_business: lead.tax_and_business,
        stage: lead.stage,
        estimated_capacity: lead.estimated_capacity,
        priority: lead.priority,
        updated_at: new Date().toISOString()
      };
      const { error } = await this.client
        .from('exhibition_leads')
        .upsert(record, { onConflict: 'id' });
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('[Supabase] upsertLead error:', e);
      return false;
    }
  }

  // 取得現場問卷清單
  async getSurveys(exhibitionId = null) {
    if (!this.client) this.init();
    if (!this.client) return null;
    try {
      let query = this.client
        .from('exhibition_surveys')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (exhibitionId) {
        query = query.eq('exhibition_id', exhibitionId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn('[Supabase] getSurveys failed, using fallback:', e);
      return null;
    }
  }

  // 新增現場訪客問卷 (掃描 QR Code 提交)
  async createSurvey(survey) {
    if (!this.client) this.init();
    if (!this.client) return false;
    try {
      const record = {
        id: survey.id || `survey_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        exhibition_id: survey.exhibition_id,
        name: survey.name,
        company: survey.company,
        phone: survey.phone,
        email: survey.email,
        energy_demand: survey.energy_demand,
        building_type: survey.building_type,
        building_area: survey.building_area,
        concerns: survey.concerns,
        submitted_at: survey.submitted_at || new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
        duration_seconds: survey.duration_seconds || '0',
        ip: survey.ip || 'Client Direct',
        notes: survey.notes || ''
      };
      const { error } = await this.client
        .from('exhibition_surveys')
        .insert([record]);
      if (error) throw error;
      return record;
    } catch (e) {
      console.warn('[Supabase] createSurvey error:', e);
      return false;
    }
  }

  // 一鍵將本地所有種子資料（展會、名片、問卷）批量同步至 Supabase
  async batchSyncAllToCloud(exhibitions, leads, surveys) {
    if (!this.client) this.init();
    if (!this.client) return { success: false, message: '尚未初始化 Supabase' };
    
    try {
      // 1. 同步展會
      if (exhibitions && exhibitions.length > 0) {
        const exRecords = exhibitions.map(e => ({
          id: e.id,
          code: e.code,
          name: e.name,
          date_range: e.date_range,
          venue: e.venue,
          theme: e.theme,
          status: e.status,
          status_badge: e.status_badge,
          description: e.description
        }));
        await this.client.from('exhibitions').upsert(exRecords, { onConflict: 'id' });
      }

      // 2. 同步客戶機會
      if (leads && leads.length > 0) {
        const leadRecords = leads.map(l => ({
          id: l.id,
          exhibition_id: l.exhibition_id,
          category: l.category,
          category_raw: l.category_raw,
          seq_no: l.seq_no,
          company: l.company,
          title: l.title,
          name: l.name,
          mobile: l.mobile,
          phone: l.phone,
          email: l.email,
          address: l.address,
          sales_rep: l.sales_rep,
          notes: l.notes,
          tax_and_business: l.tax_and_business,
          stage: l.stage,
          estimated_capacity: l.estimated_capacity,
          priority: l.priority
        }));
        await this.client.from('exhibition_leads').upsert(leadRecords, { onConflict: 'id' });
      }

      // 3. 同步問卷
      if (surveys && surveys.length > 0) {
        const surveyRecords = surveys.map(s => ({
          id: s.id,
          exhibition_id: s.exhibition_id,
          name: s.name,
          company: s.company,
          phone: s.phone,
          email: s.email,
          energy_demand: s.energy_demand,
          building_type: s.building_type,
          building_area: s.building_area,
          concerns: s.concerns,
          submitted_at: s.submitted_at,
          duration_seconds: s.duration_seconds,
          ip: s.ip,
          notes: s.notes
        }));
        await this.client.from('exhibition_surveys').upsert(surveyRecords, { onConflict: 'id' });
      }

      return { success: true, message: `成功同步 ${exhibitions.length} 場展會、${leads.length} 筆客戶名片、${surveys.length} 筆問卷至 Supabase！` };
    } catch (e) {
      console.error('[Supabase] batchSync error:', e);
      return { success: false, message: e.message || '同步失敗' };
    }
  }
}

window.supabaseManager = new ExhibitionSupabaseManager();
