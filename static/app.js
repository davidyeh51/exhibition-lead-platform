/**
 * 進金生能源 6692｜展覽客戶機會管理平台 (Exhibition Client Lead CRM)
 * Vue 3 響應式前端業務邏輯
 * 包含：多展會擴充、關鍵字檢索、即時下拉機會追蹤、AI現場訪談速記/語音解析、冷凍空調專屬診斷、雙模QR Code
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
    const showAiNoteModal = ref(false);         // AI 現場訪談速記/語音解析彈窗
    const showDiagnosticModal = ref(false);     // 冷凍空調 1 分鐘現場診斷彈窗
    const showKioskModal = ref(false);          // 攤位全螢幕立牌模式
    const selectedLead = ref(null);
    const notification = ref({ show: false, message: '', type: 'success' });

    // 2. 核心資料集 (預設以當前正在參展的「2026 台灣國際冷凍空調綠能科技展」為當前展會)
    const exhibitions = ref([...(window.SEED_EXHIBITIONS || [])]);
    const currentExhibitionId = ref(
      (window.SEED_EXHIBITIONS && window.SEED_EXHIBITIONS.length > 0) 
        ? window.SEED_EXHIBITIONS[0].id 
        : 'exhibition_2026_rhvac_tw'
    );
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
      category: '儲能',
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
      building_type: '自有廠房 (低溫冷鏈/冷凍庫)',
      building_area: '100~500 坪',
      concerns: [],
      notes: ''
    });
    const surveySubmitting = ref(false);
    const surveySuccess = ref(false);

    // 8. 🎙️ AI 現場訪談速記 / 語音解析入庫模組 (On-site AI Voice/Notes Capture)
    const rawAiNote = ref('');
    const isRecordingVoice = ref(false);
    const voiceSupported = ref(typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window));
    let recognitionInstance = null;
    const parsedAiLead = ref(null);
    const aiParsing = ref(false);

    // 9. ❄️ 冷凍空調綠能展「1 分鐘現場快速訪談診斷卡」 (RHVAC Rapid Diagnostic Wizard)
    const diagnosticForm = ref({
      clientCompany: '',
      clientName: '',
      clientPhone: '',
      facilityType: '低溫物流倉儲 (冷鏈)',
      painPoints: ['夏季高尖峰電費暴增', '壓縮機啟動超約附加費'],
      scale: '契約容量 500kW 以上 / 每月電費 150 萬以上',
      roofArea: '1,000 坪以上',
      salesRep: 'Jane'
    });

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

    // 冷凍空調智能診斷結果計算
    const diagnosticRecommendation = computed(() => {
      const f = diagnosticForm.value;
      const isColdChain = f.facilityType.includes('冷鏈') || f.facilityType.includes('冷凍');
      const isBig = f.scale.includes('150 萬') || f.scale.includes('500kW');
      
      let storageCapacity = isBig ? '500kW / 1,000kWh' : '250kW / 500kWh';
      let solarCapacity = '約 300kWp ~ 500kWp (視屋頂實測面積)';
      let estSavings = isBig ? '每年預估節省契約容量超約費與流動電費 NT$ 40~65 萬元' : '每年預估節省電費 NT$ 20~35 萬元';
      let roofCooling = '屋頂鋪設光電實測可降低頂樓樓板溫度 3~5°C，直接降低空調壓縮機運轉耗能 8~12%';

      return {
        storageCapacity,
        solarCapacity,
        estSavings,
        roofCooling,
        primarySolution: isColdChain ? '表後儲能 (削峰填谷 + 防壓降備援)' : '屋頂光電隔熱自用 + 表後儲能削峰填谷'
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

      if (newStage === '贏單簽約' && window.confetti) {
        window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }

      if (window.supabaseManager) {
        await window.supabaseManager.updateLeadStage(lead.id, newStage);
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

    // 🎙️ 現場語音辨識直接錄入 (Web Speech API)
    const toggleVoiceRecognition = () => {
      if (!voiceSupported.value) {
        notify('您的瀏覽器不支援 Web Speech API，請直接輸入文字速記！', 'error');
        return;
      }

      if (isRecordingVoice.value) {
        // 停止錄音
        if (recognitionInstance) recognitionInstance.stop();
        isRecordingVoice.value = false;
        notify('語音錄音已結束，正在解析內容...', 'info');
      } else {
        // 開始錄音
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognitionInstance = new SpeechRecognition();
        recognitionInstance.lang = 'zh-TW';
        recognitionInstance.interimResults = true;
        recognitionInstance.continuous = true;

        recognitionInstance.onstart = () => {
          isRecordingVoice.value = true;
          notify('🎙️ 正在聆聽中... 請直接對著手機描述客戶對談重點！', 'info');
        };

        recognitionInstance.onresult = (event) => {
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
          }
          if (transcript) {
            rawAiNote.value = (rawAiNote.value ? rawAiNote.value + ' ' : '') + transcript;
          }
        };

        recognitionInstance.onerror = (event) => {
          console.warn('Speech error:', event.error);
          isRecordingVoice.value = false;
          notify(`語音辨識提示: ${event.error}`, 'info');
        };

        recognitionInstance.onend = () => {
          isRecordingVoice.value = false;
        };

        try {
          recognitionInstance.start();
        } catch (e) {
          console.warn('Speech start error:', e);
        }
      }
    };

    // 填入範本文字
    const applyAiTemplate = (type) => {
      if (type === 'coldchain') {
        rawAiNote.value = '剛才在南港冷凍空調展與台灣極鮮冷鏈的林總經理聊過，他在大園有3,500坪低溫冷凍倉儲，夏季冰水機全開每月電費高達220萬，時常被罰契約超約附加費。想了解進金生表後儲能500kW/1MWh削峰填谷，另外屋頂也想做太陽能隔熱降溫。電話0918-369-258，mail是kevin.lin@freshcold.com.tw，由Jane負責跟進，下週二前要出ROI試算。';
      } else if (type === 'hvac') {
        rawAiNote.value = '宏亞精密空調的陳副總，在台中工業區有廠房，頂樓夏天高溫45度導致冰水主機長時間超載耗電，想在屋頂做800坪光電隔熱降溫3-4度並全數轉自發自用。電話0932-159-874，chen.jd@hongya-hvac.com.tw，Vanessa跟進。';
      } else if (type === 'ups') {
        rawAiNote.value = '海霸王冷凍水產的張經理，前鎮廠房急需不斷電緊急備援儲能系統(防壓降)，避免台電瞬停造成急凍冷庫海鮮失溫。電話0922-987-654，Jane跟進，列為高優先等級。';
      }
    };

    // ⚡ AI 智能解析速記文字為結構化客戶機會 (Smart Heuristic Entity Extractor)
    const runAiParser = () => {
      if (!rawAiNote.value || !rawAiNote.value.trim()) {
        alert('請先輸入或語音錄製訪談速記文字！');
        return;
      }

      aiParsing.value = true;
      const text = rawAiNote.value.trim();

      const lead = {
        id: `lead_ai_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        exhibition_id: currentExhibitionId.value,
        company: '',
        name: '',
        title: '',
        category: '儲能',
        mobile: '',
        phone: '',
        email: '',
        address: '',
        sales_rep: 'Jane',
        stage: '需求確認',
        priority: '高',
        estimated_capacity: '待評估',
        notes: text,
        tax_and_business: '展會現場 AI 訪談速記提取'
      };

      // 1. 電話 / 手機 Regex
      const mobileMatch = text.match(/09\d{2}[-\s]?\d{3}[-\s]?\d{3}|09\d{8}/);
      if (mobileMatch) lead.mobile = mobileMatch[0].trim();

      const phoneMatch = text.match(/(0\d{1,2})[-\s]?(\d{6,8})(?:#\d+)?/);
      if (phoneMatch && (!mobileMatch || phoneMatch[0] !== mobileMatch[0])) {
        lead.phone = phoneMatch[0].trim();
      }

      // 2. Email Regex
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) lead.email = emailMatch[0].trim();

      // 3. 公司名稱抽取 (Heuristic)
      const compMatch = text.match(/([^\s，,、]+(?:公司|企業|廠|科技|物流|食品|機電|冷凍|空調|工業|醫院|商場|大樓|建經|國際))/);
      if (compMatch) {
        lead.company = compMatch[1].replace(/^(跟|與|拜訪|剛才|在|到)/, '').trim();
      } else {
        lead.company = '現場訪客 (待補公司)';
      }

      // 4. 職稱與姓名抽取
      const titleMatch = text.match(/(總經理|協理|副總|經理|廠長|主任|工程師|專員|董座|董事長|負責人|技師|建築師)/);
      if (titleMatch) {
        lead.title = titleMatch[0];
        const beforeTitle = text.substring(0, titleMatch.index);
        const nameCandidate = beforeTitle.match(/([^\s，,、]{1,4})$/);
        if (nameCandidate) {
          lead.name = nameCandidate[1].replace(/(的|與|跟)/, '');
        }
      }
      if (!lead.name) lead.name = '訪客代表';

      // 5. 分類 (光電 vs 儲能)
      if (text.includes('光電') || text.includes('太陽能') || text.includes('隔熱') || text.includes('屋頂')) {
        lead.category = text.includes('儲能') ? '儲能' : '光電';
      } else if (text.includes('儲能') || text.includes('削峰填谷') || text.includes('不斷電') || text.includes('超約') || text.includes('穩壓')) {
        lead.category = '儲能';
      }

      // 6. 業務擔當
      if (text.includes('Vanessa') || text.includes('小安')) lead.sales_rep = 'Vanessa';
      else if (text.includes('Jane') || text.includes('小珍')) lead.sales_rep = 'Jane';
      else if (text.includes('Lucy')) lead.sales_rep = 'Lucy';
      else if (text.includes('Duck')) lead.sales_rep = 'Duck';

      // 7. 案場面積與容量
      const areaMatch = text.match(/(\d+[\d,]*\s*坪)/);
      const capMatch = text.match(/(\d+[\d,]*\s*(?:kW|kWh|MWh|MWp|kWp|萬(?:元)?))/i);
      let estParts = [];
      if (areaMatch) estParts.push(areaMatch[0]);
      if (capMatch) estParts.push(capMatch[0]);
      if (estParts.length > 0) lead.estimated_capacity = estParts.join(' / ');

      // 8. 優先度
      if (text.includes('高優先') || text.includes('急需') || text.includes('下週') || text.includes('很有興趣') || text.includes('評估報告')) {
        lead.priority = '高';
        lead.stage = '需求確認';
      }

      parsedAiLead.value = lead;
      aiParsing.value = false;
      notify('AI 已完成結構化實體解析！請檢視預覽並點擊儲存入庫。', 'success');
    };

    // 儲存 AI 解析出的客戶名片入庫
    const saveAiLeadToCrm = async () => {
      if (!parsedAiLead.value) return;
      const lead = { ...parsedAiLead.value };
      lead.seq_no = exhibitionLeads.value.length + 1;
      lead.created_at = new Date().toISOString();
      lead.updated_at = new Date().toISOString();

      leads.value.unshift(lead);
      showAiNoteModal.value = false;
      parsedAiLead.value = null;
      rawAiNote.value = '';

      if (window.confetti) {
        window.confetti({ particleCount: 80, spread: 60 });
      }
      notify(`已成功將「${lead.company}」存入 CRM 並同步雲端！`, 'success');

      if (window.supabaseManager) {
        await window.supabaseManager.upsertLead(lead);
      }
    };

    // 冷凍空調 1 分鐘診斷快速存入 CRM
    const saveDiagnosticToCrm = async () => {
      const f = diagnosticForm.value;
      if (!f.clientCompany && !f.clientName) {
        alert('請至少填寫公司名稱或聯絡人！');
        return;
      }

      const rec = diagnosticRecommendation.value;
      const newLead = {
        id: `lead_diag_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        exhibition_id: currentExhibitionId.value,
        company: f.clientCompany || '冷凍空調展訪客',
        name: f.clientName || '貴賓',
        title: '現場診斷訪客',
        category: f.painPoints.some(p => p.includes('超約') || p.includes('尖峰') || p.includes('跳機')) ? '儲能' : '光電',
        category_raw: 'RHVAC 現場 1 分鐘診斷',
        seq_no: exhibitionLeads.value.length + 1,
        mobile: f.clientPhone,
        phone: '',
        email: '',
        address: '',
        sales_rep: f.salesRep || 'Jane',
        stage: '需求確認',
        priority: '高',
        estimated_capacity: `${rec.storageCapacity} / ${rec.solarCapacity}`,
        notes: `【RHVAC 現場能效診斷】\n* 設施類型：${f.facilityType}\n* 能源痛點：${f.painPoints.join('、')}\n* 用電規模：${f.scale}\n* 建議方案：${rec.primarySolution}\n* 效益估算：${rec.estSavings}，${rec.roofCooling}`,
        tax_and_business: '冷凍空調展 1 分鐘能效評估表',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      leads.value.unshift(newLead);
      showDiagnosticModal.value = false;
      if (window.confetti) window.confetti({ particleCount: 80, spread: 60 });
      notify(`已將「${newLead.company}」診斷結果成功存為客戶機會！`, 'success');

      if (window.supabaseManager) {
        await window.supabaseManager.upsertLead(newLead);
      }
    };

    // 複製診斷文字傳給客戶 (LINE / Email)
    const copyDiagnosticText = () => {
      const f = diagnosticForm.value;
      const rec = diagnosticRecommendation.value;
      const text = `【進金生能源 6692｜現場能源效益初步診斷報告】\n貴賓：${f.clientCompany || ''} ${f.clientName || ''} 您好！\n感謝您蒞臨南港 2 館「2026 台灣國際冷凍空調綠能展」進金生展位。\n針對貴公司【${f.facilityType}】之用電痛點：\n1. 建議規劃：${rec.primarySolution} (${rec.storageCapacity})\n2. 屋頂隔熱：${rec.solarCapacity}，頂樓可降低 3~5°C 省空調耗電\n3. 效益估算：${rec.estSavings}\n專屬業務顧問：${f.salesRep} 將於展後提供完整 ROI 模擬分析。`;
      
      navigator.clipboard.writeText(text).then(() => {
        notify('已複製診斷報告文案！可直接貼上 LINE 傳送給客戶。', 'success');
      });
    };

    // 動態生成 QR Code (雙重保障機制，100% 杜絕空白白塊！)
    const renderQrCode = () => {
      const container = document.getElementById('qrcode-canvas');
      const kioskContainer = document.getElementById('qrcode-kiosk-canvas');
      
      const currentUrl = window.location.origin + window.location.pathname;
      const surveyUrl = `${currentUrl}?tab=appendix&exhibition=${currentExhibitionId.value}&action=survey`;

      const drawTarget = (targetEl, size) => {
        if (!targetEl) return;
        targetEl.innerHTML = '';
        let ok = false;

        if (window.QRCode) {
          try {
            new window.QRCode(targetEl, {
              text: surveyUrl,
              width: size,
              height: size,
              colorDark: "#051C2C",
              colorLight: "#ffffff",
              correctLevel: window.QRCode.CorrectLevel.H
            });
            ok = true;
          } catch (e) {
            console.warn('QRCode render error:', e);
          }
        }

        // 100% 備份方案：若 JS 生成未成功，直接嵌入高解析度 API 圖片
        if (!ok || !targetEl.querySelector('canvas, img')) {
          const img = document.createElement('img');
          img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(surveyUrl)}&color=051C2C&bgcolor=FFFFFF&margin=2`;
          img.alt = '現場線上問卷 QR Code';
          img.className = 'rounded-lg shadow-sm border border-slate-200 object-contain mx-auto';
          img.style.width = `${size}px`;
          img.style.height = `${size}px`;
          targetEl.appendChild(img);
        }
      };

      drawTarget(container, 180);
      drawTarget(kioskContainer, 280);
    };

    // 複製問卷直連網址
    const copySurveyUrl = () => {
      const currentUrl = window.location.origin + window.location.pathname;
      const surveyUrl = `${currentUrl}?tab=appendix&exhibition=${currentExhibitionId.value}&action=survey`;
      navigator.clipboard.writeText(surveyUrl).then(() => {
        notify('問卷專屬連結已複製至剪貼簿！可直接張貼於通訊軟體或傳送給客戶。', 'success');
      });
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
        duration_seconds: '45',
        ip: '現場 QR Code 掃描送出 (南港二館)',
        notes: surveyForm.value.notes
      };

      surveys.value.unshift(surveyItem);

      // 自動將問卷轉為潛在客戶商機
      const leadItem = {
        id: `lead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        exhibition_id: currentExhibitionId.value,
        category: energyDemandsStr.includes('儲能') ? '儲能' : '光電',
        category_raw: '現場問卷進線',
        seq_no: exhibitionLeads.value.length + 1,
        company: surveyForm.value.company,
        title: '問卷填答代表',
        name: surveyForm.value.name,
        mobile: surveyForm.value.phone,
        phone: '',
        email: surveyForm.value.email,
        address: '',
        sales_rep: 'Jane',
        stage: '需求確認',
        priority: '高',
        notes: `【問卷需求】${energyDemandsStr.replace(/\n/g, '、')}。\n【建物面積】${surveyForm.value.building_type} / ${surveyForm.value.building_area}。\n【在意重點】${concernsStr.replace(/\n/g, '、')}。\n【備註】${surveyForm.value.notes}`,
        tax_and_business: '現場問卷進線',
        estimated_capacity: '待評估',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      leads.value.unshift(leadItem);

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
        surveyForm.value = {
          name: '',
          company: '',
          phone: '',
          email: '',
          energyDemands: [],
          building_type: '自有廠房 (低溫冷鏈/冷凍庫)',
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

      newLeadForm.value = {
        company: '',
        name: '',
        title: '',
        category: '儲能',
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

    // 建立新展會
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

    // 測試並儲存 Supabase 連線
    const testAndSaveSupabase = async () => {
      supabaseTesting.value = true;
      if (window.supabaseManager) {
        window.supabaseManager.saveConfig(supabaseUrl.value, supabaseKey.value);
        const res = await window.supabaseManager.testConnection();
        isSupabaseConnected.value = res.connected;
        isTableReady.value = res.tableReady;
        notify(res.message, res.connected ? 'success' : 'error');

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

    watch(showKioskModal, (open) => {
      if (open) {
        nextTick(() => {
          renderQrCode();
          if (window.lucide) window.lucide.createIcons();
        });
      }
    });

    return {
      activeTab,
      viewMode,
      showNewLeadModal,
      showNewExhibitionModal,
      showSupabaseModal,
      showLeadDetailModal,
      showSurveyFormModal,
      showAiNoteModal,
      showDiagnosticModal,
      showKioskModal,
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
      rawAiNote,
      isRecordingVoice,
      voiceSupported,
      parsedAiLead,
      aiParsing,
      diagnosticForm,
      diagnosticRecommendation,
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
      toggleVoiceRecognition,
      applyAiTemplate,
      runAiParser,
      saveAiLeadToCrm,
      saveDiagnosticToCrm,
      copyDiagnosticText,
      createNewLead,
      createNewExhibition,
      submitSurveyForm,
      convertSurveyToLead,
      renderQrCode,
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
