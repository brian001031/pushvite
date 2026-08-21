use mes;

-- 找尋目前32類組別 , 盒號, K值 組裝表單 
-- select * from mes.schk_cellrule  where  
-- Time BETWEEN '2026-08-20 00:00:00' AND '2026-08-20 23:59:59'
-- --  ID between  '1770998' AND '1899999'
--   order by ID DESC 
  
  

-- select * from mes.schk_cellrule  where  
--  Time BETWEEN '2026-08-13 00:00:00' AND '2026-08-13 23:59:59'
--   order by ID DESC 

-- SELECT * FROM mes.erp_allocatematerials order by id desc;

-- select *  from mes.erp_allocatematerials
-- where   is_delete = 0

-- UPDATE mes.erp_allocatematerials SET is_delete = 0
-- where  form_id = '內部資訊與MIS-20260505_0002' and pur_pk_number = '89'

-- select * from mes.erp_allocatematerials
-- where  form_id = '內部資訊與MIS-20260424_0001' and pur_pk_number = '10' AND is_delete = 0

-- ALTER TABLE mes.erp_allocatematerials
-- ADD COLUMN is_allocate TINYINT(1) NOT NULL DEFAULT 0
-- AFTER iscostover;

-- ALTER TABLE mes.erp_allocatematerials
-- DROP COLUMN is_allocate;

--  UPDATE mes.erp_allocatematerials SET iscostover = 1 
--  where  form_id = '內部資訊與MIS-20260424_0001' and 
--          pur_pk_number = '10' 
-- 		AND picking_datetime IS NOT NULL
-- 		AND picking_datetime <> '0000-00-00 00:00:00'

--  查詢K值有異常的query 目前這邊只針對CC2 (017) ,下面為查詢1~8月份有異常的(K值),供參考
--  select modelId,Para,interpretcode,position,analysisDT,K_Value,FileName,
--         STR_TO_DATE(
--         CONCAT(
--             SUBSTRING_INDEX(EnddateD, ' ', 1),
--             ' ',
--             SUBSTRING_INDEX(EnddateD, ' ', -1),
--             ' ',
--             CASE
--                 WHEN EnddateD LIKE '%上午%' THEN 'AM'
--                 WHEN EnddateD LIKE '%下午%' THEN 'PM'
--             END
--         ),
--         '%Y/%m/%d %I:%i:%s %p'
--     ) AS EndDateTime
--     from mes.testmerge_cc1orcc2  WHERE parameter = '017' AND interpretcode REGEXP '^\\?' AND STR_TO_DATE(
--             CONCAT(
--               SUBSTRING_INDEX(EnddateD, ' ', 1), ' ',
--               SUBSTRING_INDEX(EnddateD, ' ', -1), ' ',
--                CASE 
--                  WHEN EnddateD LIKE '%上午%' THEN 'AM'
--                WHEN EnddateD LIKE '%下午%' THEN 'PM'
--                 ELSE ''
--               END
--              ),
--              '%Y/%m/%d %I:%i:%s %p')              
--              BETWEEN '2026-01-01 00:00:00' AND '2026-08-05 23:59:59'
--              order by EndDateTime DESC;


-- 查詢目前所有電芯CC2階段匹配之計算ACIR ACmV 校正K值(依照電芯排序對應順序)
-- SELECT
--      t.modelId ,t.K_Value , t.Para , t.VAHSC , t.FileName , t.analysisDT 
-- --    count(*)
-- FROM mes.testmerge_cc1orcc2 t 
-- WHERE
--   t.parameter like '017' and
--  t.modelId IN (
-- 	'MW2045B45588',
-- 	'MW2043B06278',
-- 	'MW2045B46192',
-- 	'MW2042B03061',
-- 	'MW2043B09839',
-- 	'MW2044B01260',
-- 	'MW2045B39739',
-- 	'MW2045B33348',
-- 	'MW2017B18542',
-- 	'MW2044B02435',
-- 	'MW2045B25257',
-- 	'MW2045B25254',
-- 	'MW2045B40502',
-- 	'MW2045B42711',
-- 	'MW2044B16901',
-- 	'MW2044B16902',
-- 	'MW2044B16903',
-- 	'MW2045B25221',
-- 	'MW2045B25217',
-- 	'MW2045B51138',
-- 	'MW2041B11217',
-- 	'MW2041B11176',
-- 	'MW2045B45747',
-- 	'MW2045B25305',
-- 	'MW2045B46191',
-- 	'MW2045B46194',
-- 	'MW2045B46190',
-- 	'MW2045B42744',
-- 	'MW2045B42207',
-- 	'MW2045B42740',
-- 	'MW2045B45737',
-- 	'MW2045B40101'
-- )
-- ORDER BY FIELD(
--   t.modelId,
--  'MW2045B45588',
-- 	'MW2043B06278',
-- 	'MW2045B46192',
-- 	'MW2042B03061',
-- 	'MW2043B09839',
-- 	'MW2044B01260',
-- 	'MW2045B39739',
-- 	'MW2045B33348',
-- 	'MW2017B18542',
-- 	'MW2044B02435',
-- 	'MW2045B25257',
-- 	'MW2045B25254',
-- 	'MW2045B40502',
-- 	'MW2045B42711',
-- 	'MW2044B16901',
-- 	'MW2044B16902',
-- 	'MW2044B16903',
-- 	'MW2045B25221',
-- 	'MW2045B25217',
-- 	'MW2045B51138',
-- 	'MW2041B11217',
-- 	'MW2041B11176',
-- 	'MW2045B45747',
-- 	'MW2045B25305',
-- 	'MW2045B46191',
-- 	'MW2045B46194',
-- 	'MW2045B46190',
-- 	'MW2045B42744',
-- 	'MW2045B42207',
-- 	'MW2045B42740',
-- 	'MW2045B45737',
-- 	'MW2045B40101'
-- );


-- 查詢K值目前最新狀態
-- select *  from mes.kvalueforprodinfo_update where updated_at between '2026-08-18 00:00:30' and '2026-08-18 23:59:59' order by ID desc limit 10;
select *  from mes.kvalueforprodinfo_update where CAST(ID AS UNSIGNED) > 9999999  order by ID DESC  limit 5;
