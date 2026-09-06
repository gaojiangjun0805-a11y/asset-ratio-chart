const $ = (id) => document.getElementById(id);
const statusEl = $('status');
let chart, series;

if(location.protocol === 'file:'){
  $('fileWarning').style.display = 'block';
}

function setStatus(msg, isError){
  statusEl.textContent = msg || '';
  statusEl.className = isError ? 'error' : '';
}

// 常用简称 → 雅虎财经真实代码。打 "BTC" 就够了,不用记 "-USD" 这种后缀,
// 也避免了简称直接查询时撞上无关股票/ETF代码的问题(比如 "ETH" 本来会查到一只无关的基金)。
const SYMBOL_ALIASES = {
  // 加密货币
  BTC:'BTC-USD', ETH:'ETH-USD', SOL:'SOL-USD', DOGE:'DOGE-USD', XRP:'XRP-USD',
  BNB:'BNB-USD', ADA:'ADA-USD', LTC:'LTC-USD', DOT:'DOT-USD', AVAX:'AVAX-USD',
  LINK:'LINK-USD', TRX:'TRX-USD', SHIB:'SHIB-USD', USDT:'USDT-USD', USDC:'USDC-USD',
  // 大宗商品
  GOLD:'GC=F', SILVER:'SI=F', OIL:'CL=F', COPPER:'HG=F',
  // 指数
  SPX:'^GSPC', NASDAQ:'^IXIC', NDX:'^NDX', DOW:'^DJI', VIX:'^VIX',
  SSE:'000001.SS', SZSE:'399001.SZ', HSI:'^HSI', KOSPI:'^KS11', NIKKEI:'^N225',
};

// 中文公司名 → 雅虎财经代码。雅虎的搜索接口对中文关键词直接返回"Invalid Search Query"
// (测过"腾讯""贵州茅台"等一律 400,纯英文如 "tencent" 能查),没法做通用模糊搜索,
// 所以用一份手工整理的对照表覆盖常问的美股、A股(.SS上海/.SZ深圳)、港股(.HK)公司。
const CHINESE_NAME_ALIASES = {
  // 美股科技
  '苹果':'AAPL', '微软':'MSFT', '谷歌':'GOOGL', '字母表':'GOOGL', '亚马逊':'AMZN',
  '英伟达':'NVDA', '脸书':'META', 'Meta':'META', '特斯拉':'TSLA', '奈飞':'NFLX',
  '网飞':'NFLX', '甲骨文':'ORCL', '高通':'QCOM', '博通':'AVGO', '台积电':'TSM',
  '超微半导体':'AMD',
  // 美股其他知名公司
  '沃尔玛':'WMT', '摩根大通':'JPM', '可口可乐':'KO', '迪士尼':'DIS', '星巴克':'SBUX',
  '麦当劳':'MCD', '耐克':'NKE', '强生':'JNJ', '辉瑞':'PFE', '花旗':'C', '高盛':'GS',
  '波音':'BA', '好市多':'COST', '优步':'UBER', '万事达':'MA', 'Visa':'V', '维萨':'V',
  // 中概股(美股ADR)
  '阿里巴巴':'BABA', '京东':'JD', '拼多多':'PDD', '百度':'BIDU', '网易':'NTES',
  '蔚来':'NIO', '小鹏':'XPEV', '理想汽车':'LI', '哔哩哔哩':'BILI', '携程':'TCOM',
  '腾讯音乐':'TME', '爱奇艺':'IQ',
  // 港股
  '腾讯':'0700.HK', '腾讯控股':'0700.HK', '美团':'3690.HK', '小米':'1810.HK',
  '比亚迪':'1211.HK', '建设银行':'0939.HK', '汇丰':'0005.HK', '汇丰控股':'0005.HK',
  '中国移动':'0941.HK', '友邦保险':'1299.HK',
  // A股(沪深)
  '贵州茅台':'600519.SS', '茅台':'600519.SS', '宁德时代':'300750.SZ',
  '中国平安':'601318.SS', '招商银行':'600036.SS', '五粮液':'000858.SZ',
  '美的集团':'000333.SZ', '工商银行':'601398.SS', '中国银行':'601988.SS',
  '中国石油':'601857.SS', '隆基绿能':'601012.SS', '长江电力':'600900.SS',
  '格力电器':'000651.SZ', '海康威视':'002415.SZ', '比亚迪A股':'002594.SZ',
  '三钢闽光':'002110.SZ', '中信证券':'600030.SS', '恒瑞医药':'600276.SS',
};

function resolveSymbol(raw){
  const trimmed = raw.trim();
  if(CHINESE_NAME_ALIASES[trimmed]) return CHINESE_NAME_ALIASES[trimmed];
  return SYMBOL_ALIASES[trimmed.toUpperCase()] || trimmed;
}

const readMarket = MarketData.createReader();
async function fetchYahoo(symbol,range,interval){return readMarket(resolveSymbol(symbol),range,interval);}

// 这些简写在雅虎财经里常常会撞上完全无关的股票/ETF代码(例如直接查 "ETH" 会查到一只叫
// Grayscale Ethereum Mini Trust ETF 的基金),不是报错,所以要主动提醒。只对没有命中
// SYMBOL_ALIASES、被原样发去查询的输入做这个检查——命中别名表的属于预期解析,不用警告。
const AMBIGUOUS_SHORTHAND = new Set(['BTC','ETH','USD','EUR','GBP','JPY','DOGE','SOL','XRP','LTC','BNB','ADA','USDT','USDC','TRX','DOT','MATIC','AVAX','LINK','GOLD','SILVER','OIL']);

function describeMeta(symbol, meta){
  const name = meta.longName || meta.shortName || meta.symbol || symbol;
  const type = meta.instrumentType || '';
  const currency = meta.currency || '';
  const text = `解析为:${name}${type ? '('+type+')' : ''}${currency ? '  '+currency : ''}`;
  const key = symbol.trim().toUpperCase();
  const wasAliased = key in SYMBOL_ALIASES;
  const looksMismatched = !wasAliased && AMBIGUOUS_SHORTHAND.has(key) && type && type !== 'CRYPTOCURRENCY' && type !== 'CURRENCY';
  return { text, warn: looksMismatched };
}

function divideSeries(a,b){return MarketData.ratio(a,b);}

const isUSD = (s) => s.trim().toUpperCase() === 'USD';
const USD_META = { symbol:'USD', longName:'固定 1 倍价格基准', shortName:'USD', instrumentType:'CURRENCY', currency:'USD' };

// 雅虎财经真的有个股票代码叫 "USD"(和美元本身无关),所以不能把它当普通代码去查。
// 选 USD 时直接用"另一边"的真实日期生成一条全部等于 1 的序列,相除后就等于显示对方资产本身的美元原始价格。
function usdSeriesFrom(otherData){
  return otherData.map(d => ({time:d.time, open:1, high:1, low:1, close:1}));
}

let lockZoom = false;

// 左右拖动时 K 线宽度会变,是因为默认拖到坐标轴上会触发缩放(handleScale),滚轮/双指也会缩放。
// 锁定后只保留平移(handleScroll.pressedMouseMove),把所有会改变缩放比例的交互都关掉。
function applyZoomLock(){
  if(!chart) return;
  chart.applyOptions({
    handleScale: {
      axisPressedMouseMove: !lockZoom,
      mouseWheel: !lockZoom,
      pinch: !lockZoom,
    },
    handleScroll: {
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: !lockZoom,
      mouseWheel: true,
    },
  });
}

function ensureChart(){
  if(chart) return;
  if(!window.LightweightCharts)throw new Error('图表资源未加载，请刷新页面');
  chart = LightweightCharts.createChart($('chart'), {
    layout:{ background:{color:'#000000'}, textColor:'#848e9c', fontFamily:'-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif' },
    grid:{ vertLines:{color:'#1c1c1c'}, horzLines:{color:'#1c1c1c'} },
    rightPriceScale:{ borderColor:'#1e252c' },
    timeScale:{ borderColor:'#1e252c' },
    crosshair:{
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine:{color:'#2a323b', labelBackgroundColor:'#1e252c'},
      horzLine:{color:'#2a323b', labelBackgroundColor:'#1e252c'},
    },
  });
  series = chart.addCandlestickSeries({
    upColor:'#00d492', downColor:'#f6465d',
    borderUpColor:'#00d492', borderDownColor:'#f6465d',
    wickUpColor:'#00d492', wickDownColor:'#f6465d',
  });
  new ResizeObserver(entries=>{
    const {width} = entries[0].contentRect;
    chart.applyOptions({width});
  }).observe($('chart'));
  applyZoomLock();
}

let currentRange = '1y';
let currentInterval = '1d';

// 时间跨度和K线周期是两个独立控件,选到"退化组合"会导致图上只有一两根K线
// (比如"1个月"跨度配"月线"周期,一个月里数学上只有 1 根月K线)。
// 用这份表规定每种周期至少要配多长的跨度才有意义,两个控件互相看着点。
const RANGE_ORDER = ['1mo','3mo','6mo','1y','2y','5y','10y','max'];
const MIN_RANGE_FOR_INTERVAL = { '1d':'1mo', '1wk':'6mo', '1mo':'2y' };
const rangeIndex = (r) => RANGE_ORDER.indexOf(r);

function setActivePill(containerId, value){
  $(containerId).querySelectorAll('button').forEach(b=>{
    b.classList.toggle('active', b.dataset.value === value);
  });
}

// changed 是用户刚点的那个控件,用来决定出现冲突时该调整"另一个"控件,
// 而不是覆盖用户刚做的选择。
function ensureSensibleCombo(changed){
  const minRange = MIN_RANGE_FOR_INTERVAL[currentInterval] || '1mo';
  if(rangeIndex(currentRange) < rangeIndex(minRange)){
    if(changed === 'interval'){
      currentRange = minRange;
      setActivePill('rangeGroup', currentRange);
    }else{
      currentInterval = '1d';
      setActivePill('intervalGroup', currentInterval);
    }
  }
}

function setupSegmented(containerId, onChange){
  const container = $(containerId);
  container.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      container.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.value);
      plot();
    });
  });
}
setupSegmented('rangeGroup', v => { currentRange = v; ensureSensibleCombo('range'); });
setupSegmented('intervalGroup', v => { currentInterval = v; ensureSensibleCombo('interval'); });

let isLoading = false;

// fit=true(手动点"画图"/切换标的/切换周期等)会重置缩放到全部数据;fit=false(实时刷新的定时 tick)
// 只刷新数据不动缩放,不然每隔几秒图就被强制归位一次,没法自己拖动看细节。
async function loadAndRender(fit){
  const symA = $('symA').value.trim();
  const symB = $('symB').value.trim();
  const range = currentRange;
  const interval = currentInterval;
  if(!symA || !symB){ if(fit) setStatus('请输入两个标的代码', true); return; }
  if(isLoading) return;
  isLoading = true;

  if(fit){
    $('plotBtn').disabled = true;
    setStatus(`正在加载 ${symA} 与 ${symB} 的数据...`);
    $('tickerMeta').textContent = '加载中...';
    $('resA').textContent = ''; $('resA').className = 'resolved';
    $('resB').textContent = ''; $('resB').className = 'resolved';
  }

  if(isUSD(symA) && isUSD(symB)){
    setStatus('两边都选 USD 没有意义,至少一边要填真实资产', true);
    isLoading = false; $('plotBtn').disabled = false; return;
  }

  try{
    let resultA, resultB;
    if(isUSD(symB)){
      resultA = await fetchYahoo(symA, range, interval);
      resultB = { data: usdSeriesFrom(resultA.data), meta: USD_META };
    }else if(isUSD(symA)){
      resultB = await fetchYahoo(symB, range, interval);
      resultA = { data: usdSeriesFrom(resultB.data), meta: USD_META };
    }else{
      [resultA, resultB] = await Promise.all([
        fetchYahoo(symA, range, interval),
        fetchYahoo(symB, range, interval),
      ]);
    }

    const descA = describeMeta(symA, resultA.meta);
    const descB = describeMeta(symB, resultB.meta);
    $('resA').textContent = descA.text; $('resA').className = 'resolved' + (descA.warn ? ' warn' : '');
    $('resB').textContent = descB.text; $('resB').className = 'resolved' + (descB.warn ? ' warn' : '');

    const ratio = isUSD(symB) ? MarketData.reference(resultA.data) : isUSD(symA) ? MarketData.reference(resultB.data,true) : MarketData.aggregate(divideSeries(resultA.daily,resultB.daily),interval);
    if(ratio.length === 0){
      setStatus(`${symA} 和 ${symB} 没有共同的交易日,无法对齐计算比值`, true);
      return;
    }
    ensureChart();
    series.setData(ratio);
    if(fit) chart.timeScale().fitContent();

    const last = ratio[ratio.length-1];
    const prev = ratio.length > 1 ? ratio[ratio.length-2] : null;
    const changePct = prev ? (last.close - prev.close) / prev.close * 100 : 0;
    const isUp = changePct >= 0;
    const now = new Date().toLocaleTimeString('zh-CN', {hour12:false});

    $('tickerPrice').textContent = last.close.toPrecision(6);
    $('tickerPrice').style.color = prev ? (isUp ? 'var(--up)' : 'var(--down)') : 'var(--text)';
    const changeEl = $('tickerChange');
    if(prev){
      changeEl.textContent = `${isUp ? '▲' : '▼'} ${Math.abs(changePct).toFixed(2)}%`;
      changeEl.className = 'ticker-change ' + (isUp ? 'up' : 'down');
    }else{
      changeEl.textContent = ''; changeEl.className = 'ticker-change';
    }
    $('tickerMeta').textContent = `${last.time} · 共 ${ratio.length} 根 K 线`;
    const sources=[resultA,resultB].filter(x=>x.source);
    const details=sources.map(x=>`${x.meta.longName||x.symbol}：${x.source} · 数据取得于 ${new Date(x.fetched_at*1000).toLocaleString('zh-CN',{hour12:false})}${x.coverage_note?' · '+x.coverage_note:''}${x.availability_note?' · '+x.availability_note:''}`);
    const age=Math.max(...sources.map(x=>Date.now()/1000-x.fetched_at));
    const currencyA=resultA.meta.currency||'未知',currencyB=resultB.meta.currency||'未知';
    const precision=isUSD(symA)||isUSD(symB)?'USD 为固定 1 倍基准，保留资产原币 OHLC；未换汇。':'日线开收盘采样比值；影线仅表示采样极值，不代表逐笔高低点。'+(currencyA!==currencyB?` 原币数值比：${currencyA} / ${currencyB}，未换汇。`:'');
    $('dataStatus').textContent=(age>3*3600?'行情更新延迟，请留意数据时间。 ':'')+details.join('；')+'。'+precision;

    if(descA.warn || descB.warn){
      setStatus('⚠️ 上面标了黄色的代码解析到了一个可能不是你想要的股票/ETF,请检查下方的解析结果', true);
    }else{
      setStatus('');
    }
  }catch(err){
    console.error(err);
    setStatus('加载失败: ' + err.message, true);
  }finally{
    isLoading = false;
    $('plotBtn').disabled = false;
  }
}

async function plot(){ await loadAndRender(true); }

let liveMode = false;
let liveTimer = null;
const LIVE_POLL_MS = 60000;

function stopLive(){
  if(liveTimer){ clearInterval(liveTimer); liveTimer = null; }
}

$('liveBtn').addEventListener('click', () => {
  liveMode = !liveMode;
  $('liveBtn').classList.toggle('active', liveMode);
  $('liveBtn').textContent = liveMode ? '自动检查已开' : '自动检查更新';
  stopLive();
  if(liveMode){
    liveTimer = setInterval(() => { loadAndRender(false); }, LIVE_POLL_MS);
  }
});

$('plotBtn').addEventListener('click', plot);
$('lockZoomBtn').addEventListener('click', () => {
  lockZoom = !lockZoom;
  $('lockZoomBtn').classList.toggle('active', lockZoom);
  $('lockZoomBtn').textContent = lockZoom ? '🔒 已锁定宽度' : '🔓 锁定宽度';
  applyZoomLock();
});
$('swapBtn').addEventListener('click', () => {
  const a = $('symA').value;
  $('symA').value = $('symB').value;
  $('symB').value = a;
  plot();
});
document.querySelectorAll('.preset-btn').forEach(btn=>{
  btn.addEventListener('click', () => {
    $('symA').value = btn.dataset.a;
    $('symB').value = btn.dataset.b;
    plot();
  });
});
[$('symA'), $('symB')].forEach(input=>{
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') plot(); });
});

plot();
