use mes;

 
SELECT trayID,modelId,parameter,VAHSC,interpretcode,position,K_Value,analysisDT,FileName FROM mes.testmerge_cc1orcc2 WHERE FileName IN ('CC00000022_3_20260902071206.csv')  order by ID DESC;
 
-- select * from mes.cr1bdata where Time between '2026-05-19 00:00:00' AND '2026-05-19 23:59:59' order by ID ;

-- SELECT count(distinct modelId) FROM mes.testmerge_cc1orcc2 WHERE FileName IN ('CC00000007_3_20260121201607.csv')  order by ID DESC;
 

-- select *  from mes.testmerge_pf where FileName IN ('PF00000014_1_20260831161950.csv') order by ID desc;
-- select *  from mes.testmerge_pf where modelId IN ('MW2044B25107')  order by ID desc;

-- SELECT
--     FileName,
--     EnddateD,
--     modelId
-- FROM mes.testmerge_pf
-- WHERE FileName LIKE 'K000016_202608%'
-- order by ID desc
-- LIMIT 100;

-- 搜尋無CC2紀錄標記
-- SELECT
--     t.modelId ,t.parameter , t.VAHSC ,t.interpretcode , t.position, t.FileName , t.analysisDT ,
--     CASE
--         WHEN t.parameter = '017' THEN 1
--         ELSE 0
--     END AS havefind
-- FROM mes.testmerge_cc1orcc2 t
-- WHERE t.FileName IN (
-- 'CC00000008_3_20260826043719.csv',
-- 'CC00000010_3_20260826082916.csv',
-- 'CC00000007_3_20260826100621.csv'
-- );


-- SELECT modelId,VAHSC,interpretcode,position,analysisDT,para,K_Value,FileName FROM mes.testmerge_cc1orcc2 WHERE interpretcode like '?%' order by ID DESC;


-- select * from mes.testmerge_pf where FileName IN ('K000005_20260810054158.csv');
-- SELECT * FROM mes.recycling_realtime_2 order by ID desc;

-- show create table mes.recycling_realtime_2;

-- 查詢區間內SECI 或 CHROMA 高低容量資訊query
-- SELECT modelId,VAHSC, interpretcode,position,Para,EnddateD,FileName,analysisDT
-- FROM mes.testmerge_cc1orcc2
-- WHERE parameter LIKE '017' and FileName like 'C%' and position != '32' AND  (TRIM(VAHSC) like '0' OR  TRIM(VAHSC) NOT REGEXP '^[0-9]+(\\.[0-9]+)?$')
-- WHERE parameter LIKE '017' and FileName like 'C%' and position != '32' AND TRIM(VAHSC)  REGEXP '^[0-9]+(\\.[0-9]+)?$'
--   AND STR_TO_DATE(
--         CONCAT(
--           SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
--           SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
--           CASE 
--             WHEN EnddateD LIKE '%上午%' THEN 'AM'
--             WHEN EnddateD LIKE '%下午%' THEN 'PM'
--             ELSE ''
--           END
--         ),
--         '%Y/%m/%d %I:%i:%s %p'
--       ) BETWEEN '2026-05-01 00:00:00' AND '2026-05-31 23:59:59'
-- ORDER BY
--   STR_TO_DATE(
--     CONCAT(
--       SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
--       SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
--       CASE 
--         WHEN EnddateD LIKE '%上午%' THEN 'AM'
--         WHEN EnddateD LIKE '%下午%' THEN 'PM'
--         ELSE ''
--       END
--     ),
--     '%Y/%m/%d %I:%i:%s %p'
--   ) DESC;


-- Update mes.testmerge_cc1orcc2  set position  = '32'
-- WHERE parameter LIKE '017'
--   AND STR_TO_DATE(
--         CONCAT(
--           SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
--           SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
--           CASE 
--             WHEN EnddateD LIKE '%上午%' THEN 'AM'
--             WHEN EnddateD LIKE '%下午%' THEN 'PM'
--             ELSE ''
--           END
--         ),
--         '%Y/%m/%d %I:%i:%s %p'
--       ) BETWEEN '2026/01/19 00:00:00'
--     AND '2026/01/19 23:59:59'

-- SELECT *
-- FROM mes.testmerge_cc1orcc2 
-- WHERE Para not like ''
--   AND STR_TO_DATE(
--         CONCAT(
--           SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
--           SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
--           CASE 
--             WHEN EnddateD LIKE '%上午%' THEN 'AM'
--             WHEN EnddateD LIKE '%下午%' THEN 'PM'
--             ELSE ''
--           END
--         ),
--         '%Y/%m/%d %I:%i:%s %p'
--       ) BETWEEN '2026-01-01 00:00:00' AND '2026-01-31 23:59:59'
-- ORDER BY
--   STR_TO_DATE(
--     CONCAT(
--       SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
--       SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
--       CASE 
--         WHEN EnddateD LIKE '%上午%' THEN 'AM'
--         WHEN EnddateD LIKE '%下午%' THEN 'PM'
--         ELSE ''
--       END
--     ),
--     '%Y/%m/%d %I:%i:%s %p'
--   ) DESC
--   ;


 -- 查詢電芯數量未達到36顆狀態顯示
--  SELECT 
--   distinct  FileName,
--     EnddateD,
--     COUNT(*)   AS RowCount,
--     STR_TO_DATE(
--         REPLACE(REPLACE(EnddateD, '上午', 'AM'), '下午', 'PM'),
--         '%Y/%m/%d %p%h:%i:%s'
--     ) AS ParsedTime
-- FROM mes.testmerge_cc1orcc2
-- WHERE parameter like '010' AND  STR_TO_DATE(
--             CONCAT(
--               SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
--               SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
--                CASE 
--                  WHEN EnddateD LIKE '%上午%' THEN 'AM'
--                WHEN EnddateD LIKE '%下午%' THEN 'PM'
--                 ELSE ''
--               END
--              ),
--              '%Y/%m/%d %I:%i:%s %p') BETWEEN '2026/04/01 00:00:00' AND '2026/05/31 23:59:59'
--              group by FileName
--              HAVING COUNT(*) < 36 
--              order by EnddateD DESC;

-- 查詢有空白VASHC 數量超過一顆的檔案
-- SELECT 
--   distinct  FileName,
--     EnddateD,
--     SUM(
--         CASE 
--             WHEN TRIM(IFNULL(VAHSC, '')) = '' OR TRIM(IFNULL(VAHSB, '')) = '' OR TRIM(IFNULL(VAHSA, '')) = ''
--             THEN 1
--             ELSE 0
--         END
--     ) AS NoneCount,
--     COUNT(distinct modelId)  AS RowCount,
--      STR_TO_DATE(
--         REPLACE(REPLACE(EnddateD, '上午', 'AM'), '下午', 'PM'),
--         '%Y/%m/%d %p%h:%i:%s'
--     ) AS ParsedTime
-- FROM mes.testmerge_cc1orcc2
-- WHERE parameter = '010' AND  STR_TO_DATE(
--             CONCAT(
--               SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
--               SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
--                CASE 
--                  WHEN EnddateD LIKE '%上午%' THEN 'AM'
--                WHEN EnddateD LIKE '%下午%' THEN 'PM'
--                 ELSE ''
--               END
--              ),
--              '%Y/%m/%d %I:%i:%s %p') BETWEEN '2024/01/01 00:00:00' AND '2026/08/31 23:59:59'
--              group by FileName
--              HAVING NoneCount >= 1  and  COUNT(*) >= 2
--              order by ParsedTime DESC;







