-- ==============================================================================
-- 進金生能源 6692｜展覽客戶機會管理平台 (Exhibition Client Lead Management Platform)
-- Supabase PostgreSQL 結構腳本與 RLS 行級安全規範
-- ==============================================================================

-- 1. 展會資料表 (Exhibitions)
CREATE TABLE IF NOT EXISTS exhibitions (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    date_range TEXT,
    venue TEXT,
    theme TEXT,
    status TEXT DEFAULT '進行中',
    status_badge TEXT DEFAULT 'active',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 展會訪客與客戶機會資料表 (Exhibition Leads)
CREATE TABLE IF NOT EXISTS exhibition_leads (
    id TEXT PRIMARY KEY,
    exhibition_id TEXT REFERENCES exhibitions(id) ON DELETE SET NULL,
    category TEXT DEFAULT '其他',
    category_raw TEXT,
    seq_no INTEGER,
    company TEXT NOT NULL,
    title TEXT,
    name TEXT,
    mobile TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    sales_rep TEXT DEFAULT '待指派',
    notes TEXT,
    tax_and_business TEXT,
    stage TEXT DEFAULT '初次接觸',
    estimated_capacity TEXT DEFAULT '未定',
    priority TEXT DEFAULT '中',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 現場訪客問卷資料表 (Exhibition Surveys)
CREATE TABLE IF NOT EXISTS exhibition_surveys (
    id TEXT PRIMARY KEY,
    exhibition_id TEXT REFERENCES exhibitions(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    email TEXT,
    energy_demand TEXT,
    building_type TEXT,
    building_area TEXT,
    concerns TEXT,
    submitted_at TEXT,
    duration_seconds TEXT,
    ip TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 索引優化 (Indexes for High-Performance Queries)
CREATE INDEX IF NOT EXISTS idx_leads_exhibition_id ON exhibition_leads(exhibition_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON exhibition_leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_sales_rep ON exhibition_leads(sales_rep);
CREATE INDEX IF NOT EXISTS idx_leads_company ON exhibition_leads(company);
CREATE INDEX IF NOT EXISTS idx_surveys_exhibition_id ON exhibition_surveys(exhibition_id);

-- 5. 強制啟用 RLS (Row Level Security) 行級安全策略
ALTER TABLE exhibitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exhibition_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE exhibition_surveys ENABLE ROW LEVEL SECURITY;

-- 6. 權限策略 (支援純前端 GitHub Pages 免設定即開即用)
-- 展會資料表權限
DROP POLICY IF EXISTS "Public Read Exhibitions" ON exhibitions;
CREATE POLICY "Public Read Exhibitions" ON exhibitions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Exhibitions" ON exhibitions;
CREATE POLICY "Public Insert Exhibitions" ON exhibitions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public Update Exhibitions" ON exhibitions;
CREATE POLICY "Public Update Exhibitions" ON exhibitions FOR UPDATE USING (true);

-- 客戶機會資料表權限
DROP POLICY IF EXISTS "Public Read Leads" ON exhibition_leads;
CREATE POLICY "Public Read Leads" ON exhibition_leads FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Leads" ON exhibition_leads;
CREATE POLICY "Public Insert Leads" ON exhibition_leads FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public Update Leads" ON exhibition_leads;
CREATE POLICY "Public Update Leads" ON exhibition_leads FOR UPDATE USING (true);

-- 現場問卷資料表權限 (客戶掃描 QR Code 提交)
DROP POLICY IF EXISTS "Public Read Surveys" ON exhibition_surveys;
CREATE POLICY "Public Read Surveys" ON exhibition_surveys FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public Insert Surveys" ON exhibition_surveys;
CREATE POLICY "Public Insert Surveys" ON exhibition_surveys FOR INSERT WITH CHECK (true);

-- ==============================================================================
-- 執行完畢！資料表與行級安全政策已就緒。
-- ==============================================================================
