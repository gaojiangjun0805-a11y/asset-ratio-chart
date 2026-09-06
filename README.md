# 盖文K线图 · GitHub Pages

此仓库对应 `https://gaojiangjun0805-a11y.github.io/asset-ratio-chart/`，独立于本机 `pair-scope` 和 `chatgpt.site` 版本。

旧版浏览器直接访问的 CORS 代理已失效。本版不再访问这些代理，也不从外部 CDN 加载图表库。默认比特币/黄金等常用资产直接读取本站 `data/` 中真实行情文件，附带资产代码、原始 OHLC、来源和取得时间。

GitHub Actions 定时更新方案已准备，启用需要 GitHub 的 workflow 授权。启用前，站内文件是本次发布取得的数据，不能视为持续更新。启用后计划每小时 17 分拉取日线并重新发布；调度可能延迟，公开仓库连续 60 天没有活动可能停用计划任务。来源失败会保留上次成功数据及原时间，更新超过 3 小时会在页面提示延迟。静态网页不是逐笔实时行情服务；自动检查按钮只检查有无新版数据。

未收录的普通美股、A 股和港股会尝试腾讯财经公开接口（不复权），并标明来源及实际覆盖日期。美股先解析完整交易所代码，避免简称端点只有两条历史的异常。常用中文公司名可搜索，三钢闽光对应 `002110.SZ`。不声称覆盖 TradingView 全部资产，或保证任意网络/数据源永远可用。

USD 为固定 1 倍基准，不做汇率换算。资产/USD 保留原 OHLC；USD/资产取倒数时交换高低。跨资产比值使用双方同日开收盘样本，周/月聚合这些样本；不拿两侧独立高低价拼成虚构影线。日线采样可能遗漏盘中波动，源没有的记录不会补造。

## 维护

```sh
python3 tools/refresh_quotes.py
node tests/market.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
python3 tools/build_site.py
```

`assets.json` 是站内行情收录表。修改后推送会更新网站，也可在 Actions 页面手动运行刷新。`data/` 为首次发布的真实行情种子；定时任务发布新的构建，不把每次更新写入 Git 历史。图表库版本为 TradingView Lightweight Charts 4.1.3，许可证及 NOTICE 位于 `vendor/`。
