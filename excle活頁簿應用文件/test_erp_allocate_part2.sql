use mes;
-- show create table mes.test_finalpackage;

-- select * from mes.test_finalpackage where model_combine_number like "M9%" order by id DESC;

--  select machine_workTime, PLCCellID_CE, K_Value, VAHSB, VAHSC, PLCCellIDClass_CE, PLCTrayID_CE, acirVP12_CE, acirRP12_CE, model_combine_number, last_define_location, parallel_match 
select *
         from mes.test_finalpackage  WHERE
--     `machine_workTime`  >= CURDATE()   AND  `machine_workTime` <= DATE_ADD(CURDATE(), INTERVAL 1 DAY)
--       `machine_workTime` >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND `machine_workTime` < CURDATE()
        `machine_workTime` BETWEEN '2026-09-01 00:00:00' AND '2026-09-01 23:59:59'
       order by id ASC;
 

-- SELECT
--     s.id,
--     s.`Time`,
--     s.PLCCellID_CE,
-- 	t.K_Value,
--     t.VAHSB,
--     t.VAHSC,	
--     s.PLCCellIDClass_CE,
--     s.PLCTrayID_CE,
--     s.acirVP12_CE,
--     s.acirRP12_CE
--     
-- FROM mes.schk_cellrule s

-- LEFT JOIN mes.testmerge_cc1orcc2 t
--     ON t.modelId = s.PLCCellID_CE
--     AND t.parameter = "017"

-- WHERE
--     s.PLCCellIDClass_CE = "KEF"
--     AND s.`Time` >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
--     AND s.`Time` < CURDATE()

--     AND s.PLCCellID_CE IN (
--         "MW2039B30209",
-- 		"MW2038B17237",
-- 		"MW2039B29940",
-- 		"MW2039B30131",
-- 		"MW2038B12109",
-- 		"MW2039B30387",
-- 		"MW2038B13310",
-- 		"MW2038B07999",
-- 		"MW2038B12346",
-- 		"MW2039B27020",
-- 		"MW2038B17939",
-- 		"MW2038B17946",
-- 		"MW2038B18063",
-- 		"MW2038B18394",
-- 		"MW2038B14288",
-- 		"MW2038B18092",
-- 		"MW2038B17799",
-- 		"MW2039B13720",
-- 		"MW2039B33435",
-- 		"MW2039B24830",
-- 		"MW2039B24814",
-- 		"MW2038B17971",
-- 		"MW2038B14540",
-- 		"MW2038B17952",
-- 		"MW2038B17956",
-- 		"MW2038B17962",
-- 		"MW2038B18142",
-- 		"MW2039B27330",
-- 		"MW2039B13688",
-- 		"MW2039B14568",
-- 		"MW2038B18166",
-- 		"MW2039B31078"   
--     )

-- ORDER BY s.id ASC;

-- select  id,Time , PLCCellID_CE , PLCCellIDClass_CE , PLCTrayID_CE , acirVP12_CE , acirRP12_CE from mes.schk_cellrule  
--    WHERE PLCCellIDClass_CE = "KEF" AND
--    `Time` >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND `Time` < CURDATE()
-- --  `Time`  >= CURDATE()   AND  Time <= DATE_ADD(CURDATE(), INTERVAL 1 DAY)
-- --  order by DATE_FORMAT(`Time`, '%Y-%m-%d %H:%i:%s')
--    order by id ASC;


-- select * from mes.schk_cellrule  WHERE
-- --   Time >= DATE_ADD(CURDATE(), INTERVAL-1 DAY)  AND  Time <= CURDATE()
--     Time  >= CURDATE()   AND  Time <= DATE_ADD(CURDATE(), INTERVAL 1 DAY)
-- --    `Time` >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND `Time` < CURDATE()
-- --  Time BETWEEN '2026-08-26 00:00:00' AND '2026-08-26 23:59:59'
-- --  ID between  '1770998' AND '1899999'
--   order by ID DESC 


-- 找尋目前32類組別 , 盒號, K值 組裝表單 
-- with orcuj as (
--          select 
--                PLCCellIDClass_CE as allocate_name,
--                COUNT(*) AS class_num			   
-- 			from mes.schk_cellrule  
--             where 
--  		 --      `Time` >= DATE_SUB(CURDATE(), INTERVAL   1 DAY) AND `Time` < CURDATE()
--                  `Time` >= CURDATE() AND  `Time` <= DATE_ADD(CURDATE(), INTERVAL 1 DAY)
-- 			   AND NULLIF(TRIM(PLCCellIDClass_CE), '') IS NOT NULL
-- 			GROUP BY PLCCellIDClass_CE           
--      ),
--     class_list AS (
-- 			SELECT count( DISTINCT PLCCellIDClass_CE ) AS total_class_finalnum,
-- 			DATE_FORMAT(
-- 			-- 	DATE_SUB(CURDATE(), INTERVAL 1 DAY),
--             `Time`,'%Y-%m-%d %H:%i:%s'
-- 			) AS date_search_start,
--             DATE_FORMAT(
-- 			    CURDATE(),'%Y-%m-%d %H:%i:%s'     
-- 			) AS date_search_end
-- 			FROM mes.schk_cellrule            
-- -- 			WHERE `Time` >= DATE_SUB(CURDATE(), INTERVAL  1 DAY)
-- --             AND `Time` < CURDATE()
-- 			WHERE `Time` >= CURDATE()
--   			AND `Time`  <= DATE_ADD(CURDATE(), INTERVAL  1 DAY)
--    ),
--    result AS (
-- 	SELECT		       
--         t.class_num,
-- 		t.allocate_name,        
-- 		p.total_class_finalnum,
--         p.date_search_start ,
--         p.date_search_end, 
--         ROW_NUMBER() OVER (ORDER BY t.class_num DESC) AS rn
-- 	FROM orcuj t
-- 	CROSS JOIN class_list p
--    )
--    select 
-- 	--  CASE
-- --         WHEN class_num > 32 THEN 32
-- --         ELSE class_num
-- -- 	END AS class_num,
--     class_num,
-- 	allocate_name,
--     CASE
--         WHEN rn = 1 THEN total_class_finalnum
--         ELSE ""
-- 	END AS total_class_finalnum,
--     CASE
--         WHEN rn = 1 THEN date_search_start
--         ELSE ''
--     END AS date_search_start,
--     CASE
--         WHEN rn = 1 THEN date_search_end
--         ELSE ''
--     END AS date_search_end
-- FROM result        
-- order by class_num DESC

        

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
-- select *  from mes.kvalueforprodinfo_update where CAST(ID AS UNSIGNED) > 9999999  order by ID DESC  limit 5;
