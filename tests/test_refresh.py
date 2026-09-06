import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('refresh',Path(__file__).parents[1]/'tools/refresh_quotes.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class Quotes(unittest.TestCase):
    def payload(self):
        return {'chart':{'result':[{'meta':{'symbol':'TSLA','currency':'USD','dataGranularity':'1d','exchangeTimezoneName':'America/New_York'},'timestamp':[1788528600,1788615000],'indicators':{'quote':[{'open':[350,360],'high':[370,375],'low':[340,350],'close':[360,354]}]}}]}}
    def test_native_ohlc(self):
        result=module.normalize(self.payload(),'TSLA')
        self.assertEqual(result['data'][0],dict(time='2026-09-04',open=350,high=370,low=340,close=360))
    def test_missing_wick_is_not_fabricated(self):
        p=self.payload();p['chart']['result'][0]['indicators']['quote'][0]['high'][0]=None
        result=module.normalize(p,'TSLA');self.assertEqual(len(result['data']),1);self.assertEqual(result['rejected_rows'],1)
    def test_wrong_asset_and_grain(self):
        with self.assertRaises(ValueError):module.normalize(self.payload(),'NVDA')
        p=self.payload();p['chart']['result'][0]['meta']['dataGranularity']='1mo'
        with self.assertRaises(ValueError):module.normalize(p,'TSLA')

if __name__=='__main__':unittest.main()
