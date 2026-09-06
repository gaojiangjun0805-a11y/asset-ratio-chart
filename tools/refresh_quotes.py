"""Build same-origin, time-stamped daily market files; keep real old data on error."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import argparse, json, math, re, time, urllib.parse, urllib.request

ROOT=Path(__file__).resolve().parent.parent
HEADERS={'User-Agent':'Mozilla/5.0','Accept':'application/json'}

def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=15) as response:
        return json.load(response)

def normalize(payload,symbol):
    chart=payload.get('chart',{})
    if chart.get('error') or not chart.get('result'): raise ValueError('源没有返回该代码')
    item=chart['result'][0]; meta=item.get('meta',{})
    if meta.get('dataGranularity','1d')!='1d':raise ValueError('源没有返回原生日线')
    if meta.get('symbol',symbol).upper()!=symbol.upper():raise ValueError('源代码不匹配')
    prices=item['indicators']['quote'][0]; rows={}
    try:zone=ZoneInfo(meta.get('exchangeTimezoneName','UTC'))
    except Exception:zone=timezone.utc
    skipped=0
    for i,t in enumerate(item.get('timestamp',[])):
        row={k:prices.get(k,[])[i] if i<len(prices.get(k,[])) else None for k in ('open','high','low','close')}
        values=list(row.values())
        if not all(isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) and v>0 for v in values):skipped+=1;continue
        if row['low']>min(row['open'],row['close']) or row['high']<max(row['open'],row['close']):skipped+=1;continue
        day=datetime.fromtimestamp(t,zone).date().isoformat()
        rows[day]=dict(time=day,**row)
    if not rows:raise ValueError('没有有效原始 OHLC')
    return dict(symbol=symbol,data=[rows[t] for t in sorted(rows)],meta={k:meta[k] for k in ['symbol','currency','longName','shortName','instrumentType','regularMarketPrice','regularMarketTime','exchangeTimezoneName'] if k in meta},source='Yahoo Finance · 原生日线',fetched_at=int(time.time()),rejected_rows=skipped)

def download(symbol):
    query=urllib.parse.urlencode(dict(interval='1d',period1=0,period2=int(time.time()),includePrePost='false'))
    last=None
    for host in ['query1.finance.yahoo.com','query2.finance.yahoo.com']:
        try:
            url='https://'+host+'/v8/finance/chart/'+urllib.parse.quote(symbol,safe='')+'?'+query
            payload=get_json(url)
            first=payload.get('chart',{}).get('result',[{}])[0].get('meta',{}).get('firstTradeDate',0)
            if isinstance(first,(int,float)) and first<0:payload=get_json(url.replace('period1=0','period1='+str(int(first))))
            return normalize(payload,symbol)
        except Exception as error:last=error
    raise ValueError(str(last))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',default=str(ROOT/'data'));args=parser.parse_args()
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    symbols=json.loads((ROOT/'assets.json').read_text())
    assets={}; failures=[]; refreshed=[]
    def one(symbol):
        file=re.sub(r'[^A-Za-z0-9_.-]','_',symbol)+'.json';path=output/file
        try:
            data=download(symbol);path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')));ok=True
        except Exception as error:
            ok=False;failures.append(symbol)
            print('Refresh failed for '+symbol+': '+str(error),flush=True)
            # A workflow checkout contains the seed. Prefer the latest published
            # success if a later upstream request fails; never change its time.
            try:
                previous=get_json('https://gaojiangjun0805-a11y.github.io/asset-ratio-chart/data/'+file)
                if previous.get('symbol')==symbol and previous.get('data'):
                    current=json.loads(path.read_text()) if path.exists() else {}
                    if previous.get('fetched_at',0)>current.get('fetched_at',0):path.write_text(json.dumps(previous,ensure_ascii=False,separators=(',',':')))
            except Exception:pass
            if not path.exists():return symbol,None,ok
            data=json.loads(path.read_text())
        return symbol,dict(file=file,fetched_at=data['fetched_at'],name=data.get('meta',{}).get('longName',symbol),currency=data.get('meta',{}).get('currency','')),ok
    with ThreadPoolExecutor(max_workers=4) as pool:
        for symbol,entry,ok in pool.map(one,symbols):
            if entry:assets[symbol]=entry
            if ok:refreshed.append(symbol)
    required={'BTC-USD','GC=F','TSLA','QQQ'}
    if not required.issubset(assets):raise RuntimeError('默认组合缺少行情，不发布空白站点')
    manifest=dict(generated_at=int(time.time()),update_target_minutes=60,assets=assets,failed_symbols=sorted(failures))
    (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')))
    print(json.dumps(dict(available=len(assets),refreshed=len(refreshed),failed=sorted(failures)),ensure_ascii=False))

if __name__=='__main__':main()
