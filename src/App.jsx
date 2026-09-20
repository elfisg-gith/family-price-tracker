import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { 
  collection, addDoc, onSnapshot, query, orderBy, 
  serverTimestamp, doc, setDoc, deleteDoc, updateDoc, where, getDocs 
} from 'firebase/firestore';
import { 
  PlusCircle, Tag, History, Store, ShoppingBag, Eye, Award, 
  X, RotateCcw, Trash2, Edit2, Save, TrendingDown, AlertTriangle, CheckCircle2,
  Percent, Layers, Gift, Calculator, Search, Calendar, Target, Clock
} from 'lucide-react';

// 預設常用商家/地點標籤
const DEFAULT_LOCATIONS = ['惠康', '百佳', '萬寧', '屈臣氏', 'HKTVmall', 'Don Don Donki', '7-Eleven'];

// 📅 日期格式化工具：轉換為 YYYY-MM-DD
const formatDate = (timestamp) => {
  if (!timestamp) return '';
  let date;
  if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }
  if (isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function App() {
  const [activeTab, setActiveTab] = useState('add');
  const [products, setProducts] = useState([]);
  const [records, setRecords] = useState([]);

  // 🔍 最低價頁面智能搜尋 State
  const [lowestQuery, setLowestQuery] = useState('');
  const [selectedLowestProduct, setSelectedLowestProduct] = useState(''); // "名稱||規格"
  const [showLowestSuggestions, setShowLowestSuggestions] = useState(false);

  // 🔍 歷史紀錄頁面智能搜尋 State
  const [historyQuery, setHistoryQuery] = useState('');
  const [selectedHistoryProduct, setSelectedHistoryProduct] = useState(''); // "名稱||規格"
  const [showHistorySuggestions, setShowHistorySuggestions] = useState(false);

  // 基本表單 State
  const [userName, setUserName] = useState(localStorage.getItem('family_app_user') || '');
  const [recordType, setRecordType] = useState('bought');
  const [location, setLocation] = useState('');
  const [productName, setProductName] = useState('');
  const [spec, setSpec] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 小數點精確度 State
  const [decimalPlaces, setDecimalPlaces] = useState(() => {
    const saved = localStorage.getItem('family_app_decimals');
    return saved ? parseInt(saved, 10) : 1;
  });

  // 優惠模式 State
  const [promoType, setPromoType] = useState('standard');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [discount, setDiscount] = useState('0');

  const [bundleQty, setBundleQty] = useState('2');
  const [bundlePrice, setBundlePrice] = useState('');

  const [bogoBasePrice, setBogoBasePrice] = useState('');
  const [buyQty, setBuyQty] = useState('2');
  const [freeQty, setFreeQty] = useState('1');

  const [secondBasePrice, setSecondBasePrice] = useState('');
  const [secondDiscountPercent, setSecondDiscountPercent] = useState('50');
  const [enableExtraPromo, setEnableExtraPromo] = useState(false);
  const [extraPromoType, setExtraPromoType] = useState('percent'); // 'percent' (折數) 或 'flat' (直減)
  const [extraPromoValue, setExtraPromoValue] = useState('88');

  // 編輯彈窗 State
  const [editingRecord, setEditingRecord] = useState(null);

  // 自動建議控制 State
  const [showSuggestions, setShowSuggestions] = useState(false);
  const filteredSuggestions = productName.trim() === '' 
    ? [] 
    : products.filter(p => p.productName.toLowerCase().includes(productName.toLowerCase()));

  const matchedProduct = products.find(
    p => p.productName.trim().toLowerCase() === productName.trim().toLowerCase()
  );

  // 地點建議控制 State
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  // Refs 用於點擊外部關閉下拉選單
  const locationRef = useRef(null);
  const productRef = useRef(null);
  const lowestSearchRef = useRef(null);
  const historySearchRef = useRef(null);

  const existingLocations = Array.from(new Set([
    ...DEFAULT_LOCATIONS,
    ...records.map(r => r.location).filter(Boolean)
  ]));

  const filteredLocationSuggestions = location.trim() === ''
    ? existingLocations
    : existingLocations.filter(loc => loc.toLowerCase().includes(location.toLowerCase()));

  // 🎯 提取不重複的「貨品名稱 + 規格」選單清單
  const uniqueProductOptions = Array.from(
    new Map(
      records.map(r => {
        const nameKey = r.productName ? r.productName.trim() : '';
        const specKey = r.spec ? r.spec.trim() : '';
        const fullKey = `${nameKey}||${specKey}`;
        return [fullKey, { productName: nameKey, spec: specKey, fullKey }];
      })
    ).values()
  ).filter(item => item.productName !== '');

  // 切換小數點位數
  const handleDecimalChange = (places) => {
    setDecimalPlaces(places);
    localStorage.setItem('family_app_decimals', places.toString());
  };

  // 🧮 智慧計算實質單價
  const getCalculatedPrice = () => {
    let totalPrice = 0;
    let totalQty = 1;
    let promoLabel = '一般單價';

    switch (promoType) {
      case 'bundle': {
        const bQty = parseFloat(bundleQty) || 1;
        const bPrice = parseFloat(bundlePrice) || 0;
        totalPrice = bPrice;
        totalQty = bQty;
        promoLabel = `${bQty}件共$${bPrice}`;
        break;
      }
      case 'bogo': {
        const buy = parseFloat(buyQty) || 1;
        const free = parseFloat(freeQty) || 1;
        const baseP = parseFloat(bogoBasePrice) || 0;
        totalPrice = baseP * buy;
        totalQty = buy + free;
        promoLabel = `買${buy}送${free}`;
        break;
      }
      case 'second_discount': {
        const baseP = parseFloat(secondBasePrice) || 0;
        const percent = parseFloat(secondDiscountPercent) || 50;
        totalPrice = baseP + (baseP * (percent / 100));
        totalQty = 2;
        const discountText = percent === 50 ? '半價' : `${percent / 10}折`;
        promoLabel = `第2件${discountText}`;
        break;
      }
      default: {
        const p = parseFloat(price) || 0;
        const q = parseFloat(quantity) || 1;
        const d = parseFloat(discount) || 0;
        totalPrice = Math.max(0, p - d);
        totalQty = q;
        promoLabel = d > 0 ? `減$${d}` : '標準價';
        break;
      }
    }

    if (enableExtraPromo) {
      const val = parseFloat(extraPromoValue) || 0;
      if (extraPromoType === 'percent' && val > 0) {
        totalPrice = totalPrice * (val / 100);
        promoLabel += ` + 全店${val}折`;
      } else if (extraPromoType === 'flat' && val > 0) {
        totalPrice = Math.max(0, totalPrice - val);
        promoLabel += ` + 再減$${val}`;
      }
    }

    const rawUnitPrice = totalQty > 0 ? totalPrice / totalQty : 0;
    const unitPrice = parseFloat(rawUnitPrice.toFixed(decimalPlaces));
    
    return { totalPrice, totalQty, unitPrice, promoLabel };
  };

  const currentCalc = getCalculatedPrice();

  const handleUserChange = (e) => {
    setUserName(e.target.value);
    localStorage.setItem('family_app_user', e.target.value);
  };

  const handleReset = () => {
    setLocation('');
    setProductName('');
    setSpec('');
    setPrice('');
    setQuantity('1');
    setDiscount('0');
    setBundleQty('2');
    setBundlePrice('');
    setBogoBasePrice('');
    setBuyQty('2');
    setFreeQty('1');
    setSecondBasePrice('');
    setSecondDiscountPercent('50');
    setPromoType('standard');
    setShowSuggestions(false);
    setShowLocationSuggestions(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (locationRef.current && !locationRef.current.contains(event.target)) {
        setShowLocationSuggestions(false);
      }
      if (productRef.current && !productRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
      if (lowestSearchRef.current && !lowestSearchRef.current.contains(event.target)) {
        setShowLowestSuggestions(false);
      }
      if (historySearchRef.current && !historySearchRef.current.contains(event.target)) {
        setShowHistorySuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const qProducts = query(collection(db, 'products'), orderBy('updatedAt', 'desc'));
    const unsubscribeProducts = onSnapshot(qProducts, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qRecords = query(collection(db, 'price_records'), orderBy('createdAt', 'desc'));
    const unsubscribeRecords = onSnapshot(qRecords, (snapshot) => {
      setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeProducts();
      unsubscribeRecords();
    };
  }, []);

  // 🔄 重新計算最低價（自動過濾已過期與超過2年的紀錄）
  const recalculateLowestPrice = async (targetProductName) => {
    const cleanName = targetProductName.trim();
    const safeDocId = cleanName.replace(/\//g, '_');
    const productRefDoc = doc(db, 'products', safeDocId);

    const q = query(
      collection(db, 'price_records'), 
      where('productName', '==', cleanName)
    );
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      await deleteDoc(productRefDoc);
      return;
    }

    // 計算 2 年前的時間點
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    let lowestRecord = null;
    let lowestRecordId = null;

    querySnapshot.forEach((docSnap) => {
      const rec = docSnap.data();
      const recId = docSnap.id;

      // 1. 排除已標記為過期的紀錄
      if (rec.isExpired) return;

      // 2. 判斷建立時間，排除超過 2 年前的舊紀錄
      let recDate = null;
      if (rec.createdAt?.seconds) {
        recDate = new Date(rec.createdAt.seconds * 1000);
      } else if (rec.createdAt instanceof Date) {
        recDate = rec.createdAt;
      } else if (rec.createdAt) {
        recDate = new Date(rec.createdAt);
      }

      if (recDate && recDate < twoYearsAgo) return;

      // 比對剩餘有效紀錄中的最低實質單價
      if (!lowestRecord || rec.unitPrice < lowestRecord.unitPrice) {
        lowestRecord = rec;
        lowestRecordId = recId;
      }
    });

    if (lowestRecord) {
      await setDoc(productRefDoc, {
        productName: cleanName,
        spec: lowestRecord.spec || '',
        lowestUnitPrice: lowestRecord.unitPrice,
        lowestPriceType: lowestRecord.type,
        lowestLocation: lowestRecord.location,
        lowestPromoLabel: lowestRecord.promoLabel || '',
        lowestPriceDate: lowestRecord.createdAt || null,
        lowestRecordId: lowestRecordId, // 記錄對應的單筆紀錄 ID
        updatedBy: lowestRecord.createdByName || '系統重算',
        updatedAt: serverTimestamp()
      });
    } else {
      // 近 2 年內無任何有效紀錄時，刪除該條目
      await deleteDoc(productRefDoc);
    }
  };

  // ⏰ 標記最低價紀錄為已過期
  const handleMarkExpired = async (prod) => {
    if (!window.confirm(`確定要將「${prod.productName}」目前的最低價紀錄標記為「已過期」嗎？`)) return;

    try {
      let recordIdToMark = prod.lowestRecordId;

      // 若資料未儲存 lowestRecordId，透過查詢找出符合的紀錄 ID
      if (!recordIdToMark) {
        const q = query(
          collection(db, 'price_records'),
          where('productName', '==', prod.productName.trim())
        );
        const snap = await getDocs(q);
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.unitPrice === prod.lowestUnitPrice && !data.isExpired) {
            recordIdToMark = docSnap.id;
          }
        });
      }

      if (!recordIdToMark) {
        alert('找不到對應的原始紀錄！');
        return;
      }

      // 1. 將該筆紀錄加上 isExpired 標記
      await updateDoc(doc(db, 'price_records', recordIdToMark), {
        isExpired: true,
        expiredAt: serverTimestamp(),
        expiredBy: userName.trim() || '家人'
      });

      // 2. 觸發重新計算近 2 年內最新低價
      await recalculateLowestPrice(prod.productName);

      alert('已成功標記過期，系統已自動為您更新為近 2 年內的最新最低價！');
    } catch (error) {
      console.error('標記過期失敗:', error);
      alert('標記失敗，請檢查網路連線。');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productName || !location || currentCalc.unitPrice <= 0) {
      alert('請正確填寫：地點、貨品名稱及有效的價格資訊！');
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanName = productName.trim();

      await addDoc(collection(db, 'price_records'), {
        type: recordType,
        location: location.trim(),
        productName: cleanName,
        spec: spec.trim(),
        price: currentCalc.totalPrice,
        quantity: currentCalc.totalQty,
        unitPrice: currentCalc.unitPrice,
        promoType,
        promoLabel: currentCalc.promoLabel,
        createdByName: userName.trim() || '家人',
        createdAt: serverTimestamp()
      });

      await recalculateLowestPrice(cleanName);

      handleReset();
      alert('成功記錄！');
      setActiveTab('lowest');
    } catch (error) {
      console.error('儲存失敗:', error);
      alert('儲存失敗，請檢查網路連接。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRecord = async (record) => {
    if (!window.confirm(`確定要刪除「${record.productName}」在 ${record.location} 的這筆紀錄嗎？`)) return;

    try {
      await deleteDoc(doc(db, 'price_records', record.id));
      await recalculateLowestPrice(record.productName);
      alert('已成功刪除該筆紀錄！');
    } catch (error) {
      console.error('刪除失敗:', error);
      alert('刪除失敗，請稍後再試。');
    }
  };

  const handleStartEdit = (record) => {
    setEditingRecord({
      ...record,
      _originalProductName: record.productName
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingRecord) return;

    try {
      const p = parseFloat(editingRecord.price) || 0;
      const q = parseFloat(editingRecord.quantity) || 1;
      const unitPrice = parseFloat((p / q).toFixed(decimalPlaces));
      const cleanName = editingRecord.productName.trim();

      await updateDoc(doc(db, 'price_records', editingRecord.id), {
        type: editingRecord.type,
        location: editingRecord.location.trim(),
        productName: cleanName,
        spec: (editingRecord.spec || '').trim(), // 👈 改為這樣，避免舊資料為 undefined 時導致畫面卡住
        price: p,
        quantity: q,
        unitPrice,
        promoLabel: editingRecord.promoLabel || '手動修改'
      });

      await recalculateLowestPrice(cleanName);

      if (editingRecord._originalProductName && editingRecord._originalProductName !== cleanName) {
        await recalculateLowestPrice(editingRecord._originalProductName);
      }

      setEditingRecord(null);
      alert('紀錄已更新！');
    } catch (error) {
      console.error('更新失敗:', error);
      alert('更新失敗，請再試一次。');
    }
  };

  // 🔍 最低價：智能二合一過濾邏輯
  const filteredProducts = products.filter(p => {
    if (selectedLowestProduct) {
      const [targetName, targetSpec] = selectedLowestProduct.split('||');
      const pName = (p.productName || '').trim();
      const pSpec = (p.spec || '').trim();
      return pName === targetName && pSpec === targetSpec;
    }

    const q = lowestQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (p.productName && p.productName.toLowerCase().includes(q)) ||
      (p.spec && p.spec.toLowerCase().includes(q)) ||
      (p.lowestLocation && p.lowestLocation.toLowerCase().includes(q))
    );
  });

  // 最低價：建議清單篩選
  const filteredLowestOptions = uniqueProductOptions.filter(item => {
    const q = lowestQuery.toLowerCase().trim();
    if (!q) return true;
    return item.productName.toLowerCase().includes(q) || item.spec.toLowerCase().includes(q);
  });

  // 🔍 歷史紀錄：智能二合一過濾邏輯
  const filteredRecords = records.filter(r => {
    if (selectedHistoryProduct) {
      const [targetName, targetSpec] = selectedHistoryProduct.split('||');
      const rName = (r.productName || '').trim();
      const rSpec = (r.spec || '').trim();
      return rName === targetName && rSpec === targetSpec;
    }

    const q = historyQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (r.productName && r.productName.toLowerCase().includes(q)) ||
      (r.spec && r.spec.toLowerCase().includes(q)) ||
      (r.location && r.location.toLowerCase().includes(q)) ||
      (r.createdByName && r.createdByName.toLowerCase().includes(q))
    );
  });

  // 歷史紀錄：建議清單篩選
  const filteredHistoryOptions = uniqueProductOptions.filter(item => {
    const q = historyQuery.toLowerCase().trim();
    if (!q) return true;
    return item.productName.toLowerCase().includes(q) || item.spec.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-20">
      {/* 頂部 Header */}
      <header className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-10 flex justify-between items-center">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ShoppingBag className="w-6 h-6" /> 家庭物資比價 App
        </h1>
        <input 
          type="text" 
          placeholder="你的名字" 
          value={userName}
          onChange={handleUserChange}
          className="bg-blue-700 text-white placeholder-blue-200 text-sm rounded px-2 py-1 w-24 border border-blue-500 focus:outline-none"
        />
      </header>

      {/* 內容區域 */}
      <main className="p-4 max-w-md mx-auto">
        {/* Tab 1: 新增紀錄 */}
        {activeTab === 'add' && (
          <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                <PlusCircle className="text-blue-600" /> 輸入價格資料
              </h2>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-rose-50 transition-all font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5" /> 清空重填
              </button>
            </div>

            {/* 紀錄類型 */}
            <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setRecordType('bought')}
                className={`flex-1 py-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1 ${
                  recordType === 'bought' ? 'bg-white shadow text-blue-600' : 'text-slate-500'
                }`}
              >
                <ShoppingBag className="w-4 h-4" /> 真正購買
              </button>
              <button
                type="button"
                onClick={() => setRecordType('seen')}
                className={`flex-1 py-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1 ${
                  recordType === 'seen' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'
                }`}
              >
                <Eye className="w-4 h-4" /> 看到價格
              </button>
            </div>

            {/* 地點輸入 */}
            <div className="relative" ref={locationRef}>
              <label className="block text-xs font-semibold text-slate-500 mb-1">地點 / 商家 *</label>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {DEFAULT_LOCATIONS.slice(0, 5).map(loc => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => {
                      setLocation(loc);
                      setShowLocationSuggestions(false);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      location === loc 
                        ? (recordType === 'seen' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-blue-600 text-white border-blue-600') 
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>

              <div className="relative">
                <input 
                  type="text" 
                  placeholder="搜尋或輸入地點"
                  value={location}
                  onChange={e => {
                    setLocation(e.target.value);
                    setShowLocationSuggestions(true);
                  }}
                  onFocus={() => setShowLocationSuggestions(true)}
                  className="w-full p-2.5 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                {location && (
                  <button
                    type="button"
                    onClick={() => {
                      setLocation('');
                      setShowLocationSuggestions(true);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {showLocationSuggestions && filteredLocationSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-40 overflow-y-auto">
                  {filteredLocationSuggestions.map(loc => (
                    <div
                      key={loc}
                      onClick={() => {
                        setLocation(loc);
                        setShowLocationSuggestions(false);
                      }}
                      className="p-2.5 hover:bg-blue-50 active:bg-blue-100 cursor-pointer border-b border-slate-100 last:border-0 text-slate-700 text-sm font-medium"
                    >
                      {loc}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 貨品名稱 */}
            <div className="relative" ref={productRef}>
              <label className="block text-xs font-semibold text-slate-500 mb-1">貨品名稱 *</label>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="例如：牙刷"
                  value={productName}
                  onChange={e => {
                    setProductName(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full p-2.5 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                {productName && (
                  <button
                    type="button"
                    onClick={() => {
                      setProductName('');
                      setShowSuggestions(true);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* 💡 自動選單：顯示最低價 + 日期 */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {filteredSuggestions.map(prod => (
                    <div
                      key={prod.id}
                      onClick={() => {
                        setProductName(prod.productName);
                        if (prod.spec) setSpec(prod.spec);
                        setShowSuggestions(false);
                      }}
                      className="p-3 hover:bg-blue-50 active:bg-blue-100 cursor-pointer flex justify-between items-center transition-all"
                    >
                      <div>
                        <div className="font-semibold text-slate-800 text-sm">{prod.productName}</div>
                        {prod.spec && <div className="text-xs text-slate-400">{prod.spec}</div>}
                      </div>

                      {prod.lowestUnitPrice !== undefined && (
                        <div className="text-right flex flex-col items-end pl-2">
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60 shadow-sm">
                            ${prod.lowestUnitPrice.toFixed(decimalPlaces)} /件
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                            <Store className="w-2.5 h-2.5 inline" /> {prod.lowestLocation}
                            {prod.lowestPriceDate && (
                              <span className="text-slate-400 border-l pl-1">
                                {formatDate(prod.lowestPriceDate)}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 規格 */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">詳細描述 / 規格 (選填)</label>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="例如：高露潔 / SlimSoft / 備長炭"
                  value={spec}
                  onChange={e => setSpec(e.target.value)}
                  className="w-full p-2.5 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                {spec && (
                  <button
                    type="button"
                    onClick={() => setSpec('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* 優惠計算器選擇（根據 recordType 動態切換背景與按鈕色） */}
            <div className={`border p-3.5 rounded-2xl space-y-3 transition-colors ${
              recordType === 'seen' ? 'border-emerald-100 bg-emerald-50/50' : 'border-blue-100 bg-blue-50/50'
            }`}>
              <label className={`block text-xs font-bold flex items-center gap-1.5 ${
                recordType === 'seen' ? 'text-emerald-800' : 'text-blue-800'
              }`}>
                <Calculator className={`w-4 h-4 ${recordType === 'seen' ? 'text-emerald-600' : 'text-blue-600'}`} /> 選擇商店優惠模式
              </label>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPromoType('standard')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all flex items-center justify-center gap-1 ${
                    promoType === 'standard' 
                      ? (recordType === 'seen' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-blue-600 text-white border-blue-600 shadow-sm')
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Percent className="w-3.5 h-3.5" /> 一般特價 / 單件
                </button>
                <button
                  type="button"
                  onClick={() => setPromoType('bundle')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all flex items-center justify-center gap-1 ${
                    promoType === 'bundle' 
                      ? (recordType === 'seen' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-blue-600 text-white border-blue-600 shadow-sm')
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" /> 多件組合價 (例: 2件$45)
                </button>
                <button
                  type="button"
                  onClick={() => setPromoType('bogo')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all flex items-center justify-center gap-1 ${
                    promoType === 'bogo' 
                      ? (recordType === 'seen' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-blue-600 text-white border-blue-600 shadow-sm')
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Gift className="w-3.5 h-3.5" /> 買 X 送 Y (例: 買2送1)
                </button>
                <button
                  type="button"
                  onClick={() => setPromoType('second_discount')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all flex items-center justify-center gap-1 ${
                    promoType === 'second_discount' 
                      ? (recordType === 'seen' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-blue-600 text-white border-blue-600 shadow-sm')
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Percent className="w-3.5 h-3.5" /> 第 2 件折扣
                </button>
              </div>

              {promoType === 'standard' && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">原價 ($)</label>
                    <input 
                      type="number" step="any" placeholder="30" value={price}
                      onChange={e => setPrice(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">數量</label>
                    <input 
                      type="number" value={quantity}
                      onChange={e => setQuantity(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">直減折扣 ($)</label>
                    <input 
                      type="number" step="any" value={discount}
                      onChange={e => setDiscount(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {promoType === 'bundle' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">件數 (幾件？)</label>
                    <input 
                      type="number" value={bundleQty} onChange={e => setBundleQty(e.target.value)}
                      placeholder="例如：2"
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">組合總價 ($)</label>
                    <input 
                      type="number" step="any" value={bundlePrice} onChange={e => setBundlePrice(e.target.value)}
                      placeholder="例如：45"
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {promoType === 'bogo' && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">單件原價 ($)</label>
                    <input 
                      type="number" step="any" value={bogoBasePrice} onChange={e => setBogoBasePrice(e.target.value)}
                      placeholder="30"
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">買 (件)</label>
                    <input 
                      type="number" value={buyQty} onChange={e => setBuyQty(e.target.value)}
                      placeholder="2"
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">送 (件)</label>
                    <input 
                      type="number" value={freeQty} onChange={e => setFreeQty(e.target.value)}
                      placeholder="1"
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {promoType === 'second_discount' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">單件原價 ($)</label>
                    <input 
                      type="number" step="any" value={secondBasePrice} onChange={e => setSecondBasePrice(e.target.value)}
                      placeholder="125"
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">第 2 件折（%）</label>
                    <select 
                      value={secondDiscountPercent} 
                      onChange={e => setSecondDiscountPercent(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-slate-700"
                    >
                      <option value="50">50% 折扣（半價）</option>
                      <option value="75">75% 折扣（75折）</option>
                      <option value="80">80% 折扣（8折）</option>
                      <option value="60">60% 折扣（6折）</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={enableExtraPromo}
                  onChange={(e) => setEnableExtraPromo(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span>疊加全店 / 結帳加碼優惠</span>
              </label>

              {enableExtraPromo && (
                <div className="mt-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2">
                  <select
                    value={extraPromoType}
                    onChange={(e) => setExtraPromoType(e.target.value)}
                    className="p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none"
                  >
                    <option value="percent">全店折數 (% 折扣)</option>
                    <option value="flat">滿額/整單直減 ($)</option>
                  </select>

                  <div className="flex-1 flex items-center gap-1">
                    <input
                      type="number"
                      step="any"
                      value={extraPromoValue}
                      onChange={(e) => setExtraPromoValue(e.target.value)}
                      placeholder={extraPromoType === 'percent' ? '例如 88 (即88折)' : '例如 20'}
                      className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none"
                    />
                    <span className="text-xs text-slate-500 font-medium">
                      {extraPromoType === 'percent' ? '折' : '元'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 藍色實質單價卡 */}
            <div className={`p-3 text-white rounded-xl text-xs flex justify-between items-center shadow-md transition-colors ${
              recordType === 'seen' ? 'bg-emerald-600' : 'bg-blue-600'
            }`}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="opacity-80 block text-[10px]">自動計算實質單價</span>
                  <div className={`p-0.5 rounded-lg flex gap-0.5 border ${
                    recordType === 'seen' ? 'bg-emerald-700/90 border-emerald-400/40' : 'bg-blue-700/90 border-blue-400/40'
                  }`}>
                    <button
                      type="button"
                      onClick={() => handleDecimalChange(1)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                        decimalPlaces === 1 
                          ? (recordType === 'seen' ? 'bg-white text-emerald-700 shadow-sm' : 'bg-white text-blue-700 shadow-sm') 
                          : (recordType === 'seen' ? 'text-emerald-200 hover:text-white' : 'text-blue-200 hover:text-white')
                      }`}
                    >
                      1位 (.0)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecimalChange(2)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                        decimalPlaces === 2 
                          ? (recordType === 'seen' ? 'bg-white text-emerald-700 shadow-sm' : 'bg-white text-blue-700 shadow-sm') 
                          : (recordType === 'seen' ? 'text-emerald-200 hover:text-white' : 'text-blue-200 hover:text-white')
                      }`}
                    >
                      2位 (.00)
                    </button>
                  </div>
                </div>

                <span className="bg-white/20 px-2 py-0.5 rounded text-[11px] font-bold inline-block">
                  {currentCalc.promoLabel}
                </span>
              </div>

              <div className="text-right">
                <span className="text-xl font-black">${currentCalc.unitPrice.toFixed(decimalPlaces)}</span>
                <span className="text-[10px] opacity-80 block">
                  / 件 (總計 ${currentCalc.totalPrice.toFixed(decimalPlaces)} / {currentCalc.totalQty}件)
                </span>
              </div>
            </div>

            {/* 即時比對卡片 */}
            {matchedProduct && (
              <div className="transition-all">
                {currentCalc.unitPrice > 0 ? (
                  currentCalc.unitPrice < matchedProduct.lowestUnitPrice ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 font-medium">
                      <TrendingDown className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div>
                        <div className="font-bold text-emerald-700">🔥 創歷史新低價！</div>
                        <div>
                          比舊底價 (${matchedProduct.lowestUnitPrice.toFixed(decimalPlaces)} @ {matchedProduct.lowestLocation} {formatDate(matchedProduct.lowestPriceDate) && `· ${formatDate(matchedProduct.lowestPriceDate)}`}) 平咗 ${(matchedProduct.lowestUnitPrice - currentCalc.unitPrice).toFixed(decimalPlaces)}！
                        </div>
                      </div>
                    </div>
                  ) : currentCalc.unitPrice === matchedProduct.lowestUnitPrice ? (
                    <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs flex items-center gap-2 font-medium">
                      <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
                      <div>
                        <div className="font-bold text-blue-700">✨ 打平歷史最低價！</div>
                        <div>與先前最平價格相等 ({matchedProduct.lowestLocation} {formatDate(matchedProduct.lowestPriceDate) && `· ${formatDate(matchedProduct.lowestPriceDate)}`})。</div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center gap-2 font-medium">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      <div>
                        <div className="font-bold text-amber-700">⚠️ 貴過歷史最低價</div>
                        <div>
                          {matchedProduct.lowestLocation} {formatDate(matchedProduct.lowestPriceDate) && `(${formatDate(matchedProduct.lowestPriceDate)})`} 曾賣過 <b>${matchedProduct.lowestUnitPrice.toFixed(decimalPlaces)}</b> 
                          {matchedProduct.lowestPromoLabel && <span className="text-amber-900 font-semibold">（當時優惠：{matchedProduct.lowestPromoLabel}）</span>}
                          ，貴咗 ${(currentCalc.unitPrice - matchedProduct.lowestUnitPrice).toFixed(decimalPlaces)}。
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs flex justify-between items-center">
                    <span>💡 歷史最低價參考:</span>
                    <span className="font-bold text-slate-800">
                      ${matchedProduct.lowestUnitPrice.toFixed(decimalPlaces)} /件 ({matchedProduct.lowestLocation} {formatDate(matchedProduct.lowestPriceDate) && `· ${formatDate(matchedProduct.lowestPriceDate)}`})
                    </span>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all disabled:opacity-50 ${
                recordType === 'seen'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
              }`}
            >
              {isSubmitting ? '儲存中...' : '確認提交紀錄'}
            </button>
          </form>
        )}

        {/* Tab 2: 最低價清單 (智能二合一搜尋條) */}
        {activeTab === 'lowest' && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
              <Award className="text-amber-500" /> 歷史最低價總覽
            </h2>

            {/* 🎯 最低價：智能二合一搜尋條 */}
            <div className="relative bg-white p-3 rounded-2xl border border-slate-100 shadow-sm space-y-2" ref={lowestSearchRef}>
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜尋關鍵字或點選指定貨品..."
                  value={
                    selectedLowestProduct
                      ? `${selectedLowestProduct.split('||')[0]} ${selectedLowestProduct.split('||')[1] ? `(${selectedLowestProduct.split('||')[1]})` : ''}`
                      : lowestQuery
                  }
                  onChange={e => {
                    if (selectedLowestProduct) setSelectedLowestProduct('');
                    setLowestQuery(e.target.value);
                    setShowLowestSuggestions(true);
                  }}
                  onFocus={() => setShowLowestSuggestions(true)}
                  className={`w-full pl-9 pr-9 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                    selectedLowestProduct ? 'border-blue-500 bg-blue-50/40 font-bold text-blue-900' : 'border-slate-200'
                  }`}
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                {(lowestQuery || selectedLowestProduct) && (
                  <button
                    onClick={() => {
                      setLowestQuery('');
                      setSelectedLowestProduct('');
                      setShowLowestSuggestions(false);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* 🎯 鎖定狀態標籤 */}
              {selectedLowestProduct && (
                <div className="flex justify-between items-center bg-blue-600 text-white px-3 py-1.5 rounded-xl text-xs font-medium shadow-sm">
                  <span className="truncate flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 shrink-0" />
                    已精確鎖定：<b>{selectedLowestProduct.split('||')[0]}</b> {selectedLowestProduct.split('||')[1] && `(${selectedLowestProduct.split('||')[1]})`}
                  </span>
                  <button 
                    onClick={() => setSelectedLowestProduct('')}
                    className="ml-2 bg-white/20 hover:bg-white/30 rounded-full p-0.5 text-white shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* 💡 智能下拉選項 (加上 .slice(0, 15) 限制最多顯示 15 筆) */}
              {showLowestSuggestions && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {lowestQuery.trim() !== '' && (
                    <div
                      onClick={() => {
                        setSelectedLowestProduct('');
                        setShowLowestSuggestions(false);
                      }}
                      className="p-3 hover:bg-slate-50 cursor-pointer text-xs text-blue-600 font-semibold flex items-center gap-2 bg-blue-50/50"
                    >
                      <Search className="w-3.5 h-3.5 shrink-0" />
                      搜尋所有包含「{lowestQuery}」的相關貨品 (模糊比對)
                    </div>
                  )}

                  {/* 👇 這裡加上了 .slice(0, 15) */}
                  {filteredLowestOptions.slice(0, 5).map(item => (
                    <div
                      key={item.fullKey}
                      onClick={() => {
                        setSelectedLowestProduct(item.fullKey);
                        setLowestQuery('');
                        setShowLowestSuggestions(false);
                      }}
                      className="p-3 hover:bg-blue-50 cursor-pointer flex justify-between items-center transition-all"
                    >
                      <div>
                        <div className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          {item.productName}
                        </div>
                        {item.spec && <div className="text-xs text-slate-400 pl-5">{item.spec}</div>}
                      </div>
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold shrink-0">
                        精確鎖定
                      </span>
                    </div>
                  ))}

                  {filteredLowestOptions.length === 0 && lowestQuery.trim() === '' && (
                    <div className="p-3 text-xs text-slate-400 text-center">請輸入關鍵字搜尋或選擇商品</div>
                  )}
                </div>
              )}
            </div>

            {filteredProducts.length === 0 ? (
              <p className="text-center text-slate-400 py-10 text-sm">
                {(lowestQuery || selectedLowestProduct) ? '找不到符合條件的最低價資料' : '目前尚無商品資料。'}
              </p>
            ) : (
              filteredProducts.map(prod => (
                <div key={prod.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center hover:border-blue-200 transition-all">
                  <div>
                    <h3 
                      onClick={() => {
                        setSelectedLowestProduct(`${prod.productName || ''}||${prod.spec || ''}`);
                        setLowestQuery('');
                      }}
                      className="font-bold text-slate-800 cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-1"
                    >
                      {prod.productName}
                    </h3>
                    {prod.spec && <p className="text-xs text-slate-400">{prod.spec}</p>}
                    
                    <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1 font-medium">
                        <Store className="w-3 h-3 text-slate-400" />{prod.lowestLocation}
                      </span>
                      
                      {prod.lowestPriceDate && (
                        <span className="flex items-center gap-0.5 text-[11px] text-slate-400 font-normal">
                          <Calendar className="w-3 h-3 text-slate-400 inline" />
                          {formatDate(prod.lowestPriceDate)}
                        </span>
                      )}

                      {prod.lowestPromoLabel && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 font-semibold border border-amber-200/60">
                          {prod.lowestPromoLabel}
                        </span>
                      )}
                      
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${prod.lowestPriceType === 'bought' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {prod.lowestPriceType === 'bought' ? '購買' : '看到'}
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-end gap-1.5">
                    <div className="text-[10px] text-slate-400">最低實質單價</div>
                    <div className="text-lg font-extrabold text-emerald-600">
                      ${prod.lowestUnitPrice.toFixed(decimalPlaces)}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleMarkExpired(prod)}
                      className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 rounded-lg text-xs font-medium transition-all flex items-center gap-1 shadow-sm"
                    >
                      <Clock className="w-3.5 h-3.5" /> 已過期
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 3: 歷史流水帳 (智能二合一搜尋條) */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
              <History className="text-blue-600" /> 全家採購歷史
            </h2>

            {/* 🎯 歷史紀錄：智能二合一搜尋條 */}
            <div className="relative bg-white p-3 rounded-2xl border border-slate-100 shadow-sm space-y-2" ref={historySearchRef}>
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜尋關鍵字 (商品/地點/紀錄人) 或點選指定貨品..."
                  value={
                    selectedHistoryProduct
                      ? `${selectedHistoryProduct.split('||')[0]} ${selectedHistoryProduct.split('||')[1] ? `(${selectedHistoryProduct.split('||')[1]})` : ''}`
                      : historyQuery
                  }
                  onChange={e => {
                    if (selectedHistoryProduct) setSelectedHistoryProduct('');
                    setHistoryQuery(e.target.value);
                    setShowHistorySuggestions(true);
                  }}
                  onFocus={() => setShowHistorySuggestions(true)}
                  className={`w-full pl-9 pr-9 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                    selectedHistoryProduct ? 'border-blue-500 bg-blue-50/40 font-bold text-blue-900' : 'border-slate-200'
                  }`}
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                {(historyQuery || selectedHistoryProduct) && (
                  <button
                    onClick={() => {
                      setHistoryQuery('');
                      setSelectedHistoryProduct('');
                      setShowHistorySuggestions(false);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* 🎯 鎖定狀態標籤 */}
              {selectedHistoryProduct && (
                <div className="flex justify-between items-center bg-blue-600 text-white px-3 py-1.5 rounded-xl text-xs font-medium shadow-sm">
                  <span className="truncate flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 shrink-0" />
                    已精確鎖定：<b>{selectedHistoryProduct.split('||')[0]}</b> {selectedHistoryProduct.split('||')[1] && `(${selectedHistoryProduct.split('||')[1]})`}
                  </span>
                  <button 
                    onClick={() => setSelectedHistoryProduct('')}
                    className="ml-2 bg-white/20 hover:bg-white/30 rounded-full p-0.5 text-white shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* 💡 智能下拉選項 */}
              {showHistorySuggestions && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {historyQuery.trim() !== '' && (
                    <div
                      onClick={() => {
                        setSelectedHistoryProduct('');
                        setShowHistorySuggestions(false);
                      }}
                      className="p-3 hover:bg-slate-50 cursor-pointer text-xs text-blue-600 font-semibold flex items-center gap-2 bg-blue-50/50"
                    >
                      <Search className="w-3.5 h-3.5 shrink-0" />
                      搜尋所有包含「{historyQuery}」的相關紀錄 (模糊比對)
                    </div>
                  )}
                  
                  {/* 👇 加上 .slice(0, 15) */}
                  {filteredHistoryOptions.slice(0, 5).map(item => (
                    <div
                      key={item.fullKey}
                      onClick={() => {
                        setSelectedHistoryProduct(item.fullKey);
                        setHistoryQuery('');
                        setShowHistorySuggestions(false);
                      }}
                      className="p-3 hover:bg-blue-50 cursor-pointer flex justify-between items-center transition-all"
                    >
                      <div>
                        <div className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          {item.productName}
                        </div>
                        {item.spec && <div className="text-xs text-slate-400 pl-5">{item.spec}</div>}
                      </div>
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold shrink-0">
                        精確鎖定
                      </span>
                    </div>
                  ))}

                  {filteredHistoryOptions.length === 0 && historyQuery.trim() === '' && (
                    <div className="p-3 text-xs text-slate-400 text-center">請輸入關鍵字搜尋或選擇商品</div>
                  )}
                </div>
              )}
            </div>

            {filteredRecords.length === 0 ? (
              <p className="text-center text-slate-400 py-10 text-sm">
                {(historyQuery || selectedHistoryProduct) ? '找不到符合條件的採購紀錄' : '目前尚無歷史紀錄。'}
              </p>
            ) : (
              filteredRecords.map(rec => (
                <div key={rec.id} className="bg-white p-3.5 rounded-xl shadow-sm border border-slate-100 space-y-1.5 hover:border-blue-200 transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <span 
                        onClick={() => {
                          setSelectedHistoryProduct(`${rec.productName || ''}||${rec.spec || ''}`);
                          setHistoryQuery('');
                        }}
                        className="font-bold text-slate-800 text-sm cursor-pointer hover:text-blue-600 transition-colors inline-flex items-center gap-1"
                      >
                        {rec.productName}
                      </span>
                      {rec.spec && <span className="text-xs text-slate-400 block">{rec.spec}</span>}
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-blue-600 text-sm block">${rec.unitPrice.toFixed(decimalPlaces)} / 件</span>
                      {rec.promoLabel && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                          {rec.promoLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-xs text-slate-500 flex justify-between">
                    <span>{rec.location} ({rec.type === 'bought' ? '購買' : '看到'})</span>
                    <span>總計: ${rec.price} ({rec.quantity}件)</span>
                  </div>

                  <div className="text-[10px] text-slate-400 flex justify-between items-center pt-2 border-t border-slate-50">
                    <span>記錄人: {rec.createdByName} · {rec.createdAt ? formatDate(rec.createdAt) : '剛才'}</span>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStartEdit(rec)}
                        className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-slate-100 transition-all flex items-center gap-0.5 text-xs font-medium"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> 編輯
                      </button>
                      <button
                        onClick={() => handleDeleteRecord(rec)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 transition-all flex items-center gap-0.5 text-xs font-medium"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> 刪除
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* 編輯紀錄彈窗 */}
      {editingRecord && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" /> 修改採購紀錄
              </h3>
              <button 
                onClick={() => setEditingRecord(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">地點 / 商家</label>
                <input 
                  type="text" 
                  value={editingRecord.location}
                  onChange={e => setEditingRecord({...editingRecord, location: e.target.value})}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">貨品名稱</label>
                <input 
                  type="text" 
                  value={editingRecord.productName}
                  onChange={e => setEditingRecord({...editingRecord, productName: e.target.value})}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  詳細描述 / 規格
                </label>
                <input
                  type="text"
                  value={editingRecord.spec || ''}
                  onChange={(e) => setEditingRecord({ ...editingRecord, spec: e.target.value })}
                  placeholder="例如：120 粒膠囊、1盒4個..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">優惠說明標籤</label>
                <input 
                  type="text" 
                  value={editingRecord.promoLabel || ''}
                  onChange={e => setEditingRecord({...editingRecord, promoLabel: e.target.value})}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                  placeholder="例如：買2送1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">總花費 ($)</label>
                  <input 
                    type="number" 
                    step="any"
                    value={editingRecord.price}
                    onChange={e => setEditingRecord({...editingRecord, price: e.target.value})}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">總拿到數量 (件)</label>
                  <input 
                    type="number" 
                    value={editingRecord.quantity}
                    onChange={e => setEditingRecord({...editingRecord, quantity: e.target.value})}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                    required
                  />
                </div>
              </div>

              <div className="p-2.5 bg-blue-50 rounded-lg text-xs text-blue-700 flex justify-between items-center font-medium">
                <span>更新後實質單價:</span>
                <span className="font-bold text-sm">
                  ${((parseFloat(editingRecord.price)||0) / (parseFloat(editingRecord.quantity)||1)).toFixed(decimalPlaces)} / 件
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 flex items-center justify-center gap-1 shadow"
                >
                  <Save className="w-4 h-4" /> 儲存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 底部 Tab 導覽列 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around py-2 shadow-lg z-20 max-w-md mx-auto">
        <button
          onClick={() => setActiveTab('add')}
          className={`flex flex-col items-center gap-1 text-xs font-medium ${
            activeTab === 'add' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          <PlusCircle className="w-5 h-5" />
          <span>新增紀錄</span>
        </button>
        <button
          onClick={() => setActiveTab('lowest')}
          className={`flex flex-col items-center gap-1 text-xs font-medium ${
            activeTab === 'lowest' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          <Tag className="w-5 h-5" />
          <span>最低價</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 text-xs font-medium ${
            activeTab === 'history' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          <History className="w-5 h-5" />
          <span>歷史紀錄</span>
        </button>
      </nav>
    </div>
  );
}