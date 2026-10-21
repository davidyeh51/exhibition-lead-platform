/**
 * 進金生能源 6692｜展覽客戶機會管理平台 (Exhibition Client Lead CRM)
 * Vue 3 響應式前端業務邏輯
 */

const { createApp, ref, computed, onMounted, watch, nextTick } = Vue;

const app = createApp({
  setup() {
    // 1. 導航與視圖狀態
    const activeTab = ref('hub'); // 'hub', 'leads', 'tracking', 'appendix'
    const viewMode = ref('cards'); // 'cards', 'table'
    const showNewLeadModal = ref(false);
    const showNewExhibitionModal = ref(false);
    const showSupabaseModal = ref(false);
    const showLeadDetailModal = ref(false);
    const showSurveyFormModal = ref(false);
    const selectedLead = ref(null);
    const notification = ref({ show: false, message: '', type: 'success' });

    // 2. 核心資料集 (優先從雲端讀取，離線或冷啟動時使用 SEED 資料)
    const exhibitions = ref([...(window.SEED_EXHIBITIONS || [])]);
    const currentExhibitionId = ref('exhibition_2026_taichung_ai');
    const leads = ref([...(window.SEED_LEADS || [])]);
    const surveys = ref([...(window.SEED_SURVEYS || [])]);
    const opportunityStages = ref([...(window.OPPORTUNITY_STAGES || [])]);

    // 3. Supabase 連線狀態
    const supabaseUrl = ref(window.supabaseManager?.url || '');
    const supabaseKey = ref(window.supabaseManager?.key || '');
    const isSupabaseConnected = ref(false);
    const isTableReady = ref(false);
    const supabaseTesting = ref(false);
    const supabaseSyncing = ref(false);
    const sqlCopied = ref(false);

    // 4. 關鍵字搜尋與篩選狀態
    const searchQuery = ref('');
    const filterCategory = ref('全部');
    const filterSalesRep = ref('全部');
    const filterStage = ref('全部');
    const filterPriority = ref('全部');
    const sortBy = ref('seq_no_asc'); // 'seq_no_asc', 'priority_desc', 'updated_desc'

    // 5. 新增名片表單
    const newLeadForm = ref({
      company: '',
      name: '',
      title: '',
      category: '光電',
      mobile: '',
      phone: '',
      email: '',
      address: '',
      sales_rep: 'Jane',
      stage: '初次接觸',
      priority: '中',
      notes: '',
      tax_and_business: ''
    });

    // 6. 新增展會表單
    const newExhibitionForm = ref({
      code: '',
      name: '',
      date_range: '',
      venue: '',
      theme: '',
      description: ''
    });

    // 7. 現場客戶問卷表單
    const surveyForm = ref({
      name: '',
      company: '',
      phone: '',
      email: '',
      energyDemands: [],
      building_type: '自有廠房',
      building_area: '100~500 坪',
      concerns: [],
      notes: ''
    });
    const surveySubmitting = ref(false);
    const surveySuccess = ref(false);

    // ==========================================
    // 計算屬性 (Computed Properties)
    // ==========================================

    // 當前選取的展會物件
    const currentExhibition = computed(() => {
      return exhibitions.value.find(e => e.id === currentExhibitionId.value) || exhibitions.value[0];
    });

    // 該展會下的所有名片客戶
    const exhibitionLeads = computed(() => {
      return leads.value.filter(l => l.exhibition_id === currentExhibitionId.value);
    });

    // 該展會下的所有問卷
    const exhibitionSurveys = computed(() => {
      return surveys.value.filter(s => s.exhibition_id === currentExhibitionId.value);
    });

    // 業務人員列表 (去重)
    const salesRepList = computed(() => {
      const set = new Set();
      exhibitionLeads.value.forEach(l => {
        if (l.sales_rep) {
          l.sales_rep.split(/[\/,]/).forEach(r => {
            const cleanR = r.trim();
            if (cleanR) set.add(cleanR);
          });
        }
      });
      return ['全部', ...Array.from(set)];
    });

    // 多維度篩選與搜尋過濾後的客戶名冊
    const filteredLeads = computed(() => {
      let list = exhibitionLeads.value;

      // 1. 關鍵字搜尋 (支援公司、姓名、電話、手機、統編、備註、地址、職稱)
      if (searchQuery.value && searchQuery.value.trim() !== '') {
        const q = searchQuery.value.toLowerCase().trim();
        list = list.filter(item => {
          return (item.company && item.company.toLowerCase().includes(q)) ||
                 (item.name && item.name.toLowerCase().includes(q)) ||
                 (item.title && item.title.toLowerCase().includes(q)) ||
                 (item.mobile && item.mobile.toLowerCase().includes(q)) ||
                 (item.phone && item.phone.toLowerCase().includes(q)) ||
                 (item.email && item.email.toLowerCase().includes(q)) ||
                 (item.address && item.address.toLowerCase().includes(q)) ||
                 (item.notes && item.notes.toLowerCase().includes(q)) ||
                 (item.tax_and_business && item.tax_and_business.toLowerCase().includes(q)) ||
                 (item.sales_rep && item.sales_rep.toLowerCase().includes(q));
        });
      }

      // 2. 分類篩選
      if (filterCategory.value !== '全部') {
        list = list.filter(item => item.category === filterCategory.value);
      }

      // 3. 負責業務篩選
      if (filterSalesRep.value !== '全部') {
        list = list.filter(item => item.sales_rep && item.sales_rep.includes(filterSalesRep.value));
      }

      // 4. 機會階段篩選
      if (filterStage.value !== '全部') {
        list = list.filter(item => item.stage === filterStage.value);
      }

      // 5. 優先級篩選
      if (filterPriority.value !== '全部') {
        list = list.filter(item => item.priority === filterPriority.value);
      }

      // 6. 排序
      list = [...list].sort((a, b) => {
        if (sortBy.value === 'seq_no_asc') {
          return (a.seq_no || 999) - (b.seq_no || 999);
        } else if (sortBy.value === 'priority_desc') {
          const pMap = { '高': 3, '中': 2, '一般': 1 };
          return (pMap[b.priority] || 0) - (pMap[a.priority] || 0);
        } else if (sortBy.value === 'updated_desc') {
          return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
        }
        return 0;
      });

      return list;
    });

    // 機會階段看板分組統計
    const stageSummary = computed(() => {
      const summary = {};
      opportunityStages.value.forEach(s => {
        summary[s.name] = {
          stage: s,
          count: 0,
          percentage: 0,
          leads: []
        };
      });

      const total = exhibitionLeads.value.length;
      exhibitionLeads.value.forEach(lead => {
        const sName = lead.stage || '初次接觸';
        if (summary[sName]) {
          summary[sName].count += 1;
          summary[sName].leads.push(lead);
        }
      });

      if (total > 0) {
        Object.keys(summary).forEach(k => {
          summary[k].percentage = Math.round((summary[k].count / total) * 100);
        });
      }

      return summary;
    });

    // 展會關鍵指標 (KPIs)
    const kpis = computed(() => {
      const totalLeads = exhibitionLeads.value.length;
      const totalSurveys = exhibitionSurveys.value.length;
      const solarLeads = exhibitionLeads.value.filter(l => l.category === '光電').length;
      const storageLeads = exhibitionLeads.value.filter(l => l.category === '儲能').length;
      const wonLeads = exhibitionLeads.value.filter(l => l.stage === '贏單簽約').length;
      const activeOpportunity = exhibitionLeads.value.filter(l => ['需求確認', '場勘/技術評估', '方案報價', '商務談判'].includes(l.stage)).length;

      return {
        totalLeads,
        totalSurveys,
        solarLeads,
        storageLeads,
        wonLeads,
        activeOpportunity
      };
    });

    // ==========================================
    // 核心動作方法 (Action Handlers)
    // ==========================================

    // 切換展會
    const selectExhibition = (exId) => {
      currentExhibitionId.value = exId;
      notify(`已切換至「${currentExhibition.value.name}」`, 'info');
      nextTick(() => {
        renderQrCode();
        if (window.lucide) window.lucide.createIcons();
      });
    };

    // 機會階段下拉切換 (核心需求 5)
    const onStageChange = async (lead, newStage) => {
      lead.stage = newStage;
      lead.updated_at = new Date().toISOString();
      notify(`已將 ${lead.company} 階段更新為「${newStage}」`, 'success');

      // 觸發音效或特效 (若贏單)
      if (newStage === '贏單簽約' && window.confetti) {
        window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }

      // 非同步持久化至 Supabase
      if (window.supabaseManager) {
        const ok = await window.supabaseManager.updateLeadStage(lead.id, newStage);
        if (!ok) {
          console.log('[Supabase] Stage updated locally. Will sync to cloud when connected.');
        }
      }
    };

    // 業務責任指派切換
    const onSalesRepChange = async (lead, newRep) => {
      lead.sales_rep = newRep;
      lead.updated_at = new Date().toISOString();
      notify(`已指派 ${lead.company} 給業務「${newRep}」`, 'info');

      if (window.supabaseManager) {
        await window.supabaseManager.upsertLead(lead);
      }
    };

    // 優先度切換
    const togglePriority = async (lead) => {
      const order = ['一般', '中', '高'];
      const nextIdx = (order.indexOf(lead.priority) + 1) % order.length;
      lead.priority = order[nextIdx];
      lead.updated_at = new Date().toISOString();

      if (window.supabaseManager) {
        await window.supabaseManager.upsertLead(lead);
      }
    };

    // 開啟名片詳情抽屜
    const openLeadDetail = (lead) => {
      selectedLead.value = { ...lead };
      showLeadDetailModal.value = true;
    };

    // 儲存名片詳情修改
    const saveLeadDetail = async () => {
      if (!selectedLead.value) return;
      const idx = leads.value.findIndex(l => l.id === selectedLead.value.id);
      if (idx !== -1) {
        leads.value[idx] = { ...selectedLead.value, updated_at: new Date().toISOString() };
        if (window.supabaseManager) {
          await window.supabaseManager.upsertLead(leads.value[idx]);
        }
      }
      showLeadDetailModal.value = false;
      notify('客戶資訊已成功更新！', 'success');
    };

    // 新增手動名片
    const createNewLead = async () => {
      if (!newLeadForm.value.company || !newLeadForm.value.name) {
        alert('請填寫公司名稱與聯絡人姓名！');
        return;
      }

      const newId = `lead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const leadItem = {
        id: newId,
        exhibition_id: currentExhibitionId.value,
        category: newLeadForm.value.category,
        category_raw: newLeadForm.value.category,
        seq_no: exhibitionLeads.value.length + 1,
        company: newLeadForm.value.company,
        title: newLeadForm.value.title,
        name: newLeadForm.value.name,
        mobile: newLeadForm.value.mobile,
        phone: newLeadForm.value.phone,
        email: newLeadForm.value.email,
        address: newLeadForm.value.address,
        sales_rep: newLeadForm.value.sales_rep,
        stage: newLeadForm.value.stage,
        priority: newLeadForm.value.priority,
        notes: newLeadForm.value.notes,
        tax_and_business: newLeadForm.value.tax_and_business,
        estimated_capacity: '未定',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      leads.value.unshift(leadItem);
      showNewLeadModal.value = false;
      notify(`已成功新增客戶「${leadItem.company}」！`, 'success');

      if (window.supabaseManager) {
        await window.supabaseManager.upsertLead(leadItem);
      }

      // 重置表單
      newLeadForm.value = {
        company: '',
        name: '',
        title: '',
        category: '光電',
        mobile: '',
        phone: '',
        email: '',
        address: '',
        sales_rep: 'Jane',
        stage: '初次接觸',
        priority: '中',
        notes: '',
        tax_and_business: ''
      };
    };

    // 新增展會
    const createNewExhibition = async () => {
      if (!newExhibitionForm.value.name || !newExhibitionForm.value.code) {
        alert('請填寫展會代碼與展會名稱！');
        return;
      }

      const newExId = `exhibition_${newExhibitionForm.value.code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const newEx = {
        id: newExId,
        code: newExhibitionForm.value.code,
        name: newExhibitionForm.value.name,
        date_range: newExhibitionForm.value.date_range || '未定',
        venue: newExhibitionForm.value.venue || '未定',
        theme: newExhibitionForm.value.theme || '綜合商機展',
        status: '規劃中',
        status_badge: 'planning',
        description: newExhibitionForm.value.description || '',
        leads_count: 0,
        surveys_count: 0,
        badge_color: 'indigo'
      };

      exhibitions.value.push(newEx);
      currentExhibitionId.value = newExId;
      showNewExhibitionModal.value = false;
      notify(`已成功建立新展會「${newEx.name}」，已切換為當前展會！`, 'success');

      if (window.supabaseManager) {
        await window.supabaseManager.batchSyncAllToCloud([newEx], [], []);
      }
    };

    // 提交現場問卷 (客戶掃碼或現場人員填寫)
    const submitSurveyForm = async () => {
      if (!surveyForm.value.name || !surveyForm.value.company || !surveyForm.value.phone) {
        alert('請填寫必填欄位：姓名、公司名稱、聯絡電話！');
        return;
      }

      surveySubmitting.value = true;
      const energyDemandsStr = surveyForm.value.energyDemands.join('\n');
      const concernsStr = surveyForm.value.concerns.join('\n');

      const surveyItem = {
        id: `survey_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        exhibition_id: currentExhibitionId.value,
        name: surveyForm.value.name,
        company: surveyForm.value.company,
        phone: surveyForm.value.phone,
        email: surveyForm.value.email,
        energy_demand: energyDemandsStr,
        building_type: surveyForm.value.building_type,
        building_area: surveyForm.value.building_area,
        concerns: concernsStr,
        submitted_at: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
        duration_seconds: '60',
        ip: '現場 QR Code 掃描送出',
        notes: surveyForm.value.notes
      };

      // 儲存至本機問卷清冊
      surveys.value.unshift(surveyItem);

      // 自動將問卷轉為潛在客戶商機
      const leadItem = {
        id: `lead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        exhibition_id: currentExhibitionId.value,
        category: energyDemandsStr.includes('儲能') ? '儲能' : '光電',
        category_raw: '現場問卷轉入',
        seq_no: exhibitionLeads.value.length + 1,
        company: surveyForm.value.company,
        title: '問卷填答代表',
        name: surveyForm.value.name,
        mobile: surveyForm.value.phone,
        phone: '',
        email: surveyForm.value.email,
        address: '',
        sales_rep: '待指派',
        stage: '初次接觸',
        priority: '高',
        notes: `【問卷需求】${energyDemandsStr.replace(/\n/g, '、')}。\n【建物面積】${surveyForm.value.building_type} / ${surveyForm.value.building_area}。\n【在意重點】${concernsStr.replace(/\n/g, '、')}。\n【備註】${surveyForm.value.notes}`,
        tax_and_business: '現場問卷進線',
        estimated_capacity: '待評估',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      leads.value.unshift(leadItem);

      // 同步至 Supabase
      if (window.supabaseManager) {
        await window.supabaseManager.createSurvey(surveyItem);
        await window.supabaseManager.upsertLead(leadItem);
      }

      surveySubmitting.value = false;
      surveySuccess.value = true;
      if (window.confetti) {
        window.confetti({ particleCount: 80, spread: 60 });
      }

      setTimeout(() => {
        surveySuccess.value = false;
        showSurveyFormModal.value = false;
        // 重置表單
        surveyForm.value = {
          name: '',
          company: '',
          phone: '',
          email: '',
          energyDemands: [],
          building_type: '自有廠房',
          building_area: '100~500 坪',
          concerns: [],
          notes: ''
        };
        notify('問卷已成功送達進金生能源專業團隊，並已自動建立客戶商機！', 'success');
      }, 2000);
    };

    // 將歷史問卷轉為商機
    const convertSurveyToLead = async (survey) => {
      const exists = leads.value.some(l => l.name === survey.name || (l.company && l.company === survey.company && survey.company !== '無'));
      if (exists) {
        notify(`該客戶「${survey.name} (${survey.company})」已在商機名冊中！`, 'info');
        return;
      }

      const newLead = {
        id: `lead_survey_${Date.now()}`,
        exhibition_id: currentExhibitionId.value,
        category: (survey.energy_demand && survey.energy_demand.includes('儲能')) ? '儲能' : '光電',
        category_raw: '問卷手動轉入',
        seq_no: exhibitionLeads.value.length + 1,
        company: survey.company || '未提供公司',
        title: '訪客代表',
        name: survey.name,
        mobile: survey.phone,
        phone: '',
        email: survey.email,
        address: '',
        sales_rep: 'Vanessa',
        stage: '需求確認',
        priority: '高',
        notes: `問卷轉入商機：\n需求：${survey.energy_demand}\n建物：${survey.building_type} (${survey.building_area})\n在意點：${survey.concerns}`,
        tax_and_business: '問卷自動建檔',
        estimated_capacity: '待評估',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      leads.value.unshift(newLead);
      notify(`已將問卷填答者「${survey.name}」轉入客戶機會庫！`, 'success');

      if (window.supabaseManager) {
        await window.supabaseManager.upsertLead(newLead);
      }
    };

    // 動態生成 QR Code
    const renderQrCode = () => {
      const container = document.getElementById('qrcode-canvas');
      if (!container) return;
      container.innerHTML = '';

      // 生成問卷網址 (包含展會參數)
      const currentUrl = window.location.origin + window.location.pathname;
      const surveyUrl = `${currentUrl}?tab=appendix&exhibition=${currentExhibitionId.value}&action=survey`;

      if (window.QRCode) {
        try {
          new window.QRCode(container, {
            text: surveyUrl,
            width: 180,
            height: 180,
            colorDark: "#051C2C",
            colorLight: "#ffffff",
            correctLevel: window.QRCode.CorrectLevel.H
          });
        } catch (e) {
          console.warn('QRCode render error:', e);
        }
      }
    };

    // 複製問卷直連網址
    const copySurveyUrl = () => {
      const currentUrl = window.location.origin + window.location.pathname;
      const surveyUrl = `${currentUrl}?tab=appendix&exhibition=${currentExhibitionId.value}&action=survey`;
      navigator.clipboard.writeText(surveyUrl).then(() => {
        notify('問卷專屬連結已複製至剪貼簿！可直接張貼於通訊軟體或傳送給客戶。', 'success');
      });
    };

    // 測試並儲存 Supabase 連線
    const testAndSaveSupabase = async () => {
      supabaseTesting.value = true;
      if (window.supabaseManager) {
        window.supabaseManager.saveConfig(supabaseUrl.value, supabaseKey.value);
        const res = await window.supabaseManager.testConnection();
        isSupabaseConnected.value = res.connected;
        isTableReady.value = res.tableReady;
        notify(res.message, res.connected ? 'success' : 'error');

        // 若資料表已準備就緒，嘗試拉取雲端資料
        if (res.connected && res.tableReady) {
          await loadDataFromCloud();
        }
      }
      supabaseTesting.value = false;
    };

    // 一鍵將本地資料同步至 Supabase 雲端
    const syncLocalToCloud = async () => {
      supabaseSyncing.value = true;
      if (window.supabaseManager) {
        const res = await window.supabaseManager.batchSyncAllToCloud(
          exhibitions.value,
          leads.value,
          surveys.value
        );
        notify(res.message, res.success ? 'success' : 'error');
        if (res.success && window.confetti) {
          window.confetti({ particleCount: 70, spread: 50 });
        }
      }
      supabaseSyncing.value = false;
    };

    // 從雲端載入最新資料
    const loadDataFromCloud = async () => {
      if (!window.supabaseManager) return;
      const [cloudEx, cloudLeads, cloudSurveys] = await Promise.all([
        window.supabaseManager.getExhibitions(),
        window.supabaseManager.getLeads(),
        window.supabaseManager.getSurveys()
      ]);

      if (cloudEx && cloudEx.length > 0) exhibitions.value = cloudEx;
      if (cloudLeads && cloudLeads.length > 0) leads.value = cloudLeads;
      if (cloudSurveys && cloudSurveys.length > 0) surveys.value = cloudSurveys;
      console.log('[Supabase] Loaded data from cloud successfully.');
    };

    // 複製 SQL 結構腳本
    const copySqlSchema = () => {
      fetch('./supabase-schema.sql')
        .then(res => res.text())
        .then(sql => {
          navigator.clipboard.writeText(sql);
          sqlCopied.value = true;
          setTimeout(() => sqlCopied.value = false, 3000);
          notify('已複製 supabase-schema.sql 完整內容至剪貼簿！', 'success');
        })
        .catch(e => {
          notify('讀取 supabase-schema.sql 失敗，請直接由專案目錄開啟。', 'error');
        });
    };

    // 匯出 CSV 報表
    const exportToCsv = () => {
      const headers = ['編號', '分類', '公司名稱', '姓名', '職稱', '行動電話', '市話', 'Email', '地址', '負責業務', '機會階段', '優先度', '名片備註', '經營事項'];
      const rows = exhibitionLeads.value.map(l => [
        l.seq_no,
        l.category,
        `"${(l.company || '').replace(/"/g, '""')}"`,
        `"${(l.name || '').replace(/"/g, '""')}"`,
        `"${(l.title || '').replace(/"/g, '""')}"`,
        `"${(l.mobile || '').replace(/"/g, '""')}"`,
        `"${(l.phone || '').replace(/"/g, '""')}"`,
        `"${(l.email || '').replace(/"/g, '""')}"`,
        `"${(l.address || '').replace(/"/g, '""')}"`,
        `"${(l.sales_rep || '').replace(/"/g, '""')}"`,
        `"${(l.stage || '').replace(/"/g, '""')}"`,
        `"${(l.priority || '').replace(/"/g, '""')}"`,
        `"${(l.notes || '').replace(/"/g, '""')}"`,
        `"${(l.tax_and_business || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${currentExhibition.value.code}_客戶機會名冊_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      notify('已成功匯出 CSV 檔案！', 'success');
    };

    // 彈出 Toast 訊息
    const notify = (msg, type = 'success') => {
      notification.value = { show: true, message: msg, type: type };
      setTimeout(() => {
        notification.value.show = false;
      }, 3500);
    };

    // 生命週期初始化
    onMounted(async () => {
      // 處理 URL 參數 (如客戶掃碼直達問卷)
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      const exParam = urlParams.get('exhibition');
      const actionParam = urlParams.get('action');

      if (tabParam) activeTab.value = tabParam;
      if (exParam) {
        const found = exhibitions.value.find(e => e.id === exParam || e.code === exParam);
        if (found) currentExhibitionId.value = found.id;
      }
      if (actionParam === 'survey') {
        activeTab.value = 'appendix';
        showSurveyFormModal.value = true;
      }

      // 初始化 Supabase
      if (window.supabaseManager) {
        const res = await window.supabaseManager.testConnection();
        isSupabaseConnected.value = res.connected;
        isTableReady.value = res.tableReady;
        if (res.connected && res.tableReady) {
          await loadDataFromCloud();
        }
      }

      nextTick(() => {
        renderQrCode();
        if (window.lucide) window.lucide.createIcons();
      });
    });

    // 監聽 Tab 切換時重新繪製 Icons 與 QR Code
    watch(activeTab, (newTab) => {
      nextTick(() => {
        if (newTab === 'appendix') renderQrCode();
        if (window.lucide) window.lucide.createIcons();
      });
    });

    return {
      activeTab,
      viewMode,
      showNewLeadModal,
      showNewExhibitionModal,
      showSupabaseModal,
      showLeadDetailModal,
      showSurveyFormModal,
      selectedLead,
      notification,
      exhibitions,
      currentExhibitionId,
      currentExhibition,
      leads,
      surveys,
      opportunityStages,
      supabaseUrl,
      supabaseKey,
      isSupabaseConnected,
      isTableReady,
      supabaseTesting,
      supabaseSyncing,
      sqlCopied,
      searchQuery,
      filterCategory,
      filterSalesRep,
      filterStage,
      filterPriority,
      sortBy,
      newLeadForm,
      newExhibitionForm,
      surveyForm,
      surveySubmitting,
      surveySuccess,
      exhibitionLeads,
      exhibitionSurveys,
      salesRepList,
      filteredLeads,
      stageSummary,
      kpis,
      selectExhibition,
      onStageChange,
      onSalesRepChange,
      togglePriority,
      openLeadDetail,
      saveLeadDetail,
      createNewLead,
      createNewExhibition,
      submitSurveyForm,
      convertSurveyToLead,
      copySurveyUrl,
      testAndSaveSupabase,
      syncLocalToCloud,
      copySqlSchema,
      exportToCsv,
      notify
    };
  }
});

app.mount('#app');
