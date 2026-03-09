/* LIMITED SEND IDS */
CREATE OR REPLACE TEMP TABLE cqa_target_sends AS
SELECT column1::varchar AS send_id
FROM VALUES
('019c62f8-d416-41f5-f000-0000fb9e7b83'),
('019c6369-e603-4ffb-f000-0000fba196b8'),
('019c4d76-50e5-4ace-f000-0000fa817c43'),
('019c4e78-7e42-4367-f000-0000f96d5426'),
('019c496d-f8f1-4f9b-f000-0000f5237a71'),
('019c5f14-e4f9-4633-f000-0000fa6f75d6'),
('019c5812-9792-4fb0-f000-00008877f3f2'),
('019c53a3-632f-4d74-f000-00004d3134de'),
('019c77c3-2b3e-42f6-f000-000032919688'),
('019c4ef4-be93-443e-f000-0000fa8fcf50'),
('019c4367-8c88-49ac-f000-000066dc3764'),
('019c4317-01c7-4bce-f000-00000116dba2'),
('019c7c2a-4737-4ffb-f000-0000fc4f9a65'),
('019c4f37-0c53-4709-f000-000087274a7d'),
('019c5eda-3134-49d1-f000-0000fb7c9a80'),
('019c5d67-2188-49a2-f000-0000ea05a88c'),
('019c44d3-a344-495a-f000-0000d5e3a4b9'),
('019c7838-565f-4e94-f000-0000f3c38533'),
('019c7830-3bf9-4ea2-f000-0000b46ed3a0'),
('019c71bd-d6a6-45b1-f000-00004e26c979'),
('019c6cfc-b795-4e0f-f000-0000f75a6bb4'),
('019c4de3-f9ef-4476-f000-0000fa74f446'),
('019c49cd-c9ac-4bee-f000-000024fce95e'),
('019c3dce-c373-4b59-f000-000063895897'),
('019c5803-9be8-44f2-f000-0000fb284c5d'),
('019c62da-a8fc-41f7-f000-0000d25db437'),
('019c68c3-3854-49d8-f000-00009068b123'),
('019c4fbf-c711-483d-f000-0000ebe361ed'),
('019c6cc5-ed50-4b45-f000-0000fb90af02'),
('019c77af-dcb8-4dc4-f000-0000f12ff0eb'),
('019c4e31-cbfa-48c6-f000-0000d9e84d92'),
('019c4f4c-53d0-476c-f000-0000e5a63c31'),
('019c3dd0-9583-4172-f000-0000c55b4022'),
('019c7368-32a8-4a48-f000-0000fc58d672'),
('019c6d55-9123-4b9a-f000-0000a16fd718'),
('019c68e5-9224-46e7-f000-0000fbc292ee'),
('019c732d-14fd-4949-f000-0000eb100060'),
('019c6330-3ddc-49da-f000-00001160795e'),
('019c4d91-60ab-438d-f000-0000a5a5fcc9'),
('019c4e43-4417-4b5b-f000-0000fa8d263d'),
('019c6ddc-c528-4d36-f000-0000353f6e04'),
('019c5efd-8c69-4962-f000-0000fb5d6e63'),
('019c77ee-ecb4-462b-f000-0000fb8ab5dc'),
('019c6d37-a847-4598-f000-0000f34de269'),
('019c5475-dc15-44d5-f000-0000f39bbec1'),
('019c4f28-3683-4030-f000-00006929ed22'),
('019c3e78-e0fa-4552-f000-0000f7dd6ded'),
('019c5ce1-d980-4bee-f000-0000fa94e362'),
('019c53e9-3750-4dcd-f000-00001f9971f9'),
('019c68d7-c2a2-47ae-f000-0000fa4d87cd'),
('019c5f1d-2293-4f7e-f000-0000fae60cf4'),
('019c67d8-333d-4177-f000-0000f6b0f733'),
('019c5d77-dfff-44c9-f000-00003688e7b8'),
('019c7883-c202-4c2a-f000-0000be1fa438'),
('019c7341-b759-4a53-f000-0000b246fc43'),
('019c5d6a-9162-4655-f000-000057593d0e'),
('019c5cb9-6704-48ac-f000-00004ae2b0b3'),
('019c48d2-876d-467a-f000-0000f64fffb9'),
('019c495e-62b1-4a30-f000-0000eef8ab51'),
('019c3fa1-9c9d-427a-f000-0000f7317986'),
('019c7347-b6ab-472c-f000-000037de167e'),
('019c4eea-b7b2-4346-f000-0000eb570d58'),
('019c4ee0-19cf-4937-f000-000044cd6d21'),
('019c4fca-c498-4137-f000-0000fa95e86c'),
('019c5995-248d-45ee-f000-0000a76c9f02'),
('019c4d9f-df0e-447e-f000-00006bf49f38'),
('019c5414-3abf-4138-f000-0000f981103c'),
('019c7362-885f-48ec-f000-000099b1a589'),
('019c5f3a-0ee6-450a-f000-0000438f510f'),
('019c681d-d2f5-4f7e-f000-00006673545a'),
('019c6d18-b0c0-40f8-f000-00003e5ebc5f'),
('019c72be-e5f2-44b4-f000-000001a2f2d4'),
('019c7862-f1b4-4776-f000-0000fba03f2f'),
('019c5455-b964-4d59-f000-0000b6baea95'),
('019c5cca-f754-4ee5-f000-000072cf9a82'),
('019c5360-2c61-457b-f000-0000f7cfadfe'),
('019c6e16-4739-44d5-f000-0000c7753686'),
('019c3f85-0e83-409b-f000-0000019e6658'),
('019c5876-050c-4f64-f000-00004d7b10ab'),
('019c77e5-e5f3-4d5a-f000-0000a679a0be'),
('019c4e8b-ae00-4d44-f000-000020d62645'),
('019c49aa-cd14-4468-f000-0000f0a6d3f9'),
('019c71b5-6733-4d63-f000-0000fc3d1b36'),
('019c5cfd-febc-463f-f000-00004b414589'),
('019c48eb-1827-470a-f000-0000ac913529'),
('019c68b1-9930-4c08-f000-0000fa795c22'),
('019c5f0d-4b22-4212-f000-0000fb8b973f'),
('019c77b5-8a8e-46f0-f000-0000fc6deb9f'),
('019c6814-373f-4fd0-f000-0000f8177ebe'),
('019c449e-fb85-4f71-f000-0000fa4e2a2a'),
('019c49b9-b21a-4b23-f000-00000b6a5a4c'),
('019c6345-fe76-466d-f000-0000f52ffb2a'),
('019c4334-a7ba-4860-f000-0000b8b9375f'),
('019c53b5-b9d2-4f86-f000-0000fae50ccc'),
('019c4a2e-f8aa-415a-f000-0000d9f78ef3'),
('019c3f86-19a6-470a-f000-0000cfc3ff8e'),
('019c5860-9165-4455-f000-0000b502d96c'),
('019c77d7-bf24-424c-f000-0000ee1089ae'),
('019c53a9-b32f-4c22-f000-0000b2484ba5'),
('019c733a-6590-490a-f000-0000fc568aee'),
('019c76f8-5cf1-4915-f000-0000f4ac4809'),
('019c7227-d454-4da4-f000-0000585438f7'),
('019c53f6-7a4e-47c5-f000-000088cc1270'),
('019c4ef6-c4e5-4d77-f000-0000a045b43b'),
('019c49c1-2cea-404d-f000-00009d28ec08'),
('019c538d-82a8-4187-f000-0000fae3a890'),
('019c53c7-8b31-4507-f000-0000fa8d62ca'),
('019c783d-36b5-4cfb-f000-0000fa601e89'),
('019c5d46-d70f-46e5-f000-0000f8095aa6'),
('019c3e83-a368-4179-f000-0000fa104d95'),
('019c533a-e2f7-45c4-f000-0000ef3c25f9'),
('019c6e1f-4f22-4780-f000-0000ee0e7616'),
('019c5d96-df41-4c87-f000-0000f5aaf08c'),
('019c4eb0-cba6-4733-f000-0000fa6b155b'),
('019c4e85-7574-45f2-f000-00001958e645'),
('019c544f-1d03-4e71-f000-0000d1185797'),
('019c595f-8c60-47fe-f000-0000faa650bf'),
('019c4ddd-3a89-4aa0-f000-0000595a7157'),
('019c52e6-9a6c-402f-f000-0000d470bc86'),
('019c6df6-d25a-4597-f000-00004e76a04b'),
('019c6e26-fd32-48c5-f000-0000fbf12996'),
('019c62b2-f6a2-41df-f000-0000860952bd'),
('019c49f9-88c2-4d42-f000-0000b7c1eed3'),
('019c5964-179c-4db5-f000-0000d48d6b35'),
('019c727a-5bbe-41af-f000-00000e864995');

/*==============================================================
1) CONTEXT TABLES (UTC predicates, EST for display)
==============================================================*/
CREATE OR REPLACE TEMP TABLE cqa_send_bounds AS
WITH target_send_events AS (
    SELECT
        dae.session_id,
        dae.send_id,
        dae.created AS send_created_utc,
        CONVERT_TIMEZONE('UTC','America/New_York', dae.created) AS send_created_est,
        dae.subscriber_id,
        dae.company_id,
        dae.user_id
    FROM dw_concierge.dim_agent_events dae
    JOIN cqa_target_sends ts
        ON ts.send_id = dae.send_id
    WHERE dae.event = 'SEND'
),

base_events AS (
    SELECT
        tse.session_id,
        tse.send_id,
        tse.send_created_utc AS event_time_utc,
        tse.send_created_est AS event_time_est,
        tse.subscriber_id,
        tse.company_id,
        tse.user_id,
        'SEND' AS event,
        NULL::STRING AS escalation_note,
        NULL::STRING AS template_title,
        NULL::TIMESTAMP_NTZ AS template_last_updated,
        2 AS sort_key
    FROM target_send_events tse

    UNION ALL

    SELECT
        tse.session_id,
        tse.send_id,
        e.created AS event_time_utc,
        CONVERT_TIMEZONE('UTC','America/New_York', e.created) AS event_time_est,
        tse.subscriber_id,
        tse.company_id,
        tse.user_id,
        'ESCALATED' AS event,
        e.note AS escalation_note,
        NULL::STRING AS template_title,
        NULL::TIMESTAMP_NTZ AS template_last_updated,
        0 AS sort_key
    FROM target_send_events tse
    JOIN concierge.escalations e
        ON e.user_id = tse.user_id
    WHERE e.created BETWEEN DATEADD(day, -30, tse.send_created_utc) AND tse.send_created_utc

    UNION ALL

    SELECT
        tse.session_id,
        tse.send_id,
        tu.created AS event_time_utc,
        CONVERT_TIMEZONE('UTC','America/New_York', tu.created) AS event_time_est,
        tse.subscriber_id,
        tse.company_id,
        tse.user_id,
        'TEMPLATE_USED' AS event,
        NULL::STRING AS escalation_note,
        temp.title AS template_title,
        tl.last_updated AS template_last_updated,
        1 AS sort_key
    FROM target_send_events tse
    JOIN concierge.agent_template_usage tu
        ON tu.send_id = tse.send_id
    LEFT JOIN concierge.agent_templates temp
        ON temp.id = tu.template_id
    LEFT JOIN (
        SELECT template_id, MAX(created) AS last_updated
        FROM concierge.agent_template_events
        GROUP BY 1
    ) tl
        ON tl.template_id = tu.template_id
    WHERE tu.created <= tse.send_created_utc
),

send_anchor AS (
    SELECT
        send_id,
        MAX(IFF(event = 'SEND', event_time_utc, NULL)) AS send_time_utc,
        MAX(IFF(event = 'SEND', event_time_est, NULL)) AS send_time_est
    FROM base_events
    GROUP BY 1
)

SELECT
    be.session_id,
    be.send_id,
    sa.send_time_utc AS send_time_utc,
    DATEADD(day, -30, sa.send_time_utc) AS window_start_utc,
    sa.send_time_utc AS window_end_utc,
    sa.send_time_est AS send_time_est,
    be.subscriber_id,
    be.user_id,
    dc.company_name,
    be.company_id,
    CONCAT('https://', dc.company_domain) AS company_website,
    bvs.message_tone,
    bvs.agent_name AS persona,
    bvs.escalation_topics,
    bvs.blocklisted_words,
    cn.note AS company_notes,

    /* optional rollups you can use later */
    ARRAY_COMPACT(
        ARRAY_AGG(
            IFF(be.event = 'ESCALATED',
                OBJECT_CONSTRUCT(
                    'note', be.escalation_note,
                    'created_at_utc', be.event_time_utc
                ),
                NULL
            )
        ) WITHIN GROUP (ORDER BY be.event_time_utc ASC)
    ) AS escalation_notes,
    ARRAY_COMPACT(
      ARRAY_AGG(
        IFF(be.event='TEMPLATE_USED' AND be.template_title IS NOT NULL,
          OBJECT_CONSTRUCT(
            'template_title', be.template_title,
            'last_updated', be.template_last_updated,
            'used_at_utc', be.event_time_utc
      ),
      NULL
    )
  )
) AS template_used

FROM base_events be
JOIN send_anchor sa
    ON sa.send_id = be.send_id
LEFT JOIN dw.dim_company dc
    ON dc.company_id = be.company_id
LEFT JOIN concierge.brand_voice_settings bvs
    ON bvs.company_id = be.company_id
LEFT JOIN concierge.company_notes cn
    ON cn.company_id = be.company_id
GROUP BY
    be.session_id,
    be.send_id,
    sa.send_time_utc,
    sa.send_time_est,
    be.subscriber_id,
    be.user_id,
    dc.company_name,
    be.company_id,
    dc.company_domain,
    bvs.message_tone,
    bvs.agent_name,
    bvs.escalation_topics,
    bvs.blocklisted_words,
    cn.note
QUALIFY ROW_NUMBER() OVER (PARTITION BY be.send_id ORDER BY sa.send_time_utc DESC) = 1;

CREATE OR REPLACE TEMP TABLE subscribers_scoped AS
SELECT
send_id, session_id, subscriber_id, user_id,
send_time_utc, window_start_utc, window_end_utc, send_time_est, company_id
FROM cqa_send_bounds;

CREATE OR REPLACE TEMP TABLE cqa_global_window AS
SELECT
MIN(window_start_utc) AS min_start_utc,
MAX(window_end_utc) AS max_end_utc
FROM subscribers_scoped;

CREATE OR REPLACE TEMP TABLE cqa_subscriber_windows AS
SELECT subscriber_id, MIN(window_start_utc) AS min_start_utc, MAX(window_end_utc) AS max_end_utc
FROM subscribers_scoped
GROUP BY 1;

CREATE OR REPLACE TEMP TABLE cqa_session_windows AS
SELECT session_id, MIN(window_start_utc) AS min_start_utc, MAX(window_end_utc) AS max_end_utc
FROM subscribers_scoped
GROUP BY 1;

/*==============================================================
1.5) PRUNE HEAVY EVENT TABLES (biggest speedup)
==============================================================*/
CREATE OR REPLACE TEMP TABLE subs_in_scope AS
SELECT DISTINCT subscriber_id, user_id, company_id FROM subscribers_scoped;

/* Product views pruned to one latest event per (user_id, product_product_id) */
CREATE OR REPLACE TEMP TABLE epv_pruned AS
SELECT
    s.user_id,
    epv.product_product_id,
    epv.product_name,
    epv.request_url,
    epv.event_datetime
FROM subs_in_scope s
INNER JOIN events.events_product_view epv
    ON epv.user_identity_matched_users_primary_user_match_user_id = s.user_id
QUALIFY ROW_NUMBER() OVER (
    PARTITION BY s.user_id, epv.product_product_id
    ORDER BY epv.event_datetime DESC
) = 1;
    
/* Purchases/orders pruned to subs across all history */
CREATE OR REPLACE TEMP TABLE ep_pruned AS
WITH products_agg AS (
    SELECT 
        p.user_identity_matched_users_primary_user_match_user_id AS user_id,
        p.cart_order_id AS order_id,
        p.cart_currency AS currency,
        p.cart_total AS total,
        p.cart_coupon AS coupon,
        p.cart_discount AS discount,
        p.event_datetime,
        ARRAY_AGG(DISTINCT
            OBJECT_CONSTRUCT(
                'product_currency', product_currency,
                'product_id', product_product_id,
                'product_link', pc.link,
                'product_name', product_name,
                'product_price', product_price
            )
        ) AS products,
        ROW_NUMBER() OVER (
            PARTITION BY p.user_identity_matched_users_primary_user_match_user_id
            ORDER BY p.event_datetime DESC
        ) AS rn
    FROM attentive.events.events_purchase p
    LEFT JOIN data_lake_prod.product_catalog.products pc
        ON pc.origin_id = p.product_product_id
    JOIN subs_in_scope s
        ON s.user_id = p.user_identity_matched_users_primary_user_match_user_id
    GROUP BY 1, 2, 3, 4, 5, 6, 7
),
order_links AS (
    SELECT     
        o.user_identity_matched_users_primary_user_match_user_id AS user_id,
        o.event_order_id AS order_id,
        o.event_order_number AS order_number,
        o.event_order_status_url AS order_status_url,
        o.event_tracking_url AS order_tracking_url,
        o.event_datetime,
        ROW_NUMBER() OVER (PARTITION BY o.user_identity_matched_users_primary_user_match_user_id, o.event_order_id ORDER BY o.event_datetime DESC) AS rn
    FROM attentive.events.events_order o
    JOIN subs_in_scope s
        ON s.user_id = o.user_identity_matched_users_primary_user_match_user_id
)
SELECT 
    p.user_id,
    p.order_id,
    p.event_datetime,
    ARRAY_AGG(
        OBJECT_CONSTRUCT(
            'currency', p.currency,
            'order_id', p.order_id::VARCHAR,
            'order_number', COALESCE(ol.order_number, p.order_id::VARCHAR),
            'order_status_link', ol.order_status_url,
            'order_tracking_link', ol.order_tracking_url,
            'products', p.products,
            'coupon', p.coupon,
            'discount_amount', p.discount,
            'total', p.total
        )
    ) AS orders
FROM products_agg p
LEFT JOIN order_links ol
    ON p.user_id = ol.user_id
    AND p.order_id = ol.order_id
    AND ol.rn = 1
GROUP BY p.order_id, p.user_id, p.event_datetime;

/* MAIN QUERY */
WITH gw AS (
    SELECT
        min_start_utc,
        max_end_utc
    FROM cqa_global_window
),

/* ---- System (non-concierge) messages in subscriber windows ---- */
system_messages_pruned AS (
    SELECT
        'SYSTEM' AS event,
        CONVERT_TIMEZONE('UTC','America/New_York', emr.event_datetime) AS time_est,
        emr.subscriber_id,
        emr.event_message_text AS text
    FROM events.events_message_receipt emr
    WHERE
        emr.message_type <> 'CONCIERGE'
        AND emr.message_subtype <> 'CONCIERGE'
        AND emr.event_datetime BETWEEN (SELECT min_start_utc FROM gw) AND (SELECT max_end_utc FROM gw)
        AND EXISTS (
            SELECT 1
            FROM cqa_subscriber_windows sw
            WHERE
                sw.subscriber_id = emr.subscriber_id
                AND emr.event_datetime BETWEEN sw.min_start_utc AND sw.max_end_utc
        )
),

/* ---- Product views (<= send_time only), include view_date yyyy-mm-dd ---- */
epv_src AS (
    SELECT
        s.send_id,
        p.user_id,
        p.product_name,
        p.request_url,
        TO_CHAR(p.event_datetime::DATE, 'YYYY-MM-DD') AS view_date,
        ROW_NUMBER() OVER (
            PARTITION BY s.send_id, p.user_id
            ORDER BY p.event_datetime DESC
        ) AS rn
    FROM subscribers_scoped s
    JOIN epv_pruned p
        ON p.user_id = s.user_id
        AND p.event_datetime < s.send_time_utc
),
last_5_products AS (
    SELECT
        send_id,
        user_id,
        ARRAY_AGG(
            OBJECT_CONSTRUCT(
                'product_name', product_name,
                'product_link', request_url,
                'view_date', view_date
            )
        ) WITHIN GROUP (ORDER BY rn) AS last_5_products
    FROM epv_src
    WHERE rn <= 5
    GROUP BY 1, 2
),

/* ---- Unified Orders (use ep_pruned as-built: flatten ep_pruned.orders; rank last 5 per send) ---- */
orders_src AS (
    SELECT
        s.send_id,
        s.user_id,
        ep.event_datetime AS order_time_utc,
        f.value::VARIANT AS order_obj
    FROM subscribers_scoped s
    JOIN ep_pruned ep
        ON ep.user_id = s.user_id
        AND ep.event_datetime < s.send_time_utc
    , LATERAL FLATTEN(input => ep.orders) f
),
orders_ranked AS (
    SELECT
        send_id,
        user_id,
        order_time_utc,
        OBJECT_INSERT(
            OBJECT_INSERT(
                order_obj,
                'order_date',
                TO_CHAR(order_time_utc::DATE, 'YYYY-MM-DD'),
                TRUE
            ),
            'date_time',
            order_time_utc,
            TRUE
        ) AS order_obj_with_date,
        ROW_NUMBER() OVER (
            PARTITION BY send_id, user_id
            ORDER BY order_time_utc DESC
        ) AS rn
    FROM orders_src
),
unified_orders AS (
    SELECT
        send_id,
        user_id,
        ARRAY_AGG(order_obj_with_date) WITHIN GROUP (ORDER BY rn) AS orders
    FROM orders_ranked
    WHERE rn <= 5
    GROUP BY 1, 2
),

/* ---- Coupons (subscriber match first; otherwise company-level fallback) ---- */
coupon_data_subscriber AS (
    SELECT
        s.send_id,
        ARRAY_AGG(
            DISTINCT OBJECT_CONSTRUCT(
                'company_id', cs.company_id,
                'subscriber_id', ca.subscriber_id,
                'name', cs.name,
                'description', cs.description,
                'static_code', cs.static_code,
                'value', cs.value,
                'value_type', cs.value_type,
                'coupon', ca.coupon,
                'coupon_url', ca.coupon_url,
                'redemption_status', IFF(ca.redeemed IS NOT NULL, 'USED', 'UNUSED')
            )
        ) AS coupons
    FROM subscribers_scoped s
    JOIN attentive.incentives.coupon_sets cs
        ON cs.company_id = s.company_id
    LEFT JOIN attentive.incentives.coupon_assignments ca
        ON ca.coupon_set_id = cs.id
    LEFT JOIN attentive.incentives.coupons c
        ON c.id = ca.coupon_id
    WHERE ca.subscriber_id = s.subscriber_id
    GROUP BY 1
),

coupon_data_company AS (
    SELECT
        s.send_id,
        ARRAY_AGG(
            DISTINCT OBJECT_CONSTRUCT(
                'company_id', cs.company_id,
                'subscriber_id', ca.subscriber_id,
                'name', cs.name,
                'description', cs.description,
                'static_code', cs.static_code,
                'value', cs.value,
                'value_type', cs.value_type,
                'coupon', ca.coupon,
                'coupon_url', ca.coupon_url,
                'redemption_status', IFF(ca.redeemed IS NOT NULL, 'USED', 'UNUSED')
            )
        ) AS coupons
    FROM subscribers_scoped s
    JOIN attentive.incentives.coupon_sets cs
        ON cs.company_id = s.company_id
    LEFT JOIN attentive.incentives.coupon_assignments ca
        ON ca.coupon_set_id = cs.id
    LEFT JOIN attentive.incentives.coupons c
        ON c.id = ca.coupon_id
    WHERE ca.subscriber_id IS NULL
    GROUP BY 1
),

coupon_data AS (
    SELECT
        cds.send_id,
        cds.coupons
    FROM coupon_data_subscriber cds

    UNION ALL

    SELECT
        cdc.send_id,
        cdc.coupons
    FROM coupon_data_company cdc
    WHERE NOT EXISTS (
        SELECT 1
        FROM coupon_data_subscriber cds
        WHERE cds.send_id = cdc.send_id
    )
),

/* ---- Receive events (for images) pruned to global window ---- */
receive_events_pruned AS (
    SELECT
        re.subscriber_id,
        re.created,
        re.text,
        re.media
    FROM dw_events.receive_events re
    WHERE re.created BETWEEN (SELECT min_start_utc FROM gw) AND (SELECT max_end_utc FROM gw)
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY re.subscriber_id, re.created, re.text, re.media
        ORDER BY re.created DESC
    ) = 1
),

/* ---- Images per inbound message (join on subscriber_id + message text) ---- */
inbound_message_images AS (
    SELECT
        s.send_id,
        s.session_id,
        s.subscriber_id,
        inb.bi_id AS inbound_messages_bi_id,
        ARRAY_AGG(re.media) AS images
    FROM subscribers_scoped s
    JOIN concierge.inbound_messages inb
        ON inb.subscriber_id = s.subscriber_id
    LEFT JOIN receive_events_pruned re
        ON re.subscriber_id = inb.subscriber_id
        AND re.text = inb.message_body
    WHERE
        re.media IS NOT NULL
        AND re.media <> '[]'
    GROUP BY 1,2,3,4
),

/* ---- Concierge events/messages ---- */
dae_pruned AS (
    SELECT
        d.session_id,
        d.event,
        d.created AS created_utc,
        d.inbound_messages_bi_id,
        d.send_id,
        d.agent_id,
        d.user_id
    FROM dw_concierge.dim_agent_events d
    JOIN cqa_session_windows sw
        ON sw.session_id = d.session_id
        AND d.created BETWEEN sw.min_start_utc AND sw.max_end_utc
    WHERE d.event IN ('SEND','RECEIVE')  -- templates/escalations now come from cqa_send_bounds rollups
),

event_msgs_receive AS (
    SELECT
        d.session_id,
        s.subscriber_id,
        'subscriber' AS role,
        'RECEIVE' AS event_type,
        CONVERT_TIMEZONE('UTC','America/New_York', d.created_utc) AS message_time,
        inb.message_body AS text,
        s.send_id AS send_id,
        NULL::STRING AS agent_send_id,
        imi.images AS images,
        NULL::NUMBER AS agent_id
    FROM dae_pruned d
    JOIN subscribers_scoped s
        ON s.session_id = d.session_id
        AND d.created_utc BETWEEN s.window_start_utc AND s.window_end_utc
    JOIN concierge.inbound_messages inb
        ON inb.bi_id = d.inbound_messages_bi_id
    LEFT JOIN inbound_message_images imi
        ON imi.send_id = s.send_id
        AND imi.session_id = d.session_id
        AND imi.subscriber_id = s.subscriber_id
        AND imi.inbound_messages_bi_id = inb.bi_id
    WHERE d.event = 'RECEIVE'
),

event_msgs_send AS (
    SELECT
        d.session_id,
        s.subscriber_id,
        'agent' AS role,
        'SEND' AS event_type,
        CONVERT_TIMEZONE('UTC','America/New_York', d.created_utc) AS message_time,
        aom.body AS text,
        s.send_id AS send_id,
        d.send_id AS agent_send_id,
        NULL::VARIANT AS images,
        d.agent_id
    FROM dae_pruned d
    JOIN subscribers_scoped s
        ON s.session_id = d.session_id
        AND d.created_utc <= DATEADD(second, 1, s.window_end_utc)
    JOIN concierge.agent_outbound_messages aom
        ON aom.send_id = d.send_id
    WHERE d.event = 'SEND'
),

/* ---- TEMPLATE_USED events (from cqa_send_bounds.template_used rollup) ---- */
template_events AS (
    SELECT
        sb.session_id,
        sb.subscriber_id,
        'template' AS role,
        'TEMPLATE_USED' AS event_type,
        CONVERT_TIMEZONE('UTC','America/New_York', tu.value:"used_at_utc"::TIMESTAMP_NTZ) AS message_time,
        CONCAT(
            'Template used: "',
            tu.value:"template_title"::STRING,
            '"; last updated: ',
            tu.value:"last_updated"::STRING
        ) AS text,
        sb.send_id AS send_id,
        NULL::STRING AS agent_send_id,
        NULL::VARIANT AS images,
        NULL::NUMBER AS agent_id
    FROM cqa_send_bounds sb,
         LATERAL FLATTEN(input => sb.template_used) tu
),

/* ---- ESCALATED events (from cqa_send_bounds.escalation_notes rollup) ---- */
escalation_events AS (
    SELECT
        sb.session_id,
        sb.subscriber_id,
        'escalation' AS role,
        'ESCALATED' AS event_type,
        CONVERT_TIMEZONE('UTC','America/New_York', en.value:"created_at_utc"::TIMESTAMP_NTZ) AS message_time,
        en.value:"note"::STRING AS text,
        sb.send_id AS send_id,
        NULL::STRING AS agent_send_id,
        NULL::VARIANT AS images,
        NULL::NUMBER AS agent_id
    FROM cqa_send_bounds sb,
         LATERAL FLATTEN(input => sb.escalation_notes) en
    WHERE
        en.value:"note" IS NOT NULL
),

system_msgs_windowed AS (
    SELECT
        s.session_id,
        s.subscriber_id,
        'system' AS role,
        sm.event AS event_type,
        sm.time_est AS message_time,
        sm.text AS text,
        s.send_id AS send_id,
        NULL::STRING AS agent_send_id,
        NULL::VARIANT AS images,
        NULL::NUMBER AS agent_id
    FROM system_messages_pruned sm
    JOIN subscribers_scoped s
        ON s.subscriber_id = sm.subscriber_id
        AND sm.time_est BETWEEN CONVERT_TIMEZONE('UTC','America/New_York', s.window_start_utc)
                          AND CONVERT_TIMEZONE('UTC','America/New_York', s.window_end_utc)
),

combined_msgs AS (
    SELECT * FROM event_msgs_receive
    UNION ALL
    SELECT * FROM event_msgs_send
    UNION ALL
    SELECT * FROM template_events
    UNION ALL
    SELECT * FROM escalation_events
    UNION ALL
    SELECT * FROM system_msgs_windowed
),

conversation_json AS (
    SELECT
        cm.send_id,
        cm.session_id,
        ARRAY_AGG(
            OBJECT_CONSTRUCT(
                'date_time', cm.message_time,
                'message_type',
                    CASE
                        WHEN cm.event_type = 'TEMPLATE_USED' THEN 'template'
                        WHEN cm.event_type = 'ESCALATED' THEN 'escalation'
                        WHEN cm.role = 'subscriber' THEN 'customer'
                        WHEN cm.role = 'agent' THEN 'agent'
                        ELSE 'system'
                    END,
                'message_text', cm.text,
                'message_media', COALESCE(cm.images, ARRAY_CONSTRUCT()),
                'message_id', COALESCE(cm.agent_send_id, NULL),
                'agent', COALESCE(cm.agent_id, NULL)
            )
        ) WITHIN GROUP (
            ORDER BY
                cm.message_time,
                CASE
                    WHEN cm.role = 'escalation' THEN 0
                    WHEN cm.role = 'template' THEN 1
                    WHEN cm.event_type = 'SEND' THEN 2
                    ELSE 3
                END
        ) AS messages
    FROM combined_msgs cm
    GROUP BY 1,2
)

/* Debug: check row counts at each step
SELECT 'subscribers_scoped' AS step, COUNT(*) AS cnt FROM subscribers_scoped
UNION ALL SELECT 'conversation_json', COUNT(*) FROM conversation_json
UNION ALL SELECT 'cqa_send_bounds', COUNT(*) FROM cqa_send_bounds
UNION ALL SELECT 'last_5_products', COUNT(*) FROM last_5_products
UNION ALL SELECT 'unified_orders', COUNT(*) FROM unified_orders
ORDER BY 2 DESC; */

SELECT
    cj.send_id,
    dc.has_shopify_ecomm_flag AS has_shopify,
    sb.company_name,
    sb.company_website,
    sb.persona,
    CASE
        WHEN sb.message_tone = 'MESSAGE_TONE_FORMAL' THEN 'Formal'
        WHEN sb.message_tone = 'MESSAGE_TONE_CASUAL' THEN 'Casual'
        WHEN sb.message_tone = 'MESSAGE_TONE_SUPER_CASUAL' THEN 'Super Casual'
        WHEN sb.message_tone = 'MESSAGE_TONE_POLISHED' THEN 'Polished'
        ELSE 'Polished'
    END AS message_tone,
    cj.messages AS conversation_json,
    l5p.last_5_products,
    uo.orders,
    COALESCE(cd.coupons, ARRAY_CONSTRUCT()) AS coupons,
    sb.company_notes,
    sb.escalation_topics,
    sb.blocklisted_words
FROM conversation_json cj
JOIN cqa_send_bounds sb
    ON sb.session_id = cj.session_id
    AND sb.send_id = cj.send_id
LEFT JOIN dw.dim_company dc
    ON dc.company_id = sb.company_id
LEFT JOIN last_5_products l5p
    ON l5p.send_id = cj.send_id
    AND l5p.user_id = sb.user_id
LEFT JOIN unified_orders uo
    ON uo.send_id = cj.send_id
    AND uo.user_id = sb.user_id
LEFT JOIN coupon_data cd
    ON cd.send_id = cj.send_id
QUALIFY ROW_NUMBER() OVER (PARTITION BY cj.send_id ORDER BY sb.send_time_est DESC) = 1;
