(function(root){
 'use strict';
 const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
 function validate(value,symbol){
  if(value?.symbol!==symbol)throw Error('返回的资产代码不匹配');
  if(!Array.isArray(value.data)||!value.data.length)throw Error('没有可用历史行情');
  let previous='';
  for(const row of value.data){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(row.time)||row.time<=previous)throw Error('行情日期无效或重复');
   if(![row.open,row.high,row.low,row.close].every(positive)||row.low>Math.min(row.open,row.close)||row.high<Math.max(row.open,row.close))throw Error('源行情高低价无效');
   previous=row.time;
  }
  return value;
 }
 function aggregate(rows,interval){
  if(interval==='1d')return rows.map(r=>({...r}));
  const out=[];
  for(const row of rows){
   const date=new Date(row.time+'T00:00:00Z');
   if(interval==='1wk')date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
   else if(interval==='1mo')date.setUTCDate(1);else throw Error('不支持的周期');
   const time=date.toISOString().slice(0,10),last=out[out.length-1];
   if(last?.time===time){last.high=Math.max(last.high,row.high);last.low=Math.min(last.low,row.low);last.close=row.close;}
   else out.push({...row,time});
  }
  return out;
 }
 function reference(rows,inverse=false){return rows.map(r=>inverse?{time:r.time,open:1/r.open,high:1/r.low,low:1/r.high,close:1/r.close}:{...r});}
 function ratio(a,b){
  const other=new Map(b.map(r=>[r.time,r])),out=[];
  for(const r of a){const s=other.get(r.time);if(!s)continue;const open=r.open/s.open,close=r.close/s.close;
   out.push({time:r.time,open,close,high:Math.max(open,close),low:Math.min(open,close)});
  }return out;
 }
 function tencentId(symbol){
  if(/^\d{6}\.SS$/.test(symbol))return 'sh'+symbol.slice(0,6);
  if(/^\d{6}\.SZ$/.test(symbol))return 'sz'+symbol.slice(0,6);
  if(/^\d{1,5}\.HK$/.test(symbol))return 'hk'+symbol.split('.')[0].padStart(5,'0');
  const index={'^GSPC':'us.SPX','^IXIC':'us.IXIC','^DJI':'us.DJI','^HSI':'hkHSI'};
  if(index[symbol])return index[symbol];
  if(/^[A-Z]{1,6}(?:\.[AB])?$/.test(symbol))return 'us'+symbol.replace('.','/');
  return null;
 }
 function parseTencent(value,id,symbol){
  const item=value?.data?.[id];if(value?.code!==0||!item)throw Error('国内行情源没有该代码');
  const data=(item.day||[]).map(r=>({time:r[0],open:+r[1],close:+r[2],high:+r[3],low:+r[4]}));
  const quote=item.qt?.[id]||[];
  return validate({symbol,data,source:'腾讯财经 · 不复权',fetched_at:Date.now()/1000,meta:{symbol,longName:quote[1]||symbol,currency:id.startsWith('us')?'USD':id.startsWith('hk')?'HKD':'CNY'},coverage_note:'国内源返回 '+data.length+' 个交易日；历史覆盖以实际日期为准。'},symbol);
 }
 function createReader({fetch:request=(...a)=>root.fetch(...a),timeout=12000}={}){
  const cache=new Map();let manifest=null,manifestTime=0;
  async function json(url){
   const control=new AbortController(),timer=setTimeout(()=>control.abort(),timeout);
   try{const response=await request(url,{signal:control.signal,cache:'no-cache'});if(!response.ok)throw Error('HTTP '+response.status);return await response.json();}
   catch(e){if(e.name==='AbortError')throw Error('请求超时');throw e;}finally{clearTimeout(timer);}
  }
  async function domestic(symbol){
   let id=tencentId(symbol);if(!id)throw Error('该代码暂无站内行情，当前不能直接获取');
   const base='https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=';
   if(id.startsWith('us')&&!id.startsWith('us.')){
    const lookup=await json(base+encodeURIComponent(id+',day,,,1,')),quote=lookup?.data?.[id]?.qt?.[id];
    const resolved=quote?.[2];if(!resolved||resolved.split('.')[0]!==symbol.replace('.','/'))throw Error('无法核对美股交易所代码');
    id='us'+resolved;
   }
   return parseTencent(await json(base+encodeURIComponent(id+',day,,,2000,')),id,symbol);
  }
  async function load(symbol){
   let snapshotError;
   try{
    if(!manifest||Date.now()-manifestTime>60000){manifest=await json('./data/manifest.json');manifestTime=Date.now();}
    const entry=manifest.assets?.[symbol];if(!entry)throw Error('站内尚未收录该代码');
    if(!/^[A-Za-z0-9_.-]+\.json$/.test(entry.file))throw Error('行情文件路径无效');
    return validate(await json('./data/'+entry.file),symbol);
   }catch(e){snapshotError=e;}
   try{return await domestic(symbol);}catch(e){throw Error(symbol+'：'+snapshotError.message+'；'+e.message);}
  }
  return async function read(symbol,range='max',interval='1d'){
   const hit=cache.get(symbol);let value;
   if(hit&&Date.now()-hit.time<30000)value=hit.value;
   else{
    try{value=await load(symbol);cache.set(symbol,{time:Date.now(),value});}
    catch(e){if(!hit)throw e;value={...hit.value,availability_note:'更新暂时失败，保留上次成功行情。'};}
   }
   let data=value.data;
   if(range!=='max'){
    const months={'1mo':1,'3mo':3,'6mo':6,'1y':12,'2y':24,'5y':60,'10y':120}[range];
    if(!months)throw Error('不支持的时间范围');
    const cutoff=new Date();cutoff.setUTCMonth(cutoff.getUTCMonth()-months);const start=cutoff.toISOString().slice(0,10);
    data=data.filter(r=>r.time>=start);
   }
   return {...value,daily:data.map(r=>({...r})),data:aggregate(data,interval)};
  };
 }
 const api={validate,aggregate,reference,ratio,tencentId,parseTencent,createReader};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MarketData=api;
})(globalThis);
