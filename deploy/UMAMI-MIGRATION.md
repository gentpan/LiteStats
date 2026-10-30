# 从 Umami 迁移历史统计

本流程适用于先检查源数据库与 Plost 的差异，再迁移历史事件。账号、站点和权限保存在 Plost PostgreSQL，事件保存在 ClickHouse。两边表结构不同，不能直接恢复 Umami 的数据库备份。

仓库提供的 [离线转换器](../app/scripts/migrate_umami.py) 只读取本地 JSON，校验后生成 ClickHouse JSONEachRow 文件和核对清单。它不连接服务器、不创建账号或站点、不执行数据库写入。导出、建站、导入和发布由操作者分别执行；生产操作前保留源库、目标库和运行配置备份。

## 建立独立目标与权限映射

先在目标实例创建或确认管理员和站点，核实所有者及站点权限。Umami 用户名、用户 ID、密码、分享凭证和权限不会自动迁移；目标账号使用 Plost 的邮箱登录方式，应单独设置和交付登录凭据。不要把源密码或分享链接复制到目标配置。

每个源站点明确对应一个目标站点整数 ID。推荐为本次迁移建立独立目标站点，保持私有，完成核验后再开放访问。目标站点设置的报表时区应与核对时区相同。转换器要求映射覆盖快照中的全部站点，拒绝未知站点、遗漏站点和多个源站点指向同一目标站点。

私密的 `mapping.json` 结构如下，占位符应替换为实际源站点标识与目标站点 ID：

```json
{
  "<source-website-id>": 1001
}
```

不要根据相似名称、表中顺序或整数碰巧相同推断对应关系。映射错误会把历史事件归到错误的站点；它也无法代替目标数据库中的所有权与访问控制。

## 导出同一时刻的源快照

先检查实际 Umami 版本和表结构。转换器需要四个数组：

| 数组 | 源表 | 关键字段 |
| --- | --- | --- |
| `websites` | `website` | `website_id`、`domain` |
| `events` | `website_event` | `event_id`、`website_id`、`session_id`、`visit_id`、`event_type`、`event_name`、`created_at` |
| `sessions` | `session` | `session_id`、`website_id` 和浏览器、地区等属性 |
| `event_data` | `event_data` | `event_data_id`、`website_id`、`website_event_id`、`data_key` 和类型化属性值 |

快照必须是一个 JSON 对象，而不是多行独立 JSON。`created_at` 使用明确的 UTC ISO 时间，允许一至六位小数秒，例如 `YYYY-MM-DDTHH:MM:SS.ffffffZ`。保留所有事件，不能通过与 `session` 的内连接导出：历史事件可能仍存在，而对应的 session 已被清理。

下面为 PostgreSQL 的结构示意。使用只读、可重复读事务导出同一个快照；将查询结果的**单个 JSON 字段**保存到私密文件，不附加命令输出、表头或行数。使用真实表结构验证后再执行。

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TIME ZONE 'UTC';

SELECT jsonb_build_object(
  'websites', COALESCE((
    SELECT jsonb_agg(to_jsonb(w) ORDER BY w.website_id)
    FROM website AS w
  ), '[]'::jsonb),
  'events', COALESCE((
    SELECT jsonb_agg(
      to_jsonb(e) || jsonb_build_object(
        'created_at', to_char(e.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z'
      ) ORDER BY e.created_at, e.event_id
    )
    FROM website_event AS e
  ), '[]'::jsonb),
  'sessions', COALESCE((
    SELECT jsonb_agg(to_jsonb(s) ORDER BY s.session_id)
    FROM session AS s
  ), '[]'::jsonb),
  'event_data', COALESCE((
    SELECT jsonb_agg(to_jsonb(d) ORDER BY d.event_data_id)
    FROM event_data AS d
  ), '[]'::jsonb)
);

COMMIT;
```

此示意假定无时区的源时间列遵循 Umami 的 UTC 存储约定；有时区的列在事务中按 UTC 格式化。若历史数据采用其他时间约定，先明确其含义并调整导出，不要仅在本地时间后追加 `Z`。大量数据应使用能保持同一事务快照的导出方式，避免各表独立导出期间发生增删改。

若只导出部分站点，四个数组必须使用相同站点范围；`event_data` 只包含快照事件的属性。若对事件使用时间窗口，也要保留这些事件所引用的 session；缺失 session 本身允许存在，孤立属性则会被拒绝。确认源库在导出期间不会清理历史数据，增量补齐结束前继续保留源数据。

## 私密保存与离线转换

快照和转换结果可能包含完整页面查询参数、引荐链接、事件属性和访客标识。使用仅当前操作者可访问的目录，目录权限设为 `700`，文件权限设为 `600`；不要放进仓库、公开下载目录、日志、工单或聊天附件。

```bash
umask 077
mkdir -p /secure/migration
chmod 700 /secure/migration
chmod 600 /secure/migration/snapshot.json /secure/migration/mapping.json

python3 app/scripts/migrate_umami.py \
  --snapshot /secure/migration/snapshot.json \
  --mapping /secure/migration/mapping.json \
  --output /secure/migration/events.jsonl \
  --manifest /secure/migration/manifest.json \
  --timezone Asia/Shanghai
```

示例路径需替换为自己的私密目录。Python 需要标准库 `zoneinfo` 和可用的时区数据库；工具不需要第三方 Python 包。`--timezone` 默认 `Asia/Shanghai`，仅影响清单中的自然日分组，输出事件时间始终为 UTC epoch 整数秒。

工具以 `600` 权限排他创建结果和清单，拒绝覆盖现有文件。校验或转换失败会删除本次创建的部分结果；修复输入后使用新的输出路径，保留之前已核验的批次。不要绕过错误继续导入。它会拒绝重复事件 ID、未知事件类型、缺失必需标识、无效时间、属性关联错误，以及自定义事件使用保留的 `pageview` 名称等歧义。

清单包含输入与结果的 SHA256、源表行数、逐站和逐日报表的事件/PV/自定义事件/去重访客/去重访问数、属性总数、缺失 session 事件数，以及小数秒截断数量。源时间范围与目标整秒时间范围分别列出。传输后核对输出文件的字节数和 SHA256，再开始暂存导入。

## 先核验暂存表，再发布

迁移前确认目标 ClickHouse 表结构与转换结果一致。使用独立暂存表导入，保持正式查询表和原有事件可用。暂存表必须与正式表的字段、引擎、分区及排序键一致；导入动作不属于转换器功能。

如果目标正式表已有数据，准备发布的暂存表必须包含这些原有数据，再追加经过事件 ID 去重的新批次。不能将“仅含源历史数据”的暂存表直接交换到已有正式表上。迁移文件本身也不能直接重复插入正式表：`MergeTree` 不提供事件 ID 唯一约束。

在暂存表完成以下核验，并保存核验结果：

1. 核对映射、站点所有者、私有状态和报表时区。
2. 逐站及逐日核对总事件、PV、自定义事件、去重用户、去重访问、时间范围和属性数量；日期分组应与清单时区一致。
3. 通过 `umami.event_id` 逐事件核对原始标识、网站标识、用户/访问标识、秒级时间及原始时间，比较 `umami.event_json`、`umami.session_json` 和 `umami.event_data_json` 中的源字段与属性。缺失 session 的事件仍须存在。
4. 验证没有未知站点、重复导入事件、遗漏属性或额外事件。若暂存表包含既有数据，分别核对原有部分与迁移部分，并核对总和。
5. 检查统计页、事件属性、地区/城市、来源和日期筛选，并检查账号与分享权限。

日期计数的 ClickHouse 查询示意如下。将表名、站点范围和时区调整为实际核验范围；正式表若混有其他数据，还需限定迁移批次。

```sql
SELECT
  site_id,
  toDate(toTimeZone(timestamp, 'Asia/Shanghai')) AS day,
  count() AS events,
  countIf(name = 'pageview') AS pageviews,
  countIf(name != 'pageview') AS custom_events,
  uniqExact(user_id) AS unique_users,
  uniqExact(session_id) AS unique_visits
FROM events_v2_stage
WHERE has(`meta.key`, 'umami.event_id')
GROUP BY site_id, day
ORDER BY site_id, day;
```

清单中的每日去重访问是“当日有事件的 visit_id 数”。跨日访问可能同时出现在两个自然日；Plost 趋势图的会话指标按所选范围内该会话首个事件所属日期归桶，因此会话趋势不能直接替代此核验查询。

最终发布前处理写入竞争：暂停目标采集写入，或采用可证明不会遗漏或重复的增量追平流程。已有写入必须全部进入准备发布的表；完成交换后再恢复采集。若数据库使用支持 `EXCHANGE TABLES` 的 Atomic 引擎，可以在核验通过后交换表名：

```sql
-- 仅为发布操作示意；先满足暂存内容与并发写入的全部前提。
EXCHANGE TABLES events_v2 AND events_v2_stage;
```

交换后原正式表保留在暂存表名下，用于审计与回退。不要立即删除它、清空统计或删除数据库卷。若环境不支持原子交换，先制定并验证等价发布方案，不要用删表重建替代。交换后的回退也要先保护已经产生的新数据，不能直接交换回旧表而丢失新增事件。

## 增量补齐与去重

源 Umami 在首次快照后仍可能接收事件。后续增量应重新取得一致快照，沿用已审核的站点映射；对照目标中的 `umami.event_id` 去重后再追加。不要只按 `created_at > 上次最大时间` 过滤：相同时间和迟到写入会造成漏数。

每条迁移记录的原事件标识可这样读取：

```sql
SELECT
  site_id,
  `meta.value`[indexOf(`meta.key`, 'umami.event_id')] AS source_event_id,
  count() AS rows
FROM events_v2
WHERE has(`meta.key`, 'umami.event_id')
GROUP BY site_id, source_event_id
HAVING rows > 1;
```

以原 `umami.event_id` 识别同一源事件，并核对其 `umami.website_id` 和目标 `site_id` 一致；不要修改历史 ID 以规避冲突。重复 ID 但内容不同应停止并调查，不能默默覆盖。现有目标中同一源事件至多保留一条；先在候选暂存数据中去重和核验，再按受控发布流程追加。属性若可能在首次事件导入后才补写，还需核对原始属性行，对已导入事件制定显式补齐方案，单纯跳过相同事件 ID 无法更新属性。

## 统计口径与保留字段

| 内容 | 迁移后的处理与限制 |
| --- | --- |
| 事件/PV | 源 `event_type=1` 写为 `pageview`，`event_type=2` 保留自定义事件名。总事件与 PV 可逐条核对。 |
| 历史访客 | `user_id` 原样使用 Umami `session_id`；不使用 `distinct_id` 替换。对应源 session 缺失也保留原 ID。 |
| 历史访问 | 目标 `session_id` 原样使用 Umami `visit_id`。不重新分配访问 ID。 |
| 时间 | ClickHouse `DateTime` 只存秒，按 UTC 向下取整。原小数秒字符串保存在 `umami.created_at` 和原始事件 JSON 中。秒内顺序、并列时间的首末页面选择可能有差异。 |
| 跳出与时长 | Plost 按所选范围及筛选后的用户/访问分组，用恰好一个 PV 计算跳出，使用首末事件的秒差计算时长。自定义事件、跨日访问、筛选、时间精度及两套系统的算法差异会影响结果，不能承诺与 Umami 看板完全一致。 |
| 来源与渠道 | 来源按 `utm_source`、去掉 `www.` 的引荐域名、`Direct` 的顺序取值；与当前 Plost 采集一致。渠道留空，不补造历史渠道；完整引荐查询参数仍保留。 |
| 属性 | 原属性键和值写入 `meta.key`/`meta.value`，包括 `text`、`url`、`query` 等。数值属性使用精确十进制字符串；完整源属性行、类型和原值另存于 `umami.event_data_json`。`umami.*` 是保留命名空间。 |
| 原始字段 | 原事件、session 和属性保存在 `umami.event_json`、`umami.session_json`、`umami.event_data_json`。额外点击标识等事件字段也可在 `umami.event.*` 读取。 |
| 城市 | 源城市文本写入 `city_name`；查询同时支持城市名称与非零 `city_geoname_id`，不要求历史数据必须存在 GeoNames 编号。没有地理信息的事件不会被补造城市。 |

历史 UV 与切换后采集的 UV 使用不同的访客标识，不能自动识别为同一人。切换边界附近的同一访客可能显示为不同访客；这不代表历史事件丢失。

## 切换站点埋点与缓存过渡

导入历史数据不会替换被统计网站里的 Umami 脚本。逐站将安装代码切换为 Plost 的 `/script.js` 和正确的 `data-domain`，并将自定义事件调用调整为 `window.plost?.track(...)`；原 `window.umami` 调用不会自动变为 Plost 事件。完整安装方式见 [README](../README.md#接入网站)。

检查页面模板、发布版本、CDN/页面缓存、Service Worker 和长期打开的页面。新旧脚本并行存在会分别写入两个系统，若把同一时间范围再次迁移到已经实时采集的目标，两个系统的事件 ID 无法自动判定为同一访问，可能造成双计数。应记录明确的迁移范围与切换边界，并将缓存过渡期间的源增量作为单独待核验范围处理。

Plost 脚本自身最多缓存五分钟，但 HTML、CDN、Service Worker 或未刷新的标签页可能更久。逐站验证新脚本加载、自定义事件和目标接收情况；不要仅凭等待固定时长就判定切换完成。原 Umami 接口与数据应保留到缓存过渡、增量核验和回退窗口结束，再按明确的退役计划停止采集。

保留源 PostgreSQL 数据库及可恢复备份、旧实例配置、映射、清单和核验记录。迁移成功不授权删除源库，也不需要清空目标历史数据。备份与迁移产物应继续按私密文件管理，并按自己的保留政策处理。
