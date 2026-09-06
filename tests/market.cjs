const assert=require('node:assert/strict');
const M=require('../market.js');
const rows=[
 {time:'2026-09-01',open:10,high:15,low:8,close:12},
 {time:'2026-09-02',open:12,high:18,low:11,close:16},
 {time:'2026-09-07',open:16,high:20,low:14,close:19}
];
assert.deepEqual(M.aggregate(rows,'1wk'),[
 {time:'2026-08-31',open:10,high:18,low:8,close:16},
 {time:'2026-09-07',open:16,high:20,low:14,close:19}
]);
assert.deepEqual(M.reference(rows,true)[0],{time:'2026-09-01',open:.1,high:1/8,low:1/15,close:1/12});
// Separate market highs/lows must not be divided into fictional ratio wicks.
assert.deepEqual(M.ratio(rows,[{time:'2026-09-01',open:2,high:20,low:1,close:3}]),[
 {time:'2026-09-01',open:5,high:5,low:4,close:4}
]);
assert.throws(()=>M.validate({symbol:'NVDA',data:rows},'TSLA'),/不匹配/);
assert.throws(()=>M.validate({symbol:'TSLA',data:[{...rows[0],high:9}]},'TSLA'),/高低价/);
assert.deepEqual(M.tencentId('002110.SZ'),'sz002110');
assert.deepEqual(M.tencentId('0700.HK'),'hk00700');
assert.deepEqual(M.tencentId('TSLA'),'usTSLA');
assert.equal(M.tencentId('BTC-USD'),null);
assert.equal(M.tencentId('GC=F'),null);
assert.deepEqual(M.parseTencent({code:0,data:{sz002110:{day:[['2026-09-04','3.1','3.04','3.2','3.0']],qt:{sz002110:['','三钢闽光','002110']}}}},'sz002110','002110.SZ').data,[{time:'2026-09-04',open:3.1,close:3.04,high:3.2,low:3}]);
(async()=>{
 const urls=[];
 const mock=async url=>{urls.push(url);if(url.includes('manifest.json'))return {ok:true,json:async()=>({assets:{TSLA:{file:'TSLA.json'}}})};return {ok:true,json:async()=>({symbol:'TSLA',data:rows,meta:{currency:'USD'},fetched_at:Date.now()/1000,source:'Yahoo Finance'})};};
 const read=M.createReader({fetch:mock});
 const result=await read('TSLA','max','1d');
 assert.deepEqual(result.data,rows);assert.equal(result.source,'Yahoo Finance');
 assert.ok(urls.every(u=>u.startsWith('./data/')));
 const weekly=await read('TSLA','max','1wk');assert.equal(weekly.data[0].high,18);
 console.log('PASS: same-origin data, source identity, native wicks, inverse, sampled ratios, calendar aggregation and Chinese stock mapping.');
})().catch(e=>{console.error(e);process.exitCode=1;});
